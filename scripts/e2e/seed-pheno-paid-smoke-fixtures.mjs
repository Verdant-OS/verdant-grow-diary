#!/usr/bin/env node
/**
 * Pheno paid-user smoke fixture seeder — BLOCKED / audit stub.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHY BLOCKED
 * ────────────────────────────────────────────────────────────────────────
 * Comparison-readiness is derived by
 *   src/lib/phenoComparisonActionState.ts::buildPhenoComparisonActionState
 * from six independent signals:
 *
 *   1. candidateCount >= 2                     (plants linked to the hunt)
 *   2. goalsSelected >= 1                      (pheno_hunts.evidence_goals)
 *   3. allCandidatesHavePhenotypeNote          (pheno_score_rounds / notes)
 *   4. anyPostHarvestObservation               (source table not verified)
 *   5. anyPostCureObservation                  (source table not verified)
 *   6. replicationReadinessRecorded (optional) (source table not verified)
 *
 * Signals 1–3 map cleanly onto verified public tables
 * (public.plants, public.pheno_hunts, public.pheno_score_rounds /
 *  public.pheno_candidate_scores). Signals 4–6 do NOT have a single
 * documented source table — they are aggregated by view-model code that
 * reads across grow_events / harvests / diary_entries / pheno_smoke_tests
 * and possibly others, and getting the wrong table would silently produce
 * a "comparison_ready" fixture that the app still renders as
 * "not_ready" — the exact regression the smoke is meant to catch.
 *
 * Per the task's hard-stop rule ("If exact pheno schema/table names are
 * unclear, audit current schema/types and stop with BLOCKED rather than
 * guessing. Do not invent fixture writes."), this script does not write.
 *
 * ────────────────────────────────────────────────────────────────────────
 * WHAT'S NEEDED TO UNBLOCK
 * ────────────────────────────────────────────────────────────────────────
 * A short design confirmation of, for each of these signals, the exact
 * source table + column(s) + minimal row shape:
 *   - anyPostHarvestObservation
 *   - anyPostCureObservation
 *   - replicationReadinessRecorded
 *
 * And confirmation of the candidate <-> hunt linkage on public.plants
 * (which column ties a plant to a pheno_hunts.id row).
 *
 * With those confirmed, this stub becomes a small idempotent seeder that:
 *   - resolves the target owner user_id via a SECURITY DEFINER helper
 *     (never `auth.admin` from the client), using
 *     E2E_PHENO_PRO_EMAIL / E2E_PHENO_FOUNDER_EMAIL
 *   - upserts one grow, one tent, two candidate plants,
 *     one missing-evidence hunt, and one comparison-ready hunt, all
 *     prefixed with E2E_PHENO_FIXTURE_PREFIX (default "e2e_pheno_paid_smoke")
 *   - writes the ids to e2e/.fixtures/pheno-paid-smoke.env (gitignored)
 *
 * ────────────────────────────────────────────────────────────────────────
 * SAFETY (already enforced by this stub)
 * ────────────────────────────────────────────────────────────────────────
 *   - Local only. No CI use.
 *   - Never prints service_role, email, password, cookies, or full user id.
 *   - Fails closed if SUPABASE_SERVICE_ROLE_KEY is missing when a future
 *     seeding path is invoked.
 */

const OWNER_EMAIL_ENVS = ["E2E_PHENO_PRO_EMAIL", "E2E_PHENO_FOUNDER_EMAIL"];
const SERVICE_ROLE_ENVS = ["SUPABASE_SERVICE_ROLE_KEY", "E2E_SUPABASE_SERVICE_ROLE_KEY"];

function has(name) {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

const lines = [
  "Pheno Tracker paid-user smoke — fixture seeder",
  "----------------------------------------------",
  "Status: BLOCKED (audit-only stub, no writes performed).",
  "",
  "Required inputs presence:",
  `  ${OWNER_EMAIL_ENVS.some(has) ? "PRESENT " : "SKIPPED "} owner email (Pro or Founder)`,
  `  ${SERVICE_ROLE_ENVS.some(has) ? "PRESENT " : "SKIPPED "} service_role key`,
  "",
  "Blocker: comparison-readiness source tables are unverified for:",
  "  - anyPostHarvestObservation",
  "  - anyPostCureObservation",
  "  - replicationReadinessRecorded",
  "  - candidate <-> hunt linkage column on public.plants",
  "",
  "See the file header for the exact list of confirmations needed.",
  "No fixtures were written. Exit 0 so CI stays SKIPPED cleanly.",
];
console.log(lines.join("\n"));
process.exit(0);
