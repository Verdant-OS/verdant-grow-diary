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

  const candidates: PhenoCandidateInput[] = [];
  for (const p of plants) {
    if (!p || typeof p.id !== "string" || p.id.length === 0) continue;
    if (p.is_archived === true) continue;

    const stage = cleanLabel(p.stage);
    const requireFull = stageRequiresFullMetrics(stage);
    const photoUrl = cleanLabel(p.photo_url);

    candidates.push({
      candidateId: p.id,
      candidateLabel: cleanLabel(p.candidate_label) ?? cleanLabel(p.name),
      plantLabel: cleanLabel(p.name),
      strain: cleanLabel(p.strain),
      stage,
      growLabel: p.grow_id ? (growNames[p.grow_id] ?? null) : null,
      tentLabel: p.tent_id ? (tentNames[p.tent_id] ?? null) : null,
      requireEcPh: requireFull,
      requirePpfd: requireFull,
      photos: photoUrl ? [{ id: `${p.id}-plant-photo`, url: photoUrl }] : [],
    });
  }

  candidates.sort((a, b) => {
    const al = (a.candidateLabel ?? a.plantLabel ?? "").toLowerCase();
    const bl = (b.candidateLabel ?? b.plantLabel ?? "").toLowerCase();
    if (al !== bl) return al < bl ? -1 : 1;
    return a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0;
  });

  return candidates;
}
