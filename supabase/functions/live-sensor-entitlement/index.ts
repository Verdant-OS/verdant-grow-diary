// live-sensor-entitlement
//
// Server-side entitlement preflight scaffold for FUTURE premium live-sensor
// surfaces (real-time connected sensor stream views, premium live-only
// widgets, etc.). Closes the final paid-launch blocker documented in
// docs/paid-launch-entitlement-blocker.md by ensuring that when such a
// surface is introduced, server-side enforcement is already in place.
//
// IMPORTANT: As of this slice no premium live-sensor surface ships. This
// function exists so future callers MUST route through it instead of
// trusting `capabilities.liveSensors` on the client.
//
// Authoritative server-side check (mirrors premium-export-entitlement):
//   1. Verify the caller's JWT via auth.getUser().
//   2. Read public.billing_subscriptions for that user (RLS-enforced
//      select-own; this function does NOT use service_role).
//   3. Run the pure resolveEntitlements() function server-side and look at
//      capabilities.liveSensors.
//   4. If optional tent_id / plant_id / grow_id IDs are present, verify
//      they are well-formed UUIDs AND visible to the caller via RLS.
//   5. 200 { ok: true, ... }   if eligible.
//      400 { ok: false, ... }  if request body is malformed/invalid.
//      401 { ok: false, ... }  if no/invalid JWT.
//      403 { ok: false, ... }  if not entitled OR cross-user scope.
//
// Hard constraints:
//   - Preflight only. NEVER returns sensor readings, raw payloads, device
//     identifiers, bridge tokens, or any telemetry bytes.
//   - Read-only on billing_subscriptions + ownership rows. No DB writes.
//     No sensor ingest. No automation. No device control. No AI calls.
//   - Never returns the raw billing row. Never returns secrets.
//   - Never trusts client-supplied plan_id / founder_number / capabilities /
//     liveSensors / feature claims beyond a narrow allow-list of labels.
//   - Service role is never used.

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  loadUnionEntitlement,
  pickExpectedBillingEnvironment,
} from "../_shared/unionEntitlementLookup.ts";


const ALLOWED_SURFACES = new Set<string>([
  "live_sensor_stream",
  "live_sensor_dashboard_widget",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ValidatedBody {
  surface: string;
  grow_id: string | null;
  tent_id: string | null;
  plant_id: string | null;
}
type ValidationOk = { ok: true; body: ValidatedBody };
type ValidationErr = { ok: false; field: string; message: string };

function validateBody(raw: unknown): ValidationOk | ValidationErr {
  if (!raw || typeof raw !== "object") {
    return { ok: false, field: "body", message: "body_required" };
  }
  const b = raw as Record<string, unknown>;

  const surface = typeof b.surface === "string" ? b.surface : "";
  if (!ALLOWED_SURFACES.has(surface)) {
    return { ok: false, field: "surface", message: "unknown_surface" };
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

  return {
    ok: true,
    body: {
      surface,
      grow_id: (grow as string | null) ?? null,
      tent_id: (tent as string | null) ?? null,
      plant_id: (plant as string | null) ?? null,
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
  const { surface, grow_id, tent_id, plant_id } = v.body;

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

  const expectedBillingEnvironment = pickExpectedBillingEnvironment(
    (raw as Record<string, unknown> | null)?.billing_env,
  );
  const { entitlement, lookupFailed } = await loadUnionEntitlement(
    supabase,
    expectedBillingEnvironment,
    new Date(),
  );

  if (lookupFailed) {
    return json(403, {
      ok: false,
      reason: "entitlement_lookup_failed",
      surface,
    });
  }

  if (entitlement.capabilities.liveSensors !== true) {
    return json(403, {
      ok: false,
      reason: "upgrade_required",
      surface,
      display_plan_id: entitlement.displayPlanId,
      effective_plan_id: entitlement.effectivePlanId,
      source: entitlement.source,
    });
  }

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
    return json(403, { ok: false, reason: "scope_denied", surface });
  }
  if (tent_id && !(await ownsRow("tents", tent_id))) {
    return json(403, { ok: false, reason: "scope_denied", surface });
  }
  if (plant_id && !(await ownsRow("plants", plant_id))) {
    return json(403, { ok: false, reason: "scope_denied", surface });
  }

  return json(200, {
    ok: true,
    surface,
    display_plan_id: entitlement.displayPlanId,
    effective_plan_id: entitlement.effectivePlanId,
    source: entitlement.source,
    capabilities: { liveSensors: true },
  });
});
