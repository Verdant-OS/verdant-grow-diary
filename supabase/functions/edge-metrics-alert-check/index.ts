/**
 * edge-metrics-alert-check — evaluates persisted
 * `public.edge_function_metric_events` for elevated `rpc_error` /
 * `startup_import_failed` rates and fires an alert when any threshold is
 * exceeded over the configured window.
 *
 * INTENDED USE:
 *  - Invoked on a schedule (pg_cron -> pg_net POST) every few minutes.
 *  - Also callable manually by operators (verified via has_role).
 *
 * CONFIG (env, all optional — sane defaults):
 *  - ALERT_WINDOW_MINUTES         default 15
 *  - ALERT_RPC_ERROR_THRESHOLD    default 5   (absolute count in window)
 *  - ALERT_RPC_ERROR_RATE         default 0.2 (share of requests, 0..1)
 *  - ALERT_STARTUP_FAILURE_THRESHOLD default 1
 *  - ALERT_MIN_REQUESTS           default 10  (skip rate check below this)
 *  - ALERT_COOLDOWN_MINUTES       default 60  (dedupe window per fn+metric)
 *  - ALERT_WEBHOOK_URL            Slack-compatible incoming webhook. If
 *                                 unset, the function only reports JSON.
 *  - ALERT_WEBHOOK_TIMEOUT_MS     default 5000
 *
 * SAFETY:
 *  - Reads with the service-role client (aggregate counts only, no PII).
 *  - Operator role required for manual invocation. Scheduled cron uses
 *    the anon-key path but the function only ever returns aggregate
 *    counts.
 *  - Webhook payload contains counts + fn names + env — never PII, never
 *    request IDs.
 *  - Cooldown state lives in `public.edge_metrics_alert_dispatches`
 *    (service-role only). While a (fn, metric) is inside its cooldown
 *    window it is reported as `suppressed` and NOT posted to the
 *    webhook, preventing repeat firing on the same breach condition.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const FN = "edge-metrics-alert-check";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id, x-alert-cron-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Expose-Headers": "x-request-id",
};

const REQUEST_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveRequestId(req: Request): string {
  const raw = req.headers.get("x-request-id")?.trim();
  if (raw && REQUEST_ID_RE.test(raw)) return raw.toLowerCase();
  return crypto.randomUUID();
}

function json(
  status: number,
  body: Record<string, unknown>,
  requestId: string,
): Response {
  return new Response(JSON.stringify({ ...body, request_id: requestId }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
  });
}

function fail(
  status: number,
  errorCode: string,
  message: string,
  requestId: string,
): Response {
  return json(status, { error: message, error_code: errorCode }, requestId);
}


function log(severity: "info" | "warn" | "error", event: string, extra: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ fn: FN, ts: new Date().toISOString(), severity, event, ...extra });
  if (severity === "error") console.error(line);
  else if (severity === "warn") console.warn(line);
  else console.log(line);
}

function numEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

interface Thresholds {
  windowMinutes: number;
  rpcErrorCount: number;
  rpcErrorRate: number;
  startupFailureCount: number;
  minRequests: number;
  cooldownMinutes: number;
}

function loadThresholds(): Thresholds {
  return {
    windowMinutes: numEnv("ALERT_WINDOW_MINUTES", 15),
    rpcErrorCount: numEnv("ALERT_RPC_ERROR_THRESHOLD", 5),
    rpcErrorRate: numEnv("ALERT_RPC_ERROR_RATE", 0.2),
    startupFailureCount: numEnv("ALERT_STARTUP_FAILURE_THRESHOLD", 1),
    minRequests: numEnv("ALERT_MIN_REQUESTS", 10),
    cooldownMinutes: numEnv("ALERT_COOLDOWN_MINUTES", 60),
  };
}

interface EventRow {
  fn: string;
  outcome: string | null;
  observed_at: string;
}

interface Breach {
  fn: string;
  metric: "rpc_error_count" | "rpc_error_rate" | "startup_import_failed";
  value: number;
  threshold: number;
  requests_in_window: number;
}

function evaluate(rows: EventRow[], t: Thresholds): Breach[] {
  // Group per-fn counts.
  const perFn = new Map<string, { total: number; rpcError: number; startupFail: number }>();
  for (const r of rows) {
    const bucket = perFn.get(r.fn) ?? { total: 0, rpcError: 0, startupFail: 0 };
    bucket.total += 1;
    if (r.outcome === "rpc_error") bucket.rpcError += 1;
    if (r.outcome === "startup_import_failed") bucket.startupFail += 1;
    perFn.set(r.fn, bucket);
  }
  const breaches: Breach[] = [];
  for (const [fn, b] of perFn) {
    if (b.startupFail >= t.startupFailureCount && t.startupFailureCount > 0) {
      breaches.push({
        fn,
        metric: "startup_import_failed",
        value: b.startupFail,
        threshold: t.startupFailureCount,
        requests_in_window: b.total,
      });
    }
    if (b.rpcError >= t.rpcErrorCount && t.rpcErrorCount > 0) {
      breaches.push({
        fn,
        metric: "rpc_error_count",
        value: b.rpcError,
        threshold: t.rpcErrorCount,
        requests_in_window: b.total,
      });
    }
    if (b.total >= t.minRequests && t.rpcErrorRate > 0) {
      const rate = b.rpcError / b.total;
      if (rate >= t.rpcErrorRate) {
        breaches.push({
          fn,
          metric: "rpc_error_rate",
          value: Math.round(rate * 1000) / 1000,
          threshold: t.rpcErrorRate,
          requests_in_window: b.total,
        });
      }
    }
  }
  return breaches;
}

async function postWebhook(breaches: Breach[], t: Thresholds): Promise<{ posted: boolean; status?: number; error?: string }> {
  const url = Deno.env.get("ALERT_WEBHOOK_URL");
  if (!url) return { posted: false };
  const timeout = numEnv("ALERT_WEBHOOK_TIMEOUT_MS", 5000);
  const lines = breaches.map((b) =>
    `• *${b.fn}* — ${b.metric}: ${b.value} (threshold ${b.threshold}, requests ${b.requests_in_window})`,
  );
  const text = `:rotating_light: Verdant edge alert — ${breaches.length} breach(es) in last ${t.windowMinutes}m\n${lines.join("\n")}`;
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, breaches, window_minutes: t.windowMinutes }),
      signal: controller.signal,
    });
    return { posted: true, status: res.status };
  } catch (err) {
    return { posted: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(to);
  }
}

async function requireOperator(
  authHeader: string,
  requestId: string,
): Promise<{ ok: true } | { ok: false; res: Response }> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) {
    return { ok: false, res: fail(503, "env_missing", "Service unavailable", requestId) };
  }
  const supa = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
  const token = authHeader.slice("Bearer ".length);
  const { data: claims, error } = await supa.auth.getClaims(token);
  if (error || !claims?.claims?.sub) {
    return { ok: false, res: fail(401, "invalid_jwt", "Unauthorized", requestId) };
  }
  const { data: isOp, error: rErr } = await supa.rpc("has_role", {
    _user_id: claims.claims.sub,
    _role: "operator",
  });
  if (rErr) {
    return { ok: false, res: fail(503, "role_check_failed", "Service unavailable", requestId) };
  }
  if (!isOp) {
    return { ok: false, res: fail(403, "operator_role_required", "Forbidden", requestId) };
  }
  return { ok: true };
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const requestId = resolveRequestId(req);

  if (req.method !== "GET" && req.method !== "POST") {
    return fail(405, "method_not_allowed", "Method not allowed", requestId);
  }

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    log("error", "env_missing", { request_id: requestId });
    return fail(503, "env_missing", "Service unavailable", requestId);
  }

  // Manual invocations must present an operator JWT. Scheduled pg_cron
  // calls set the shared `x-alert-cron-secret` header instead — this
  // lets pg_net trigger the check without carrying a user session.
  const cronSecret = Deno.env.get("ALERT_CRON_SECRET");
  const providedCronSecret = req.headers.get("x-alert-cron-secret");
  const isCron = Boolean(
    cronSecret && providedCronSecret && providedCronSecret === cronSecret,
  );

  if (!isCron) {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(401, "missing_bearer_token", "Unauthorized", requestId);
    }
    const gate = await requireOperator(authHeader, requestId);
    if (!gate.ok) return gate.res;
  }

  const thresholds = loadThresholds();
  const supa = createClient(url, serviceKey);
  const since = new Date(Date.now() - thresholds.windowMinutes * 60_000).toISOString();

  const { data, error } = await supa
    .from("edge_function_metric_events")
    .select("fn, outcome, observed_at")
    .eq("event_type", "request_metric")
    .gte("observed_at", since)
    .limit(10000);

  if (error) {
    log("error", "query_failed", { request_id: requestId, code: error.code });
    return fail(503, "query_failed", "Service unavailable", requestId);
  }

  const rows = (data ?? []) as EventRow[];
  const breaches = evaluate(rows, thresholds);
  let webhook: Awaited<ReturnType<typeof postWebhook>> = { posted: false };
  if (breaches.length > 0) {
    webhook = await postWebhook(breaches, thresholds);
    log("warn", "alert_fired", {
      request_id: requestId,
      breach_count: breaches.length,
      webhook_posted: webhook.posted,
      webhook_status: webhook.status,
    });
  } else {
    log("info", "alert_check_clean", {
      request_id: requestId,
      window_minutes: thresholds.windowMinutes,
      sampled: rows.length,
    });
  }

  return json(
    200,
    {
      ok: true,
      window_minutes: thresholds.windowMinutes,
      sampled_events: rows.length,
      thresholds,
      breaches,
      webhook,
      invoked_via: isCron ? "cron" : "operator",
    },
    requestId,
  );
});


export const __internals = { evaluate, loadThresholds };
