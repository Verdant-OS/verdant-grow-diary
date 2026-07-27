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

function loadDeps(): Promise<Deps> {
  if (depsPromise) return depsPromise;
  depsPromise = (async () => {
    try {
      const [{ createClient }, { buildFounderSlotsPayload }] = await Promise.all([
        import("npm:@supabase/supabase-js@2"),
        import("./contract.ts"),
      ]);
      log({ event: "startup_imports_loaded", severity: "info" });
      return { createClient, buildFounderSlotsPayload };
    } catch (err) {
      // Reset so a transient failure (e.g. cold-boot registry blip) can
      // retry on the next request instead of pinning the failure state.
      depsPromise = null;
      const message = err instanceof Error ? err.message : String(err);
      const name = err instanceof Error ? err.name : "UnknownError";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }

  let deps: Deps;
  try {
    deps = await loadDeps();
  } catch {
    // Already logged as startup_import_failed above.
    return json(503, { error: "slots_unavailable" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      log({
        event: "env_missing",
        severity: "critical",
        has_url: Boolean(supabaseUrl),
        has_service_role: Boolean(serviceRoleKey),
      });
      return json(503, { error: "slots_unavailable" });
    }
    const sb = deps.createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await sb.rpc("founder_lifetime_slots_remaining");
    if (error) {
      log({
        event: "rpc_error",
        severity: "error",
        code: error.code ?? null,
        message: error.message ?? null,
      });
      return json(503, { error: "slots_unavailable" });
    }
    const payload = deps.buildFounderSlotsPayload(data);
    if (!payload) {
      log({
        event: "rpc_invalid_payload",
        severity: "error",
        data_type: typeof data,
      });
      return json(503, { error: "slots_unavailable" });
    }
    return json(200, payload, {
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const name = err instanceof Error ? err.name : "UnknownError";
    log({
      event: "handler_unhandled_error",
      severity: "critical",
      error_name: name,
      error_message: message,
    });
    return json(503, { error: "slots_unavailable" });
  }
});
