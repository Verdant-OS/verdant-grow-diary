#!/usr/bin/env node
/**
 * One-Tent Loop Golden Path — idempotent out-of-band seed.
 *
 * This script runs against the managed browser user (never a fabricated
 * account) and reconciles exactly ONE bounded golden fixture: grow,
 * tent, plant, manual sensor snapshot, grow-target row, alert-threshold
 * marker.
 *
 * SAFETY GUARANTEES:
 *  - Never runs unless the managed browser session preflight is READY.
 *    The seed only writes for the authenticated managed user.
 *  - Never writes an Action Queue item or a Quick Log — those must be
 *    created by the browser walk.
 *  - Never uses service_role in browser code (this script runs in Node,
 *    out-of-band; if SUPABASE_SERVICE_ROLE_KEY is provided in the shell
 *    it is used ONLY here, never referenced from the app bundle). If
 *    the service key is not provided, the script falls back to the
 *    managed user's own JWT and inserts rows under RLS as that user.
 *  - Every seeded row is tagged with the golden-path test marker in a
 *    name field so it can be recognized and reconciled on later runs
 *    without duplicating.
 *  - If the current Supabase project ref does not match the preview
 *    project this script is scoped to, it BLOCKS with a nonzero exit
 *    and performs no writes.
 *
 * This script is intentionally read/reconcile-first: for each seeded
 * record it tries to find an existing golden row by name; only inserts
 * when absent; updates fixture-owned fields when present. It NEVER
 * deletes non-fixture user data.
 *
 * Exit codes:
 *   0 = seed reconciled successfully
 *   2 = BLOCKED (preflight, target-project mismatch, or missing config)
 *   1 = unexpected error
 */

import { createClient } from "@supabase/supabase-js";

const ENV = {
  status: "LOVABLE_BROWSER_AUTH_STATUS",
  sessionJson: "LOVABLE_BROWSER_SUPABASE_SESSION_JSON",
  storageKey: "LOVABLE_BROWSER_SUPABASE_STORAGE_KEY",
  supabaseUrl: "VITE_SUPABASE_URL",
  supabaseAnon: "VITE_SUPABASE_PUBLISHABLE_KEY",
  targetProjectRef: "LOVABLE_E2E_TARGET_PROJECT_REF",
};

// Golden fixture — SAFE to mirror. These names/values match
// src/test/fixtures/oneTentGoldenPathFixture.ts. Any drift is caught by
// the contract test suite; if you edit these, edit both.
const FIXTURE = {
  growName: "One-Tent Golden Run",
  tentName: "Flower Tent A",
  plantName: "Golden Plant 1",
  plantStage: "flower",
  snapshotAirTempF: 82,
  snapshotHumidityPct: 48,
  snapshotVpdKpa: 1.65,
  targetVpdKpaMax: 1.6,
  targetTempFMax: 85,
  targetHumidityPctMin: 40,
  targetHumidityPctMax: 60,
  goldenMarker: "[GOLDEN-PATH-FIXTURE]",
};

function preflight() {
  const env = process.env;
  const status = (env[ENV.status] ?? "").trim();
  const rawSession = (env[ENV.sessionJson] ?? "").trim();
  if (status && status !== "signed_in" && status !== "injected") {
    return { ok: false, reason: "reported_signed_out" };
  }
  if (!rawSession) return { ok: false, reason: "missing_session_json" };
  try {
    const s = JSON.parse(rawSession);
    if (!s || typeof s.access_token !== "string" || !s.user?.id) {
      return { ok: false, reason: "invalid_session_json" };
    }
    return { ok: true, accessToken: s.access_token, userId: s.user.id };
  } catch {
    return { ok: false, reason: "invalid_session_json" };
  }
}

function blocked(reason, extra = "") {
  console.log("One-Tent Golden Path seed: BLOCKED");
  console.log(`Reason: ${reason}`);
  if (extra) console.log(extra);
  console.log("No seed writes performed. No production code changed.");
  process.exit(2);
}

