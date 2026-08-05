/**
 * edge-metrics-latest — operator-only endpoint returning the latest
 * `metric_snapshot` row persisted from edge functions into
 * public.edge_function_metric_events.
 *
 * SAFETY:
 *  - Requires a valid authenticated JWT.
 *  - Requires the caller to hold the `operator` app_role (checked via the
 *    SECURITY DEFINER `public.has_role` RPC using the caller's JWT).
 *  - Reads only aggregate counters/window stats — no PII, no user rows.
 *
 * ERROR CONTRACT:
 *  Every non-2xx response uses the shape
 *    { "error": string, "error_code": string, "request_id": string }
 *  and echoes `x-request-id` so callers can correlate with server logs.
 *
 * QUERY:
 *  - Optional `fn=<edge_fn_name>` filter (default: no filter, returns the
 *    globally-latest snapshot across every edge function that persists).
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const FN = "edge-metrics-latest";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-id",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Expose-Headers": "x-request-id",
};

const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveRequestId(req: Request): string {
  const raw = req.headers.get("x-request-id")?.trim();
  if (raw && REQUEST_ID_RE.test(raw)) return raw.toLowerCase();
  return crypto.randomUUID();
}

function json(status: number, body: Record<string, unknown>, requestId: string): Response {
  return new Response(JSON.stringify({ ...body, request_id: requestId }), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
  });
}

function fail(status: number, errorCode: string, message: string, requestId: string): Response {
  return json(status, { error: message, error_code: errorCode }, requestId);
}

function log(
  severity: "info" | "warn" | "error",
  event: string,
  extra: Record<string, unknown> = {},
): void {
  const line = JSON.stringify({
    fn: FN,
    ts: new Date().toISOString(),
    severity,
    event,
    ...extra,
  });
  if (severity === "error") console.error(line);
  else if (severity === "warn") console.warn(line);
  else console.log(line);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const requestId = resolveRequestId(req);

  if (req.method !== "GET") {
    return fail(405, "method_not_allowed", "Method not allowed", requestId);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return fail(401, "missing_bearer_token", "Unauthorized", requestId);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    log("error", "env_missing", { request_id: requestId });
    return fail(503, "env_missing", "Service unavailable", requestId);
  }

  const token = authHeader.slice("Bearer ".length);
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) {
    return fail(401, "invalid_jwt", "Unauthorized", requestId);
  }
  const userId = claims.claims.sub as string;

  const { data: isOperator, error: roleError } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "operator",
  });
  if (roleError) {
    log("error", "role_check_failed", { request_id: requestId, code: roleError.code });
    return fail(503, "role_check_failed", "Service unavailable", requestId);
  }
  if (!isOperator) {
    return fail(403, "operator_role_required", "Forbidden", requestId);
  }

  const url = new URL(req.url);
  const fnFilter = url.searchParams.get("fn")?.trim() || null;

  let query = supabase
    .from("edge_function_metric_events")
    .select(
      "id, fn, event_type, observed_at, window_ms, requests_in_window, duration_ms_mean_in_window, duration_ms_max_in_window, counters, deploy_version, supabase_env",
    )
    .eq("event_type", "metric_snapshot")
    .order("observed_at", { ascending: false })
    .limit(1);
  if (fnFilter) query = query.eq("fn", fnFilter);

  const { data, error } = await query.maybeSingle();
  if (error) {
    log("error", "query_failed", { request_id: requestId, code: error.code });
    return fail(503, "query_failed", "Service unavailable", requestId);
  }

  return json(200, { snapshot: data ?? null, filter: { fn: fnFilter } }, requestId);
});
