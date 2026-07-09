// environment-summary-report-entitlement
//
// Server-side entitlement gate for the Environment Summary Report (a premium
// surface). Closes the first paid-launch blocker documented in
// docs/paid-launch-entitlement-blocker.md.
//
// Authoritative server-side check:
//   1. Verify the caller's JWT via auth.getUser().
//   2. Read public.billing_subscriptions for that user (RLS-enforced
//      select-own; this function does NOT use service_role).
//   3. Run the pure resolveEntitlements() function (server-side, never trusts
//      the client) and look at capabilities.advancedExports.
//   4. 200 { ok: true, ... }   if eligible.
//      403 { ok: false, ... }  if not.
//      401 { ok: false, ... }  if no/invalid JWT.
//
// Hard constraints:
//   - Read-only. No DB writes. No sensor ingest. No automation. No device
//     control. No AI calls.
//   - Never returns the raw billing row. Never returns secrets.
//   - Never trusts client-supplied plan_id / founder_number / capabilities.
//   - Service role is never used.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  loadUnionEntitlement,
  resolveServerBillingEnvironment,
} from "../_shared/unionEntitlementLookup.ts";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return json(405, { ok: false, reason: "method_not_allowed" });
  }

  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return json(401, { ok: false, reason: "not_authenticated" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnon) {
    return json(500, { ok: false, reason: "config_missing" });
  }

  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: auth } },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return json(401, { ok: false, reason: "not_authenticated" });
  }

  // RLS: select-own. We do NOT pass user_id from the client; the
  // authenticated query is scoped by the JWT.
  // Server-authoritative billing environment: NEVER trust client body/query
  // `billing_env`. A spoofed request cannot flip sandbox<->live matching.
  const expectedBillingEnvironment = resolveServerBillingEnvironment();
  const { entitlement, lookupFailed } = await loadUnionEntitlement(
    supabase,
    expectedBillingEnvironment,
    new Date(),
  );

  if (lookupFailed) {
    return json(403, {
      ok: false,
      reason: "entitlement_lookup_failed",
      feature: "environment_summary_report",
    });
  }

  if (entitlement.capabilities.advancedExports !== true) {
    return json(403, {
      ok: false,
      reason: "upgrade_required",
      feature: "environment_summary_report",
      display_plan_id: entitlement.displayPlanId,
      effective_plan_id: entitlement.effectivePlanId,
      source: entitlement.source,
    });
  }

  return json(200, {
    ok: true,
    feature: "environment_summary_report",
    display_plan_id: entitlement.displayPlanId,
    effective_plan_id: entitlement.effectivePlanId,
    source: entitlement.source,
    capabilities: { advancedExports: true },
  });
});
