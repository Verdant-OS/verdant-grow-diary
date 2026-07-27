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
 * QUERY:
 *  - Optional `fn=<edge_fn_name>` filter (default: no filter, returns the
 *    globally-latest snapshot across every edge function that persists).
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const FN = "edge-metrics-latest";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function json(status: number, body: unknown, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

function log(severity: "info" | "warn" | "error", event: string, extra: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ fn: FN, ts: new Date().toISOString(), severity, event, ...extra });
  if (severity === "error") console.error(line);
  else if (severity === "warn") console.warn(line);
  else console.log(line);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "method_not_allowed" });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json(401, { error: "unauthorized" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    log("error", "env_missing");
    return json(503, { error: "service_unavailable", error_code: "env_missing" });
  }

  const token = authHeader.slice("Bearer ".length);
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: claims, error: claimsError } = await supabase.auth.getClaims(token);
  if (claimsError || !claims?.claims?.sub) {
    return json(401, { error: "unauthorized" });
  }
  const userId = claims.claims.sub as string;

  const { data: isOperator, error: roleError } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "operator",
  });
  if (roleError) {
    log("error", "role_check_failed", { code: roleError.code });
    return json(500, { error: "role_check_failed" });
  }
  if (!isOperator) {
    return json(403, { error: "forbidden" });
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
    log("error", "query_failed", { code: error.code });
    return json(500, { error: "query_failed" });
  }
  if (!data) {
    return json(200, { snapshot: null, filter: { fn: fnFilter } });
  }

  return json(200, { snapshot: data, filter: { fn: fnFilter } });
});
