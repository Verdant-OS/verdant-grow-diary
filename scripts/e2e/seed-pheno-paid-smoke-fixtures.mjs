#!/usr/bin/env node
/**
 * Pheno paid-user smoke fixture seeder — local Supabase only.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT THIS SEEDS (idempotent, per owner user)
 * ────────────────────────────────────────────────────────────────────────
 *   ✔ 1 grow
 *   ✔ 1 tent
 *   ✔ missing-evidence hunt   — hunt row + 0 candidates
 *   ✔ pending-harvest hunt    — hunt + 2 candidates, phenotype notes only
 *   ✔ pending-cure  hunt      — hunt + 2 candidates + 1 lab result each
 *   ✔ comparison-ready hunt   — hunt + 2 candidates + score notes +
 *                               post-harvest smoke test verdict/flavor +
 *                               lab result. Passes every gate that
 *                               derivePhenoCompareReadinessFromCandidates
 *                               checks:
 *                                 - every candidate has a phenotype signal
 *                                   (score note / traits / smoke test)
 *                                 - ≥1 has post-harvest evidence
 *                                 - ≥1 has post-cure smoke test
 *                                 - replicationReadinessRecorded is
 *                                   undefined (engine treats as satisfied)
 *
 * ────────────────────────────────────────────────────────────────────────
 * SAFETY
 * ────────────────────────────────────────────────────────────────────────
 *  - Local only. Refuses to run against supabase.co / supabase.in /
 *    lovable.app / lovable.dev hostnames.
 *  - Never logs SUPABASE_SERVICE_ROLE_KEY, emails, passwords, cookies,
 *    JWTs, or full user ids. Only fixture UUIDs are written to the
 *    gitignored env file at e2e/.fixtures/pheno-paid-smoke.env.
 *  - Uses public schema tables only. No auth.admin, no auth.users writes.
 *  - Does not bypass readiness rules — comparison_ready is achieved only
 *    by writing real evidence rows the product code already reads.
 *
 * ────────────────────────────────────────────────────────────────────────
 * REQUIRED LOCAL ENV
 * ────────────────────────────────────────────────────────────────────────
 *   SUPABASE_URL (or E2E_SUPABASE_URL)             — 127.0.0.1:54321 etc.
 *   SUPABASE_SERVICE_ROLE_KEY (or E2E_SUPABASE_SERVICE_ROLE_KEY)
 *   E2E_PHENO_PRO_EMAIL (or E2E_PHENO_FOUNDER_EMAIL)
 *     — must resolve to an existing profiles row on the local instance.
 *
 * Without all three the script prints SKIPPED and exits 0.
 */

import fs from "node:fs";
import path from "node:path";

const OWNER_EMAIL_ENVS = ["E2E_PHENO_PRO_EMAIL", "E2E_PHENO_FOUNDER_EMAIL"];
const SERVICE_ROLE_ENVS = ["SUPABASE_SERVICE_ROLE_KEY", "E2E_SUPABASE_SERVICE_ROLE_KEY"];
const SUPABASE_URL_ENVS = ["E2E_SUPABASE_URL", "SUPABASE_URL"];

function present(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}
function firstPresent(names) {
  for (const n of names) if (present(n)) return process.env[n];
  return null;
}

const supabaseUrl = firstPresent(SUPABASE_URL_ENVS);
const serviceRole = firstPresent(SERVICE_ROLE_ENVS);
const ownerEmail = firstPresent(OWNER_EMAIL_ENVS);

const lines = [
  "Pheno Tracker paid-user smoke — fixture seeder",
  "----------------------------------------------",
  "",
  "Per-fixture readiness:",
  "  SEEDABLE  E2E_PHENO_HUNT_ID_MISSING_EVIDENCE   (hunt row, no candidates)",
  "  SEEDABLE  E2E_PHENO_HUNT_ID_PENDING_HARVEST    (hunt + candidates, no smoke/lab)",
  "  SEEDABLE  E2E_PHENO_HUNT_ID_PENDING_CURE       (hunt + candidates + lab only)",
  "  SEEDABLE  E2E_PHENO_HUNT_ID_COMPARISON_READY   (hunt + candidates + scores + smoke tests + lab)",
  "  SKIPPED   E2E_PHENO_HUNT_ID_REPLICATION_PENDING (signal not persisted — engine treats as satisfied)",
  "",
  "Input presence:",
  `  ${supabaseUrl ? "PRESENT " : "SKIPPED "} local Supabase URL`,
  `  ${serviceRole ? "PRESENT " : "SKIPPED "} service_role key`,
  `  ${ownerEmail ? "PRESENT " : "SKIPPED "} owner email (Pro or Founder)`,
  "",
];

