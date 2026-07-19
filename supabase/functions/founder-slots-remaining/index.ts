import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildFounderSlotsPayload } from "./contract.ts";

/**
 * founder-slots-remaining — public read-only endpoint that exposes ONLY
 * the integer count returned by public.founder_lifetime_slots_remaining().
 *
 * L2 (audit fix): the /pricing Founder Lifetime card previously read the
 * cap from a static constant, so a sold-out state would still show as
 * "Claim Founder Lifetime". This endpoint lets the client render an
 * accurate live counter without exposing any billing rows or PII.
 *
 * SAFETY:
 *  - No user data, no billing rows, no Paddle IDs — just an integer.
 *  - Executed with the service-role client purely so it can invoke the
 *    SECURITY DEFINER RPC without requiring the /pricing viewer to be
 *    signed in. The endpoint revalidates the RPC result as a bounded
 *    integer before returning the aggregate-only public payload.
 *  - Errors are sanitized. Fail-closed by returning 503; the pricing card
 *    then falls back to its static cap copy.
 */

const CACHE_SECONDS = 30;

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { error: "method_not_allowed" });
  }
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return json(503, { error: "slots_unavailable" });
    }
    const sb = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await sb.rpc("founder_lifetime_slots_remaining");
    if (error) {
      return json(503, { error: "slots_unavailable" });
    }
    const payload = buildFounderSlotsPayload(data);
    if (!payload) {
      return json(503, { error: "slots_unavailable" });
    }
    return json(200, payload, {
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    });
  } catch {
    return json(503, { error: "slots_unavailable" });
  }
});
