/**
 * phenoHuntCandidateAdapter — pure mapping from real pheno-hunt rows to the
 * read-only Pheno Comparison view-model input.
 *
 * A "candidate" is a `plants` row tagged with `pheno_hunt_id` + optional
 * `candidate_label`. This adapter turns the hunt's candidate plants into
 * `PhenoCandidateInput[]` for `buildPhenoComparisonView`, so the comparison
 * surface can render a REAL hunt instead of demo fixtures.
 *
 * Pure. No I/O, no Supabase, no React. Evidence arrays (quick logs, timeline,
 * sensor snapshots) are intentionally left unset here — the comparison
 * view-model already flags their absence honestly, and a later slice enriches
 * them. Archived plants are excluded. Nothing is inferred or fabricated.
 */
import type { PhenoCandidateInput } from "@/lib/phenoComparisonViewModel";
import { comparePhenoCandidateIdentity } from "@/lib/phenoCandidateIdentity";
import type {
  PhenoExpressionInput,
  PhenoLabResultInput,
  PhenoSmokeTestInput,
  PhenoTraitValueInput,
} from "@/lib/phenoExpressionRules";

/** Minimal `plants` row shape this adapter needs (subset of the DB Row). */
export interface PhenoHuntCandidatePlantRow {
  id: string;
  name: string;
  candidate_label: string | null;
  /**
   * Owner-assigned candidate number (plants.candidate_number). NULL = legacy /
   * unassigned. Optional so older callers/test stubs that predate the numbering
   * migration stay compatible (missing → treated as unnumbered).
   */
  candidate_number?: number | null;
  strain: string | null;
  stage: string | null;
  grow_id: string | null;
  tent_id: string | null;
  photo_url: string | null;
  is_archived: boolean;
}

/** Optional grower-recorded score card (pheno_candidate_scores). */
export interface PhenoHuntCandidateScoreEvidence {
  readonly traits: Record<string, number> | null;
  readonly note: string | null;
}

/** Optional grower-recorded post-cure smoke test (pheno_smoke_tests). */
export interface PhenoHuntCandidateSmokeEvidence {
  readonly flavorDescriptors: readonly string[] | null;
  readonly effectDescriptors: readonly string[] | null;
  readonly smoothness: number | null;
  readonly potencyImpression: number | null;
  readonly verdict: string | null;
}

/** Optional lab (COA/estimate) evidence (pheno_lab_results). */
export interface PhenoHuntCandidateLabEvidence {
  readonly thcPct: number | null;
  readonly cbdPct: number | null;
  readonly totalCannabinoidsPct: number | null;
  readonly dominantTerpenes: ReadonlyArray<{ name: string; pct: number | null }> | null;
  readonly source: "coa" | "estimate" | "unspecified";
}

export interface AdaptPhenoHuntCandidatesInput {
  readonly plants: readonly PhenoHuntCandidatePlantRow[] | null | undefined;
  /** grow id → display name, for growLabel. */
  readonly growNameById?: Readonly<Record<string, string>> | null;
  /** tent id → display name, for tentLabel. */
  readonly tentNameById?: Readonly<Record<string, string>> | null;
  /** plantId → grower-scored trait card. */
  readonly scoreByPlantId?: Readonly<Record<string, PhenoHuntCandidateScoreEvidence>> | null;
  /** plantId → post-cure smoke test row. */
  readonly smokeTestByPlantId?: Readonly<Record<string, PhenoHuntCandidateSmokeEvidence>> | null;
  /** plantId → best available lab result row (coa > estimate > unspecified). */
  readonly labResultByPlantId?: Readonly<Record<string, PhenoHuntCandidateLabEvidence>> | null;
  /**
   * When true, keep the INPUT row order instead of re-sorting by the identity
   * comparator. The bounded server-paginated read is already ordered by the
   * database (candidate_number NULLS LAST, label, name, id); re-sorting a single
   * page would risk page-boundary inconsistencies, so the paginated path sets
   * this. The full-hunt compare path leaves it false to get canonical ordering.
   */
  readonly preserveOrder?: boolean;
}

/** Flower is the stage where EC/pH/PPFD are treated as relevant metrics. */
function stageRequiresFullMetrics(stage: string | null): boolean {
  return typeof stage === "string" && stage.trim().toLowerCase() === "flower";
}

function cleanLabel(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function stringArray(v: readonly string[] | null | undefined): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const s of v) {
    if (typeof s === "string") {
      const t = s.trim();
      if (t) out.push(t);
    }
  }
  return out;
}

function finiteOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Build the optional `expression` payload for a candidate from grower-recorded
 * evidence rows (scores, smoke test, lab result). Returns `undefined` when no
 * evidence exists — never invents empty scaffolding, so
 * `derivePhenoCompareReadinessFromCandidates` keeps flagging Not comparison-ready.
 *
 * Contract note: replication readiness (clones / mother assignment) is NOT
 * persisted today and the readiness engine treats `undefined` as satisfied.
 * We intentionally do not populate any replication signal here — if/when a
 * table starts persisting it, wire it in explicitly rather than silently.
 */
