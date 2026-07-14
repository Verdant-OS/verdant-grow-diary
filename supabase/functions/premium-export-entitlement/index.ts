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
//   4. If optional grow_id / tent_id / plant_id IDs are present, verify
//      they are well-formed UUIDs AND visible to the caller via RLS.
//   5. 200 { ok: true, ... }   if eligible.
//      400 { ok: false, ... }  if request body is malformed/invalid.
//      401 { ok: false, ... }  if no/invalid JWT.
//      403 { ok: false, ... }  if not entitled OR cross-user scope.
//
// Hard constraints:
//   - Preflight only. Does NOT generate, return, or proxy export bytes.
//   - Read-only. No DB writes. No sensor ingest. No automation. No device
//     control. No AI calls.
//   - Never returns the raw billing row. Never returns secrets.
//   - Never trusts client-supplied plan_id / founder_number / capabilities /
//     export tier / feature claims beyond a narrow allow-list of labels.
//   - Service role is never used.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  loadUnionEntitlement,
  resolveServerBillingEnvironment,
} from "../_shared/unionEntitlementLookup.ts";

const ALLOWED_FEATURES = new Set<string>([
  "ai_doctor_report",
  "ai_doctor_evidence_csv",
  "ai_doctor_report_package",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[0-9:.\-+Z]+)?$/;
const MAX_RANGE_DAYS = 366;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ValidatedBody {
  feature: string;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
  start_date: string | null;
  end_date: string | null;
}

type ValidationOk = { ok: true; body: ValidatedBody };
type ValidationErr = { ok: false; field: string; message: string };

function validateBody(raw: unknown): ValidationOk | ValidationErr {
  if (!raw || typeof raw !== "object") {
    return { ok: false, field: "body", message: "body_required" };
  }
  const b = raw as Record<string, unknown>;

  const feature = typeof b.feature === "string" ? b.feature : "";
  if (!ALLOWED_FEATURES.has(feature)) {
    return { ok: false, field: "feature", message: "unknown_feature" };
  }

  function uuidOrNull(key: string): string | null | ValidationErr {
    const v = b[key];
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || !UUID_RE.test(v)) {
      return { ok: false, field: key, message: "invalid_uuid" };
    }
    return v;
  }
  const grow = uuidOrNull("grow_id");
  if (grow && typeof grow === "object") return grow;
  const tent = uuidOrNull("tent_id");
  if (tent && typeof tent === "object") return tent;
  const plant = uuidOrNull("plant_id");
  if (plant && typeof plant === "object") return plant;

  function dateOrNull(key: string): string | null | ValidationErr {
    const v = b[key];
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || !ISO_DATE_RE.test(v)) {
      return { ok: false, field: key, message: "invalid_date" };
    }
    const t = Date.parse(v);
    if (!Number.isFinite(t)) {
      return { ok: false, field: key, message: "invalid_date" };
    }
    return v;
  }
  const start = dateOrNull("start_date");
  if (start && typeof start === "object") return start;
  const end = dateOrNull("end_date");
  if (end && typeof end === "object") return end;

  if (start && end) {
    const s = Date.parse(start as string);
    const e = Date.parse(end as string);
    if (s > e) {
      return { ok: false, field: "date_range", message: "start_after_end" };
    }
    if (e - s > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return { ok: false, field: "date_range", message: "range_too_large" };
    }
  }

  return {
    ok: true,
    body: {
      feature,
      grow_id: (grow as string | null) ?? null,
      tent_id: (tent as string | null) ?? null,
      plant_id: (plant as string | null) ?? null,
      start_date: (start as string | null) ?? null,
      end_date: (end as string | null) ?? null,
    },
  };
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

  let raw: unknown = null;
  try {
    raw = await req.json();
  } catch {
    return json(400, { ok: false, reason: "invalid_json" });
  }
  const v = validateBody(raw);
  if (!v.ok) {
    return json(400, {
      ok: false,
      reason: "invalid_request",
      field: v.field,
      detail: v.message,
    });
  }
  const { feature, grow_id, tent_id, plant_id } = v.body;

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

  // Server-authoritative: NEVER trust client-supplied billing_env.
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
      feature,
    });
  }

  if (entitlement.capabilities.advancedExports !== true) {
    return json(403, {
      ok: false,
      reason: "upgrade_required",
      feature,
      display_plan_id: entitlement.displayPlanId,
      effective_plan_id: entitlement.effectivePlanId,
      source: entitlement.source,
    });
  }

  // Optional scope ownership check. Uses the same user-JWT-scoped client,
  // so RLS denies any cross-user row visibility automatically.
  async function ownsRow(table: string, id: string): Promise<boolean> {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (error) return false;
    return !!data;
  }
  if (grow_id && !(await ownsRow("grows", grow_id))) {
    return json(403, { ok: false, reason: "scope_denied", feature });
  }
  if (tent_id && !(await ownsRow("tents", tent_id))) {
    return json(403, { ok: false, reason: "scope_denied", feature });
  }
  if (plant_id && !(await ownsRow("plants", plant_id))) {
    return json(403, { ok: false, reason: "scope_denied", feature });
  }

  return json(200, {
    ok: true,
    feature,
    display_plan_id: entitlement.displayPlanId,
    effective_plan_id: entitlement.effectivePlanId,
    source: entitlement.source,
    capabilities: { advancedExports: true },
  });
});