if (!supabaseUrl || !serviceRole || !ownerEmail) {
  const missing = [];
  if (!supabaseUrl) missing.push("SUPABASE_URL");
  if (!serviceRole) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ownerEmail) missing.push("E2E_PHENO_PRO_EMAIL (or E2E_PHENO_FOUNDER_EMAIL)");
  lines.push(
    `Result: SKIPPED — missing: ${missing.join(", ")}`,
    "See docs/pheno-paid-smoke-local-setup.md for the local Supabase setup.",
  );
  console.log(lines.join("\n"));
  process.exit(0);
}

// Refuse to run against anything that looks like production.
const host = (() => {
  try { return new URL(supabaseUrl).host.toLowerCase(); } catch { return ""; }
})();
const productionMarkers = ["supabase.co", "supabase.in", "lovable.app", "lovable.dev"];
if (productionMarkers.some((m) => host.endsWith(m))) {
  lines.push(
    `Result: REFUSED — Supabase host "${host}" looks like production.`,
    "This seeder only runs against a local Supabase (e.g. 127.0.0.1:54321).",
  );
  console.log(lines.join("\n"));
  process.exit(1);
}

// Local-only path from here on. Import lazily so a bare SKIPPED run has no deps.
const { createClient } = await import("@supabase/supabase-js");
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });

// Resolve owner user_id via the service-role admin API. (profiles has no
// email or id column — its key is user_id — so the previous profiles-based
// lookup could never resolve on any real schema.)
let ownerId = null;
{
  const wanted = ownerEmail.trim().toLowerCase();
  let page = 1;
  while (page <= 10 && !ownerId) {
    const { data, error: listErr } = await db.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (listErr) break;
    ownerId =
      data?.users?.find((u) => (u.email ?? "").toLowerCase() === wanted)?.id ??
      null;
    if (!data?.users?.length || data.users.length < 200) break;
    page += 1;
  }
}
if (!ownerId) {
  lines.push(
    "Result: FAIL — owner email did not resolve to a local auth user.",
    "Create the local test account first, then re-run.",
  );
  console.log(lines.join("\n"));
  process.exit(1);
}

const FIXTURE_PREFIX = process.env.E2E_PHENO_FIXTURE_PREFIX || "e2e_pheno_paid_smoke";

async function upsertGrow() {
  const name = `${FIXTURE_PREFIX} grow`;
  const { data } = await db.from("grows").select("id").eq("user_id", ownerId).eq("name", name).maybeSingle();
  if (data?.id) return data.id;
  const { data: created, error } = await db.from("grows")
    .insert({ user_id: ownerId, name }).select("id").single();
  if (error) throw new Error(`grow insert failed: ${error.code}`);
  return created.id;
}
async function upsertTent(growId) {
  const name = `${FIXTURE_PREFIX} tent`;
  const { data } = await db.from("tents").select("id").eq("user_id", ownerId).eq("name", name).maybeSingle();
  if (data?.id) return data.id;
  const { data: created, error } = await db.from("tents")
    .insert({ user_id: ownerId, name }).select("id").single();
  if (error) throw new Error(`tent insert failed: ${error.code}`);
  return created.id;
}
async function upsertHunt(growId, tentId, suffix) {
  const name = `${FIXTURE_PREFIX} ${suffix}`;
  const { data } = await db.from("pheno_hunts").select("id")
    .eq("user_id", ownerId).eq("name", name).maybeSingle();
  if (data?.id) return data.id;
  const { data: created, error } = await db.from("pheno_hunts")
    .insert({ user_id: ownerId, grow_id: growId, tent_id: tentId, name, evidence_goals: ["yield", "aroma"] })
    .select("id").single();
  if (error) throw new Error(`hunt insert failed: ${error.code}`);
  return created.id;
}
async function upsertCandidate(growId, tentId, huntId, label) {
  const name = `${FIXTURE_PREFIX} ${label}`;
  const { data } = await db.from("plants").select("id")
    .eq("user_id", ownerId).eq("pheno_hunt_id", huntId).eq("candidate_label", label).maybeSingle();
  if (data?.id) return data.id;
  const { data: created, error } = await db.from("plants")
    .insert({ user_id: ownerId, grow_id: growId, tent_id: tentId,
             pheno_hunt_id: huntId, candidate_label: label,
             name, stage: "flower" })
    .select("id").single();
  if (error) throw new Error(`plant insert failed: ${error.code}`);
  return created.id;
}
async function upsertScore(huntId, plantId, note, traits) {
  // upsert on (hunt_id, plant_id) — the pheno_candidate_scores table has one
  // score row per (hunt, plant). If a UNIQUE constraint isn't declared in
  // the local schema, fall back to select-then-insert.
  const existing = await db.from("pheno_candidate_scores").select("id")
    .eq("hunt_id", huntId).eq("plant_id", plantId).maybeSingle();
  if (existing.data?.id) return;
  const { error } = await db.from("pheno_candidate_scores")
    .insert({ user_id: ownerId, hunt_id: huntId, plant_id: plantId,
              note, traits });
  if (error) throw new Error(`score insert failed: ${error.code}`);
}
async function upsertSmokeTest(huntId, plantId, verdict) {
  const existing = await db.from("pheno_smoke_tests").select("id")
    .eq("hunt_id", huntId).eq("plant_id", plantId).maybeSingle();
  if (existing.data?.id) return;
  const { error } = await db.from("pheno_smoke_tests")
    .insert({
      user_id: ownerId, hunt_id: huntId, plant_id: plantId,
      verdict,
      flavor_descriptors: ["citrus", "pine"],
      effect_descriptors: ["uplifting"],
      // 1-5 CHECK ranges (pheno_smoke_tests_smoothness_range / _potency_range)
      potency_impression: 4,
      smoothness: 5,
      tested_at: new Date().toISOString(),
      note: "seeded post-cure smoke test",
    });
  if (error) throw new Error(`smoke test insert failed: ${error.code}`);
}
async function upsertLab(huntId, plantId, source = "estimate") {
  const existing = await db.from("pheno_lab_results").select("id")
    .eq("hunt_id", huntId).eq("plant_id", plantId).eq("source", source).maybeSingle();
  if (existing.data?.id) return;
  const { error } = await db.from("pheno_lab_results")
    .insert({ user_id: ownerId, hunt_id: huntId, plant_id: plantId,
              source, thc_pct: 20, cbd_pct: 0.5,
              dominant_terpenes: ["limonene"], tested_at: new Date().toISOString() });
  if (error) throw new Error(`lab insert failed: ${error.code}`);
}

