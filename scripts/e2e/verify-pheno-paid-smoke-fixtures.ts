#!/usr/bin/env bun
/**
 * Pheno Tracker paid-user smoke — post-seed hydration verifier.
 *
 * Exercises the SAME adapter + readiness code the app uses:
 *   - adaptPhenoHuntCandidates
 *   - derivePhenoCompareReadinessFromCandidates
 *
 * Loads the comparison-ready hunt's real evidence rows (scores, smoke tests,
 * lab results) via a local Supabase service_role client, feeds them through
 * the production adapter, then asserts:
 *   - ≥ 2 non-archived candidates
 *   - every required candidate has a non-empty `expression`
 *   - derivePhenoCompareReadinessFromCandidates returns "comparison_ready"
 *
 * SAFETY:
 *   - Local only. Refuses hosted supabase.co / supabase.in / lovable.*.
 *   - Never prints secret values (service_role, emails, passwords, JWTs,
 *     cookies, fixture UUIDs, DB creds). Only status + env var names.
 *
 * Status:
 *   HYDRATED  — comparison-ready fixture verified end-to-end.
 *   SEEDABLE  — local env present, fixture not seeded yet.
 *   SKIPPED   — required local env missing.
 *   BLOCKED   — fixture exists but adapter/readiness rejected it.
 *   FAIL      — unsafe host, malformed config, or unreadable inputs.
 *
 * Exit codes:
 *   0 = HYDRATED | SEEDABLE | SKIPPED
 *   1 = FAIL
 *   2 = BLOCKED
 */
import { adaptPhenoHuntCandidates } from "../../src/lib/phenoHuntCandidateAdapter";
import { derivePhenoCompareReadinessFromCandidates } from "../../src/lib/phenoComparisonActionState";

const SUPABASE_URL_ENVS = ["E2E_SUPABASE_URL", "SUPABASE_URL"];
const SERVICE_ROLE_ENVS = ["SUPABASE_SERVICE_ROLE_KEY", "E2E_SUPABASE_SERVICE_ROLE_KEY"];
const HOSTED_MARKERS = ["supabase.co", "supabase.in", "lovable.app", "lovable.dev"];

type Status = "HYDRATED" | "SEEDABLE" | "SKIPPED" | "BLOCKED" | "FAIL";

