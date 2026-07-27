/**
 * founder-slots-remaining — public read-only endpoint that exposes ONLY
 * the integer count returned by public.founder_lifetime_slots_remaining().
 *
 * SAFETY:
 *  - No user data, no billing rows, no Paddle IDs — just an integer.
 *  - Executed with the service-role client purely so it can invoke the
 *    SECURITY DEFINER RPC without requiring the /pricing viewer to be
 *    signed in.
 *  - Errors are sanitized. Fail-closed by returning 503; the pricing card
 *    then falls back to its static cap copy.
 *
 * OBSERVABILITY:
 *  - Every log line is a single-line JSON object with a stable `event`
 *    code and `fn: "founder-slots-remaining"` so external log
 *    tailers/alerts can key off `event` without regex parsing.
 *  - Startup import is wrapped in try/catch and logged as
 *    `startup_import_failed` (severity=critical) so module-load crashes —
 *    the class of failure that produces platform 500s before Deno.serve
 *    can respond — surface as an alertable structured event rather than
 *    an opaque boot log.
 */

const FN = "founder-slots-remaining";
const CACHE_SECONDS = 30;

type Severity = "info" | "warn" | "error" | "critical";

interface LogFields {
  event: string;
  severity: Severity;
  [key: string]: unknown;
}

function log(fields: LogFields): void {
  const line = JSON.stringify({
    fn: FN,
    ts: new Date().toISOString(),
    ...fields,
  });
  if (fields.severity === "error" || fields.severity === "critical") {
    console.error(line);
  } else if (fields.severity === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(status: number, body: object, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...headers,
    },
  });
}

// Load module dependencies lazily inside a try/catch so any import failure
// (bad npm subpath, network hiccup, ESM parse error) is captured as an
// alertable `startup_import_failed` event instead of a silent module-load
// crash that the platform surfaces to callers as a bare HTTP 500.
type CreateClientFn = typeof import("npm:@supabase/supabase-js@2")["createClient"];
type BuildPayloadFn = typeof import("./contract.ts")["buildFounderSlotsPayload"];

interface Deps {
  createClient: CreateClientFn;
  buildFounderSlotsPayload: BuildPayloadFn;
}

let depsPromise: Promise<Deps> | null = null;
let depsLoaderOverride: (() => Promise<Deps>) | null = null;

/**
 * Test-only hook. Lets suites simulate module-load/import failures
 * (bad npm subpath, network hiccup, ESM parse error) without having to
 * actually break the real dynamic imports. Pass `null` to restore the
 * default behavior.
 */
export function __setDepsLoaderForTesting(
  loader: (() => Promise<Deps>) | null,
): void {
  depsLoaderOverride = loader;
  depsPromise = null;
}

function loadDeps(): Promise<Deps> {
  if (depsPromise) return depsPromise;
  const loader = depsLoaderOverride ?? (async () => {
    const [{ createClient }, { buildFounderSlotsPayload }] = await Promise.all([
      import("npm:@supabase/supabase-js@2"),
      import("./contract.ts"),
    ]);
    return { createClient, buildFounderSlotsPayload };
  });
  depsPromise = (async () => {
    try {
      const deps = await loader();
      log({ event: "startup_imports_loaded", severity: "info" });
      return deps;
    } catch (err) {
      // Reset so a transient failure (e.g. cold-boot registry blip) can
      // retry on the next request instead of pinning the failure state.
      depsPromise = null;
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "UnknownError";
      counters.startup_import_failed = (counters.startup_import_failed ?? 0) + 1;
      log({
        event: "startup_import_failed",
        severity: "critical",
        error_name: name,
        error_message: message,
      });
      throw err;
    }
  })();
  return depsPromise;
}


log({ event: "boot", severity: "info" });

// ---------------------------------------------------------------------------
// In-process counters + timers. These live for the lifetime of one edge
// worker instance (they reset on cold boot / restart), which is fine —
// Lovable Cloud spawns many short-lived instances, so we intentionally
// emit both:
//   - `request_metric` (per request, carries outcome + duration_ms) —
//     the source of truth for latency histograms / rate calculations in
//     the log aggregator.
//   - `metric_snapshot` (throttled, carries the counter table) — a
//     lightweight sanity check that lets you eyeball per-instance
//     totals without joining every `request_metric` row.
// Neither replaces the existing per-outcome logs; they add trendable
// numeric surfaces on top of them.
// ---------------------------------------------------------------------------

type Outcome =
  | "success"
  | "rpc_error"
  | "rpc_invalid_payload"
  | "env_missing"
  | "startup_dependencies_unavailable"
  | "handler_unhandled_error"
  | "method_not_allowed";

const counters: Record<string, number> = {
  requests_total: 0,
  success: 0,
  rpc_error: 0,
  rpc_invalid_payload: 0,
  env_missing: 0,
  startup_dependencies_unavailable: 0,
  startup_import_failed: 0,
  handler_unhandled_error: 0,
  method_not_allowed: 0,
};

// Running latency accumulator (ms) for a cheap mean + max per snapshot
// window. `_since_snapshot` fields reset every time we emit a snapshot
// so the values reflect the window, not the instance lifetime.
let durationSumMsSinceSnapshot = 0;
let durationMaxMsSinceSnapshot = 0;
let requestsSinceSnapshot = 0;