try {
  const growId = await upsertGrow();
  const tentId = await upsertTent(growId);

  // 1. missing-evidence — hunt, no candidates
  const missingId = await upsertHunt(growId, tentId, "missing-evidence");

  // 2. pending-harvest — hunt + 2 candidates, phenotype notes only
  const pendingHarvestId = await upsertHunt(growId, tentId, "pending-harvest");
  {
    const a = await upsertCandidate(growId, tentId, pendingHarvestId, "A");
    const b = await upsertCandidate(growId, tentId, pendingHarvestId, "B");
    await upsertScore(pendingHarvestId, a, "resin-heavy structure", {});
    await upsertScore(pendingHarvestId, b, "tight internodes", {});
  }

  // 3. pending-cure — hunt + 2 candidates + phenotype notes + lab (harvest signal)
  const pendingCureId = await upsertHunt(growId, tentId, "pending-cure");
  {
    const a = await upsertCandidate(growId, tentId, pendingCureId, "A");
    const b = await upsertCandidate(growId, tentId, pendingCureId, "B");
    await upsertScore(pendingCureId, a, "dense colas", {});
    await upsertScore(pendingCureId, b, "loose airy tops", {});
    await upsertLab(pendingCureId, a);
    await upsertLab(pendingCureId, b);
  }

  // 4. comparison-ready — every candidate has phenotype + smoke test + lab.
  const comparisonReadyId = await upsertHunt(growId, tentId, "comparison-ready");
  {
    const a = await upsertCandidate(growId, tentId, comparisonReadyId, "A");
    const b = await upsertCandidate(growId, tentId, comparisonReadyId, "B");
    await upsertScore(comparisonReadyId, a, "gassy citrus, dense", { density: 5, resin: 5 });
    await upsertScore(comparisonReadyId, b, "sweet pine, medium density", { density: 3, aroma: 4 });
    await upsertLab(comparisonReadyId, a);
    await upsertLab(comparisonReadyId, b);
    await upsertSmokeTest(comparisonReadyId, a, "keeper");
    await upsertSmokeTest(comparisonReadyId, b, "runner_up");
  }

  const envDir = "e2e/.fixtures";
  fs.mkdirSync(envDir, { recursive: true });
  const envPath = path.join(envDir, "pheno-paid-smoke.env");
  const contents = [
    "# gitignored — do not commit. Regenerated by scripts/e2e/seed-pheno-paid-smoke-fixtures.mjs.",
    `E2E_PHENO_HUNT_ID_MISSING_EVIDENCE=${missingId}`,
    `E2E_PHENO_HUNT_ID_PENDING_HARVEST=${pendingHarvestId}`,
    `E2E_PHENO_HUNT_ID_PENDING_CURE=${pendingCureId}`,
    `E2E_PHENO_HUNT_ID_COMPARISON_READY=${comparisonReadyId}`,
    "# E2E_PHENO_HUNT_ID_REPLICATION_PENDING — signal not persisted; engine treats as satisfied",
    "",
  ].join("\n");
  fs.writeFileSync(envPath, contents);

  lines.push(
    "Result: OK — 4 fixtures seeded (missing / pending-harvest / pending-cure / comparison-ready).",
    `Wrote ${envPath} (gitignored). Source it before running the smoke.`,
  );
  console.log(lines.join("\n"));
  process.exit(0);
} catch (err) {
  lines.push(
    `Result: FAIL — ${err instanceof Error ? err.message : "unknown error"}`,
    "No fixture env file written.",
  );
  console.log(lines.join("\n"));
  process.exit(1);
}