function buildExpression(
  plantId: string,
  score: PhenoHuntCandidateScoreEvidence | undefined,
  smoke: PhenoHuntCandidateSmokeEvidence | undefined,
  lab: PhenoHuntCandidateLabEvidence | undefined,
): PhenoExpressionInput | undefined {
  const traits: PhenoTraitValueInput[] = [];
  if (score?.traits && typeof score.traits === "object" && !Array.isArray(score.traits)) {
    for (const key of Object.keys(score.traits).sort()) {
      const value = finiteOrNull(score.traits[key]);
      if (value !== null) traits.push({ key, value });
    }
  }
  const noseNote = cleanLabel(score?.note ?? null);

  let smokeTest: PhenoSmokeTestInput | undefined;
  if (smoke) {
    const flavor = stringArray(smoke.flavorDescriptors ?? null);
    const effect = stringArray(smoke.effectDescriptors ?? null);
    const smoothness = finiteOrNull(smoke.smoothness);
    const potency = finiteOrNull(smoke.potencyImpression);
    const verdict = cleanLabel(smoke.verdict ?? null);
    const hasAny =
      flavor.length > 0 ||
      effect.length > 0 ||
      smoothness !== null ||
      potency !== null ||
      !!verdict;
    if (hasAny) {
      smokeTest = {
        flavorDescriptors: flavor,
        effectDescriptors: effect,
        smoothness,
        potencyImpression: potency,
        verdict,
      };
    }
  }

  let labResult: PhenoLabResultInput | undefined;
  if (lab) {
    const terps = Array.isArray(lab.dominantTerpenes)
      ? lab.dominantTerpenes
          .filter((t) => t && typeof t.name === "string" && t.name.trim().length > 0)
          .map((t) => ({ name: t.name.trim(), pct: finiteOrNull(t.pct) }))
      : [];
    const hasAny =
      finiteOrNull(lab.thcPct) !== null ||
      finiteOrNull(lab.cbdPct) !== null ||
      finiteOrNull(lab.totalCannabinoidsPct) !== null ||
      terps.length > 0;
    if (hasAny) {
      labResult = {
        thcPct: finiteOrNull(lab.thcPct),
        cbdPct: finiteOrNull(lab.cbdPct),
        totalCannabinoidsPct: finiteOrNull(lab.totalCannabinoidsPct),
        dominantTerpenes: terps,
        source: lab.source,
      };
    }
  }

  if (traits.length === 0 && !noseNote && !smokeTest && !labResult) {
    return undefined;
  }
  void plantId; // reserved for future per-candidate provenance
  return {
    traits,
    aromaDescriptors: [],
    noseNote,
    smokeTest: smokeTest ?? null,
    labResult: labResult ?? null,
  };
}

/**
 * Map a hunt's candidate plant rows into deterministic
 * `PhenoCandidateInput[]`. Excludes archived plants. Sorts by candidate_label
 * (then name, then id) so the comparison order is stable.
 */
export function adaptPhenoHuntCandidates(
  input: AdaptPhenoHuntCandidatesInput,
): PhenoCandidateInput[] {
  const plants = Array.isArray(input.plants) ? input.plants : [];
  const growNames = input.growNameById ?? {};
  const tentNames = input.tentNameById ?? {};
  const scores = input.scoreByPlantId ?? {};
  const smokes = input.smokeTestByPlantId ?? {};
  const labs = input.labResultByPlantId ?? {};

  const candidates: PhenoCandidateInput[] = [];
  for (const p of plants) {
    if (!p || typeof p.id !== "string" || p.id.length === 0) continue;
    if (p.is_archived === true) continue;

    const stage = cleanLabel(p.stage);
    const requireFull = stageRequiresFullMetrics(stage);
    const photoUrl = cleanLabel(p.photo_url);
    const expression = buildExpression(p.id, scores[p.id], smokes[p.id], labs[p.id]);

    candidates.push({
      candidateId: p.id,
      candidateNumber: validCandidateNumber(p.candidate_number),
      candidateLabel: cleanLabel(p.candidate_label) ?? cleanLabel(p.name),
      plantLabel: cleanLabel(p.name),
      strain: cleanLabel(p.strain),
      stage,
      growLabel: p.grow_id ? (growNames[p.grow_id] ?? null) : null,
      tentLabel: p.tent_id ? (tentNames[p.tent_id] ?? null) : null,
      requireEcPh: requireFull,
      requirePpfd: requireFull,
      photos: photoUrl ? [{ id: `${p.id}-plant-photo`, url: photoUrl }] : [],
      expression,
    });
  }

  // Deterministic identity order: numbered candidates ascending, then
  // unnumbered-labeled alphabetically, then id fallback with an explicit id
  // tie-breaker. Shared with the workspace/compare/export so ordering is
  // identical everywhere (no locale, no randomness). Skipped for the
  // server-paginated path, which is already ordered authoritatively by the DB.
  if (input.preserveOrder !== true) {
    candidates.sort(comparePhenoCandidateIdentity);
  }

  return candidates;
}

/** A valid candidate number is a finite positive integer; else null. */
function validCandidateNumber(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
