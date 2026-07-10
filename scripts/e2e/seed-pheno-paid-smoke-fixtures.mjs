#!/usr/bin/env node
/**
 * Pheno paid-user smoke fixture seeder — schema-audit results + partial seed.
 *
 * ────────────────────────────────────────────────────────────────────────
 * SCHEMA AUDIT RESULTS (verified against live public schema)
 * ────────────────────────────────────────────────────────────────────────
 *
 * A. Plant → hunt linkage
 *    Table:   public.plants
 *    Column:  pheno_hunt_id (uuid, nullable, FK → pheno_hunts.id ON DELETE SET NULL)
 *    Label:   candidate_label (text, nullable) — optional display label
 *    Adapter: src/lib/phenoHuntCandidateAdapter.ts (excludes is_archived)
 *    Reader:  src/lib/phenoHuntCandidatesService.ts
 *             SELECT id, name, candidate_label, strain, stage, grow_id,
 *                    tent_id, photo_url, is_archived
 *             FROM plants WHERE pheno_hunt_id = :id AND is_archived = false
 *    Seed shape (per candidate):
 *      { user_id, grow_id, tent_id, name, stage:'flower',
 *        pheno_hunt_id: <hunt>, candidate_label: 'A'|'B' }
 *
 * B. anyPostHarvestObservation
 *    Derived in src/lib/phenoComparisonActionState.ts::hasHarvestSignal:
 *      candidate.expression.smokeTest present  OR
 *      candidate.expression.labResult present
 *    Persisted sources:
 *      - public.pheno_smoke_tests (hunt_id, plant_id, verdict|flavor|effect)
 *      - public.pheno_lab_results (hunt_id, plant_id, source, ...)
 *    Minimal fixture rows OK to write.
 *
 * C. anyPostCureObservation
 *    Derived from candidate.expression.smokeTest with verdict/flavor/effect.
 *    Persisted source: public.pheno_smoke_tests only.
 *
 * D. replicationReadinessRecorded
 *    Not currently persisted as a first-class signal. The engine treats
 *    `undefined` as satisfied (post-cure is the deciding gate). No blocker.
 *    (Related tables exist — public.pheno_keeper_clones, public.pheno_keepers,
 *    public.pheno_keeper_decisions — but the derivation does not consult them.)
 *
 * ────────────────────────────────────────────────────────────────────────
 * ⚠ REMAINING BLOCKER (product-code, not schema)
 * ────────────────────────────────────────────────────────────────────────
 * The comparison read path DOES NOT hydrate `expression` on candidates:
 *   - src/lib/phenoHuntCandidateAdapter.ts::adaptPhenoHuntCandidates
 *     never populates PhenoCandidateInput.expression
 *   - src/lib/phenoHuntCandidatesService.ts::loadPhenoHuntCandidates
 *     never queries pheno_candidate_scores / pheno_smoke_tests /
 *     pheno_lab_results
 *   - src/pages/PhenoHuntCompare.tsx calls
 *     derivePhenoCompareReadinessFromCandidates(id, candidates)
 *     with those un-hydrated candidates
 *
 * Consequence: no amount of seeded rows in pheno_smoke_tests /
 * pheno_lab_results / pheno_candidate_scores can make the /compare surface
 * report `comparison_ready` today. The gate always resolves to not_ready
 * on the Compare page.
 *
 * Smallest safe product-code fix (out of scope for this task):
 *   Extend loadPhenoHuntCandidates to also SELECT the three per-plant
 *   evidence tables and pass them into adaptPhenoHuntCandidates, which
 *   maps them into PhenoCandidateInput.expression (traits, aroma, smokeTest,
 *   labResult) using existing PhenoExpressionInput shapes.
 *
 * Per this task's rules ("no product expansion", "no fake fixtures", "If a
 * signal is not currently persisted, report BLOCKED"), this seeder does
 * NOT hack around the gap — a comparison_ready fixture cannot be produced
 * end-to-end without that product-code change.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT THIS SEEDER WILL DO (local-only, when unblocked)
 * ────────────────────────────────────────────────────────────────────────
 *  ✔ missing-evidence hunt  — SEEDABLE now (hunt row + 0 candidates)
 *  ✔ pending harvest hunt   — SEEDABLE now (hunt + 2 candidates, no smoke/lab)
 *  ✔ pending cure hunt      — SEEDABLE now (hunt + 2 candidates + 1 lab result)
 *  ✘ comparison-ready hunt  — BLOCKED on product-code gap above
 *  ✘ replication pending    — BLOCKED (signal is not persisted anywhere)
 *
 * Actual writes remain disabled until:
 *   1. A local Supabase (not Lovable Cloud production) is available
 *   2. SUPABASE_SERVICE_ROLE_KEY is exported in the local shell
 *   3. E2E_PHENO_PRO_EMAIL (or _FOUNDER_EMAIL) resolves to an existing
 *      auth.users row on that local instance
 *
 * Without all three, the script exits cleanly (CI stays SKIPPED).
 *
 * ────────────────────────────────────────────────────────────────────────
 * SAFETY
 * ────────────────────────────────────────────────────────────────────────
 *  - Local only. NEVER targets production. Refuses to run against
 *    supabase.co / lovable.app hostnames.
 *  - NEVER logs service_role, emails, passwords, cookies, JWTs, or full
 *    user ids. Fixture UUIDs are the only ids emitted (to the gitignored
 *    e2e/.fixtures/pheno-paid-smoke.env file).
 *  - Uses public schema tables only. No auth.admin, no auth.users writes.
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
  "Per-fixture readiness (see file header for schema audit):",
  "  SEEDABLE  E2E_PHENO_HUNT_ID_MISSING_EVIDENCE   (hunt row, no candidates)",
  "  SEEDABLE  E2E_PHENO_HUNT_ID_PENDING_HARVEST    (hunt + candidates, no smoke/lab)",
  "  SEEDABLE  E2E_PHENO_HUNT_ID_PENDING_CURE       (hunt + candidates + lab only)",
  "  BLOCKED   E2E_PHENO_HUNT_ID_COMPARISON_READY   (compare read path does not hydrate expression)",
  "  BLOCKED   E2E_PHENO_HUNT_ID_REPLICATION_PENDING (signal not persisted anywhere)",
  "",
  "Input presence:",
  `  ${supabaseUrl ? "PRESENT " : "SKIPPED "} local Supabase URL`,
  `  ${serviceRole ? "PRESENT " : "SKIPPED "} service_role key`,
  `  ${ownerEmail ? "PRESENT " : "SKIPPED "} owner email (Pro or Founder)`,
  "",
];

if (!supabaseUrl || !serviceRole || !ownerEmail) {
  lines.push(
    "Result: SKIPPED — required local inputs missing. No writes attempted.",
    "See file header for the exact local setup this seeder needs.",
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

// Resolve owner user_id via public.profiles (never expose auth.users to callers).
// Local sandbox seed convention: profiles.email mirrors auth.users.email.
const { data: profile, error: profileErr } = await db
  .from("profiles")
  .select("id")
  .eq("email", ownerEmail)
  .maybeSingle();
if (profileErr || !profile?.id) {
  lines.push(
    "Result: FAIL — owner email did not resolve to a local profiles row.",
    "Create the local test account first, then re-run.",
  );
  console.log(lines.join("\n"));
  process.exit(1);
}
const ownerId = profile.id;

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
async function upsertLab(huntId, plantId) {
  const { error } = await db.from("pheno_lab_results")
    .upsert({ user_id: ownerId, hunt_id: huntId, plant_id: plantId, source: "estimate", thc_pct: 20 },
            { onConflict: "hunt_id,plant_id,source" });
  if (error) throw new Error(`lab insert failed: ${error.code}`);
}

try {
  const growId = await upsertGrow();
  const tentId = await upsertTent(growId);

  const missingId = await upsertHunt(growId, tentId, "missing-evidence");
  // no candidates → missing-evidence

  const pendingHarvestId = await upsertHunt(growId, tentId, "pending-harvest");
  await upsertCandidate(growId, tentId, pendingHarvestId, "A");
  await upsertCandidate(growId, tentId, pendingHarvestId, "B");

  const pendingCureId = await upsertHunt(growId, tentId, "pending-cure");
  const pA = await upsertCandidate(growId, tentId, pendingCureId, "A");
  const pB = await upsertCandidate(growId, tentId, pendingCureId, "B");
  await upsertLab(pendingCureId, pA);
  await upsertLab(pendingCureId, pB);

  const envDir = "e2e/.fixtures";
  fs.mkdirSync(envDir, { recursive: true });
  const envPath = path.join(envDir, "pheno-paid-smoke.env");
  const contents = [
    "# gitignored — do not commit. Regenerated by scripts/e2e/seed-pheno-paid-smoke-fixtures.mjs.",
    `E2E_PHENO_HUNT_ID_MISSING_EVIDENCE=${missingId}`,
    `E2E_PHENO_HUNT_ID_PENDING_HARVEST=${pendingHarvestId}`,
    `E2E_PHENO_HUNT_ID_PENDING_CURE=${pendingCureId}`,
    "# E2E_PHENO_HUNT_ID_COMPARISON_READY — BLOCKED, see seeder header",
    "# E2E_PHENO_HUNT_ID_REPLICATION_PENDING — BLOCKED, signal not persisted",
    "",
  ].join("\n");
  fs.writeFileSync(envPath, contents);

  lines.push(
    "Result: PARTIAL — 3 of 5 fixtures seeded, 2 BLOCKED.",
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