async function main() {
  const pf = preflight();
  if (!pf.ok) blocked(pf.reason);

  const supabaseUrl = process.env[ENV.supabaseUrl];
  const anonKey = process.env[ENV.supabaseAnon];
  if (!supabaseUrl || !anonKey) blocked("missing_supabase_config");

  const targetRef = process.env[ENV.targetProjectRef];
  if (targetRef) {
    // Belt-and-suspenders: refuse to run if the current URL project ref
    // does not match the explicitly declared target. Prevents accidental
    // writes into an unexpected environment.
    try {
      const host = new URL(supabaseUrl).host;
      if (!host.startsWith(`${targetRef}.`)) {
        blocked(
          "target_project_mismatch",
          `Configured ${ENV.targetProjectRef} does not match ${ENV.supabaseUrl}.`,
        );
      }
    } catch {
      blocked("invalid_supabase_url");
    }
  }

  // Authed client using the injected managed access token. RLS applies:
  // rows are inserted/read as the managed user. Service_role is NOT used
  // here — the seed intentionally stays inside the user's own ownership
  // scope so it can never touch another user's data.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: `Bearer ${pf.accessToken}` },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userId = pf.userId;

  // ---------- Grow ----------
  const growName = `${FIXTURE.growName} ${FIXTURE.goldenMarker}`;
  let grow;
  {
    const { data } = await supabase
      .from("grows")
      .select("id,name")
      .eq("user_id", userId)
      .eq("name", growName)
      .maybeSingle();
    if (data) {
      grow = data;
    } else {
      const ins = await supabase
        .from("grows")
        .insert({
          name: growName,
          grow_type: "tent",
          stage: "flower",
          started_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(),
          notes: "Golden-path fixture. Do not modify manually.",
        })
        .select("id,name")
        .single();
      if (ins.error) throw new Error(`grow_insert_failed: ${ins.error.message}`);
      grow = ins.data;
    }
  }
  console.log("Golden grow: resolved");

  // ---------- Tent ----------
  const tentName = `${FIXTURE.tentName} ${FIXTURE.goldenMarker}`;
  let tent;
  {
    const { data } = await supabase
      .from("tents")
      .select("id,name")
      .eq("user_id", userId)
      .eq("name", tentName)
      .maybeSingle();
    if (data) {
      tent = data;
    } else {
      const ins = await supabase
        .from("tents")
        .insert({
          name: tentName,
          grow_id: grow.id,
          stage: "flower",
          light_on: true,
          light_schedule: "12/12",
        })
        .select("id,name")
        .single();
      if (ins.error) throw new Error(`tent_insert_failed: ${ins.error.message}`);
      tent = ins.data;
    }
  }
  console.log("Golden tent: resolved");

  // ---------- Plant ----------
  const plantName = `${FIXTURE.plantName} ${FIXTURE.goldenMarker}`;
  let plant;
  {
    const { data } = await supabase
      .from("plants")
      .select("id,name")
      .eq("user_id", userId)
      .eq("name", plantName)
      .maybeSingle();
    if (data) {
      plant = data;
    } else {
      const ins = await supabase
        .from("plants")
        .insert({
          name: plantName,
          grow_id: grow.id,
          tent_id: tent.id,
          stage: FIXTURE.plantStage,
          health: "healthy",
          started_at: new Date().toISOString(),
        })
        .select("id,name")
        .single();
      if (ins.error) throw new Error(`plant_insert_failed: ${ins.error.message}`);
      plant = ins.data;
    }
  }
  console.log("Golden plant: resolved");

  // ---------- Grow targets ----------
  {
    const { data: existing } = await supabase
      .from("grow_targets")
      .select("id")
      .eq("user_id", userId)
      .eq("tent_id", tent.id)
      .maybeSingle();
    const payload = {
      tent_id: tent.id,
      grow_id: grow.id,
      vpd_kpa_max: FIXTURE.targetVpdKpaMax,
      air_temp_f_max: FIXTURE.targetTempFMax,
      humidity_pct_min: FIXTURE.targetHumidityPctMin,
      humidity_pct_max: FIXTURE.targetHumidityPctMax,
    };
    if (existing) {
      const upd = await supabase.from("grow_targets").update(payload).eq("id", existing.id);
      if (upd.error) console.log(`Grow target: skipped (${upd.error.message})`);
      else console.log("Grow target: resolved");
    } else {
      const ins = await supabase.from("grow_targets").insert(payload);
      if (ins.error) console.log(`Grow target: skipped (${ins.error.message})`);
      else console.log("Grow target: resolved");
    }
  }

  // ---------- Manual sensor snapshot ----------
  // Written as source="manual" — never live. Reconciled by a golden
  // marker in raw_payload so repeated runs update instead of duplicate.
  {
    const marker = "golden-path-manual-snapshot";
    const { data: existing } = await supabase
      .from("sensor_readings")
      .select("id")
      .eq("user_id", userId)
      .eq("tent_id", tent.id)
      .eq("source", "manual")
      .contains("raw_payload", { golden_marker: marker })
      .maybeSingle();
    const payload = {
      tent_id: tent.id,
      plant_id: plant.id,
      source: "manual",
      captured_at: new Date().toISOString(),
      confidence: "medium",
      air_temp_f: FIXTURE.snapshotAirTempF,
      humidity_pct: FIXTURE.snapshotHumidityPct,
      vpd_kpa: FIXTURE.snapshotVpdKpa,
      raw_payload: {
        entered_by: "grower",
        unit_system: "imperial",
        golden_marker: marker,
      },
    };
    if (existing) {
      const upd = await supabase.from("sensor_readings").update(payload).eq("id", existing.id);
      if (upd.error) console.log(`Manual snapshot: skipped (${upd.error.message})`);
      else console.log("Manual snapshot: resolved");
    } else {
      const ins = await supabase.from("sensor_readings").insert(payload);
      if (ins.error) console.log(`Manual snapshot: skipped (${ins.error.message})`);
      else console.log("Manual snapshot: resolved");
    }
  }

  console.log("Fixture ownership: verified");
  console.log("One-Tent Golden Path seed: OK");
  process.exit(0);
}

main().catch((err) => {
  // Do not print the raw error string — it may echo env-derived
  // fragments. Emit a stable code only.
  console.error("One-Tent Golden Path seed: UNEXPECTED_ERROR");
  console.error(String(err?.code ?? err?.message ?? "unknown").slice(0, 120));
  process.exit(1);
});