const SNAPSHOT_INTERVAL_MS = 30_000;
let lastSnapshotAt = 0;

function recordRequestMetric(
  outcome: Outcome,
  durationMs: number,
  requestId: string,
): void {
  counters.requests_total += 1;
  counters[outcome] = (counters[outcome] ?? 0) + 1;
  requestsSinceSnapshot += 1;
  durationSumMsSinceSnapshot += durationMs;
  if (durationMs > durationMaxMsSinceSnapshot) {
    durationMaxMsSinceSnapshot = durationMs;
  }
  log({
    event: "request_metric",
    severity: "info",
    request_id: requestId,
    outcome,
    duration_ms: Math.round(durationMs * 100) / 100,
  });
  maybeEmitSnapshot();
}

function maybeEmitSnapshot(): void {
  const now = Date.now();
  if (now - lastSnapshotAt < SNAPSHOT_INTERVAL_MS) return;
  lastSnapshotAt = now;
  const mean = requestsSinceSnapshot === 0
    ? 0
    : Math.round((durationSumMsSinceSnapshot / requestsSinceSnapshot) * 100) / 100;
  log({
    event: "metric_snapshot",
    severity: "info",
    window_ms: SNAPSHOT_INTERVAL_MS,
    requests_in_window: requestsSinceSnapshot,
    duration_ms_mean_in_window: mean,
    duration_ms_max_in_window: Math.round(durationMaxMsSinceSnapshot * 100) / 100,
    counters: { ...counters },
  });
  requestsSinceSnapshot = 0;
  durationSumMsSinceSnapshot = 0;
  durationMaxMsSinceSnapshot = 0;
}


// RFC 4122 v4 UUID regex — used to sanitize any client-supplied
// `x-request-id` header so log/response IDs stay compact and predictable
// and can't be used to smuggle arbitrary content into log lines.
const REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveRequestId(req: Request): string {
  const incoming = req.headers.get("x-request-id");
  if (incoming && REQUEST_ID_RE.test(incoming)) return incoming.toLowerCase();
  return crypto.randomUUID();
}

export async function handleFounderSlotsRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const requestId = resolveRequestId(req);
  // Every log line for this request carries request_id so a single
  // failure can be traced from the 503 response header/body back through
  // every structured log entry it produced.
  const rlog = (fields: LogFields) => log({ ...fields, request_id: requestId });
  const requestHeaders: Record<string, string> = { "x-request-id": requestId };
  const startedAt = performance.now();
  // Track outcome so the `finally` block can stamp exactly one
  // `request_metric` per handler invocation.
  let outcome: Outcome = "success";
  const done = <T,>(resp: T, o: Outcome): T => {
    outcome = o;
    return resp;
  };
  // Stable machine-readable error taxonomy. `error` is retained as the
  // top-level category ("slots_unavailable") for back-compat with existing
  // callers; `error_code` is the specific reason and is safe to switch on.
  const fail = (
    code: Extract<
      Outcome,
      | "startup_dependencies_unavailable"
      | "env_missing"
      | "rpc_error"
      | "rpc_invalid_payload"
      | "handler_unhandled_error"
    >,
    body: Record<string, unknown> = {},
  ) =>
    done(
      json(
        503,
        {
          error: "slots_unavailable",
          error_code: code,
          request_id: requestId,
          ...body,
        },
        requestHeaders,
      ),
      code,
    );


  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return done(
        json(
          405,
          { error: "method_not_allowed", request_id: requestId },
          requestHeaders,
        ),
        "method_not_allowed",
      );
    }

    let deps: Deps;
    try {
      deps = await loadDeps();
    } catch (err) {
      // loadDeps already logged startup_import_failed (module-scoped, no
      // request_id) and bumped the counter. Emit a request-scoped
      // companion so the 503 can be traced back to this request.
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "UnknownError";
      rlog({
        event: "startup_dependencies_unavailable",
        severity: "critical",
        error_name: name,
        error_message: message,
      });
      return fail("startup_dependencies_unavailable");
    }

    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!supabaseUrl || !serviceRoleKey) {
        rlog({
          event: "env_missing",
          severity: "critical",
          has_url: Boolean(supabaseUrl),
          has_service_role: Boolean(serviceRoleKey),
        });
        return fail("env_missing");
      }
      const sb = deps.createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      });
      const { data, error } = await sb.rpc("founder_lifetime_slots_remaining");
      if (error) {
        rlog({
          event: "rpc_error",
          severity: "error",
          code: error.code ?? null,
          message: error.message ?? null,
        });
        return fail("rpc_error");
      }
      const payload = deps.buildFounderSlotsPayload(data);
      if (!payload) {
        rlog({
          event: "rpc_invalid_payload",
          severity: "error",
          data_type: typeof data,
        });
        return fail("rpc_invalid_payload");
      }
      return done(
        json(
          200,
          { ...payload, request_id: requestId },
          {
            ...requestHeaders,
            "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
          },
        ),
        "success",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "UnknownError";
      rlog({
        event: "handler_unhandled_error",
        severity: "critical",
        error_name: name,
        error_message: message,
      });
      return fail("handler_unhandled_error");
    }
  } finally {
    recordRequestMetric(outcome, performance.now() - startedAt, requestId);
  }
}

if (Deno.env.get("FOUNDER_SLOTS_SKIP_SERVE") !== "1") {
  Deno.serve(handleFounderSlotsRequest);
}

