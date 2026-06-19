// premium-export-entitlement
//
// Server-side entitlement preflight for premium CSV / report exporters
// (AI Doctor PDF, AI Doctor Evidence CSV, AI Doctor Report Package, and any
// future premium export surfaces). Closes the second paid-launch blocker
// documented in docs/paid-launch-entitlement-blocker.md.
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
//   - Preflight only. Does NOT generate, return, or proxy export bytes.
//   - Read-only. No DB writes. No sensor ingest. No automation. No device
//     control. No AI calls.
//   - Never returns the raw billing row. Never returns secrets.
//   - Never trusts client-supplied plan_id / founder_number / capabilities /
//     export tier / feature claims beyond a flat string label for logs.
//   - Service role is never used.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveEntitlements } from "../../../src/lib/entitlements/resolveEntitlements.ts";
import type { BillingSubscriptionRow } from "../../../src/lib/entitlements/types.ts";

const ALLOWED_FEATURES = new Set<string>([
  "ai_doctor_report",
  "ai_doctor_evidence_csv",
  "ai_doctor_report_package",
]);

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
  if (req.method !== "POST") {
    return json(405, { ok: false, reason: "method_not_allowed" });
  }

  const auth = req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) {
    return json(401, { ok: false, reason: "not_authenticated" });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const rawFeature =
    typeof body.feature === "string" ? body.feature : "unspecified";
  const feature = ALLOWED_FEATURES.has(rawFeature) ? rawFeature : "unspecified";

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

  const { data: rows, error: rowErr } = await supabase
    .from("billing_subscriptions")
    .select(
      "id,user_id,plan_id,status,provider,provider_customer_id,provider_subscription_id,current_period_end,cancel_at_period_end,founder_number,created_at,updated_at",
    )
    .limit(1);

  if (rowErr) {
    return json(403, {
      ok: false,
      reason: "entitlement_lookup_failed",
      feature,
    });
  }

  const row = (rows && rows.length > 0 ? rows[0] : null) as
    | BillingSubscriptionRow
    | null;
  const entitlement = resolveEntitlements(row, new Date());

  if (entitlement.capabilities.advancedExports !== true) {
    return json(403, {
      ok: false,
      reason: "upgrade_required",
      feature,
      display_plan_id: entitlement.displayPlanId,
      effective_plan_id: entitlement.effectivePlanId,
    });
  }

  return json(200, {
    ok: true,
    feature,
    display_plan_id: entitlement.displayPlanId,
    effective_plan_id: entitlement.effectivePlanId,
    capabilities: { advancedExports: true },
  });
});