function firstPresent(names: string[]): string | null {
  for (const n of names) {
    const v = process.env[n];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  return null;
}

function finish(status: Status, lines: string[]): never {
  console.log(["Pheno paid-smoke — hydration verify", "----------------------------------", ...lines, `Result: ${status}`].join("\n"));
  const exit = status === "HYDRATED" || status === "SEEDABLE" || status === "SKIPPED" ? 0 : status === "BLOCKED" ? 2 : 1;
  process.exit(exit);
}

/** Extracted for direct unit testing without any Supabase I/O. */
export interface VerifyRows {
  readonly plants: readonly {
    id: string;
    name: string;
    candidate_label: string | null;
    strain: string | null;
    stage: string | null;
    grow_id: string | null;
    tent_id: string | null;
    photo_url: string | null;
    is_archived: boolean;
  }[];
  readonly scores: readonly { plant_id: string; traits: unknown; note: string | null }[];
  readonly smoke: readonly {
    plant_id: string;
    flavor_descriptors: unknown;
    effect_descriptors: unknown;
    smoothness: number | null;
    potency_impression: number | null;
    verdict: string | null;
  }[];
  readonly labs: readonly {
    plant_id: string;
    source: string | null;
    thc_pct: number | null;
    cbd_pct: number | null;
    total_cannabinoids_pct: number | null;
    dominant_terpenes: unknown;
  }[];
}

export interface VerifyOutcome {
  status: "HYDRATED" | "BLOCKED";
  candidateCount: number;
  candidatesWithExpression: number;
  readiness: string;
  reason: string | null;
}

/** Pure verifier: runs rows through the real adapter + readiness code. */
export function verifyComparisonReadyRows(huntId: string, rows: VerifyRows): VerifyOutcome {
  const scoreByPlantId: Record<string, { traits: Record<string, number> | null; note: string | null }> = {};
  for (const r of rows.scores) {
    if (!r.plant_id || scoreByPlantId[r.plant_id]) continue;
    const traits = r.traits && typeof r.traits === "object" && !Array.isArray(r.traits)
      ? (r.traits as Record<string, number>)
      : null;
    scoreByPlantId[r.plant_id] = { traits, note: typeof r.note === "string" ? r.note : null };
  }
  const smokeTestByPlantId: Record<string, {
    flavorDescriptors: string[] | null;
    effectDescriptors: string[] | null;
    smoothness: number | null;
    potencyImpression: number | null;
    verdict: string | null;
  }> = {};
  for (const r of rows.smoke) {
    if (!r.plant_id || smokeTestByPlantId[r.plant_id]) continue;
    smokeTestByPlantId[r.plant_id] = {
      flavorDescriptors: Array.isArray(r.flavor_descriptors)
        ? (r.flavor_descriptors.filter((v) => typeof v === "string") as string[])
        : null,
      effectDescriptors: Array.isArray(r.effect_descriptors)
        ? (r.effect_descriptors.filter((v) => typeof v === "string") as string[])
        : null,
      smoothness: r.smoothness,
      potencyImpression: r.potency_impression,
      verdict: r.verdict,
    };
  }
  const LAB_RANK: Record<string, number> = { coa: 3, estimate: 2, unspecified: 1 };
  const labResultByPlantId: Record<string, {
    thcPct: number | null;
    cbdPct: number | null;
    totalCannabinoidsPct: number | null;
    dominantTerpenes: ReadonlyArray<{ name: string; pct: number | null }> | null;
    source: "coa" | "estimate" | "unspecified";
  }> = {};
  for (const r of rows.labs) {
    if (!r.plant_id) continue;
    const source: "coa" | "estimate" | "unspecified" =
      r.source === "coa" || r.source === "estimate" ? r.source : "unspecified";
    const existing = labResultByPlantId[r.plant_id];
    if (existing && LAB_RANK[existing.source] >= LAB_RANK[source]) continue;
    const terps = Array.isArray(r.dominant_terpenes)
      ? (r.dominant_terpenes
          .filter((t: unknown): t is { name: string; pct?: unknown } =>
            !!t && typeof t === "object" && typeof (t as { name?: unknown }).name === "string")
          .map((t) => ({
            name: (t as { name: string }).name,
            pct: typeof (t as { pct?: unknown }).pct === "number" ? ((t as { pct: number }).pct) : null,
          }))) as ReadonlyArray<{ name: string; pct: number | null }>
      : null;
    labResultByPlantId[r.plant_id] = {
      thcPct: r.thc_pct,
      cbdPct: r.cbd_pct,
      totalCannabinoidsPct: r.total_cannabinoids_pct,
      dominantTerpenes: terps,
      source,
    };
  }

  const candidates = adaptPhenoHuntCandidates({
    plants: rows.plants as never,
    scoreByPlantId,
    smokeTestByPlantId,
    labResultByPlantId,
  });

  const candidatesWithExpression = candidates.filter((c) => !!c.expression).length;
  const state = derivePhenoCompareReadinessFromCandidates(huntId, candidates);

  if (candidates.length < 2) {
    return {
      status: "BLOCKED",
      candidateCount: candidates.length,
      candidatesWithExpression,
      readiness: state.readiness,
      reason: "fewer than 2 candidates",
    };
  }
  if (candidatesWithExpression < candidates.length) {
    return {
      status: "BLOCKED",
      candidateCount: candidates.length,
      candidatesWithExpression,
      readiness: state.readiness,
      reason: "candidate has empty expression",
    };
  }
  if (state.readiness !== "comparison_ready") {
    return {
      status: "BLOCKED",
      candidateCount: candidates.length,
      candidatesWithExpression,
      readiness: state.readiness,
      reason: `readiness=${state.readiness}`,
    };
  }
  return {
    status: "HYDRATED",
    candidateCount: candidates.length,
    candidatesWithExpression,
    readiness: state.readiness,
    reason: null,
  };
}

// ─── CLI ─────────────────────────────────────────────────────────────────
async function main() {
  // When imported by tests, exit early.
  if (process.env.VERIFY_PHENO_SMOKE_LIB_ONLY === "1") return;

  const lines: string[] = [];
  const supabaseUrl = firstPresent(SUPABASE_URL_ENVS);
  const serviceRole = firstPresent(SERVICE_ROLE_ENVS);
  const huntIdEnv = "E2E_PHENO_HUNT_ID_COMPARISON_READY";
  const huntId = process.env[huntIdEnv];

  lines.push(`  ${supabaseUrl ? "PRESENT " : "SKIPPED "} SUPABASE_URL`);
  lines.push(`  ${serviceRole ? "PRESENT " : "SKIPPED "} SUPABASE_SERVICE_ROLE_KEY`);
  lines.push(`  ${huntId ? "PRESENT " : "SKIPPED "} ${huntIdEnv}`);

  if (!supabaseUrl || !serviceRole) {
    lines.push("  (local Supabase env missing — nothing to verify)");
    finish("SKIPPED", lines);
  }
  // Refuse hosted hosts.
  let host = "";
  try { host = new URL(supabaseUrl!).host.toLowerCase(); } catch { /* noop */ }
  if (HOSTED_MARKERS.some((m) => host.endsWith(m))) {
    lines.push(`  FAIL  refused hosted Supabase host`);
    finish("FAIL", lines);
  }
  if (!huntId) {
    lines.push(`  (fixture not seeded yet — run seed-pheno-paid-smoke-fixtures)`);
    finish("SEEDABLE", lines);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(supabaseUrl!, serviceRole!, { auth: { persistSession: false } });

  const { data: plantRows, error: plantsError } = await db
    .from("plants")
    .select("id, name, candidate_label, strain, stage, grow_id, tent_id, photo_url, is_archived")
    .eq("pheno_hunt_id", huntId!)
    .eq("is_archived", false);
  if (plantsError) { lines.push("  FAIL  could not load plants"); finish("FAIL", lines); }
  const plants = (plantRows ?? []) as VerifyRows["plants"];
  const plantIds = plants.map((p) => p.id);
  if (plantIds.length === 0) {
    lines.push("  BLOCKED  no candidate plants attached to hunt");
    finish("BLOCKED", lines);
  }

  const [scoresRes, smokeRes, labsRes] = await Promise.all([
    db.from("pheno_candidate_scores").select("plant_id, traits, note").eq("hunt_id", huntId!).in("plant_id", plantIds),
    db.from("pheno_smoke_tests")
      .select("plant_id, flavor_descriptors, effect_descriptors, smoothness, potency_impression, verdict")
      .eq("hunt_id", huntId!).in("plant_id", plantIds),
    db.from("pheno_lab_results")
      .select("plant_id, source, thc_pct, cbd_pct, total_cannabinoids_pct, dominant_terpenes")
      .eq("hunt_id", huntId!).in("plant_id", plantIds),
  ]);
  if (scoresRes.error || smokeRes.error || labsRes.error) {
    lines.push("  FAIL  could not load evidence tables");
    finish("FAIL", lines);
  }

  const outcome = verifyComparisonReadyRows(huntId!, {
    plants,
    scores: (scoresRes.data ?? []) as VerifyRows["scores"],
    smoke: (smokeRes.data ?? []) as VerifyRows["smoke"],
    labs: (labsRes.data ?? []) as VerifyRows["labs"],
  });

  lines.push(`  candidates=${outcome.candidateCount} withExpression=${outcome.candidatesWithExpression} readiness=${outcome.readiness}`);
  if (outcome.status === "BLOCKED") {
    lines.push(`  BLOCKED  ${outcome.reason ?? "adapter/readiness rejected fixture"}`);
    finish("BLOCKED", lines);
  }
  lines.push("  OK  comparison-ready fixture verified through production adapter + readiness code");
  finish("HYDRATED", lines);
}

// Only run CLI when invoked directly (not on test import).
const isDirect = (() => {
  try {
    const argv1 = process.argv[1] ?? "";
    return argv1.endsWith("verify-pheno-paid-smoke-fixtures.ts")
      || argv1.endsWith("verify-pheno-paid-smoke-fixtures");
  } catch { return false; }
})();
if (isDirect) {
  main().catch((e) => {
    console.log("Pheno paid-smoke — hydration verify\n----------------------------------");
    console.log(`  FAIL  ${e instanceof Error ? e.message : "unknown error"}`);
    console.log("Result: FAIL");
    process.exit(1);
  });
}
