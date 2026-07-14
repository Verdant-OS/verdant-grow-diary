/**
 * Pure filter + sort helpers for persisted PHENOHUNT stress testing
 * observations. Deterministic, null-safe, no side effects, no I/O.
 *
 * Presenter-only usage: RLS still restricts what rows the caller can load;
 * these helpers only shape what's already in memory.
 */
import type { PhenoStressObservationRow } from "./phenoStressObservationsApi";
import type {
  PhenoStressStatus,
  PhenoStressIntensity,
  PhenoStressRecommendation,
} from "./phenoStressObservationValidation";

export type StressStatusFilter = "all" | PhenoStressStatus;
export type StressIntensityFilter = "all" | PhenoStressIntensity;
export type StressRecommendationFilter = "all" | PhenoStressRecommendation;

export type StressSortKey =
  | "newest"
  | "oldest"
  | "intensity"
  | "recommendation"
  | "candidate";

export interface StressFilterSortOptions {
  readonly status?: StressStatusFilter;
  readonly intensity?: StressIntensityFilter;
  readonly recommendation?: StressRecommendationFilter;
  readonly sortBy?: StressSortKey;
}

const INTENSITY_RANK: Record<PhenoStressIntensity, number> = {
  low: 0,
  moderate: 1,
  high: 2,
};

const RECOMMENDATION_RANK: Record<PhenoStressRecommendation, number> = {
  keep: 0,
  watch: 1,
  reject: 2,
};

function cmpNum(a: number, b: number): number {
  return a - b;
}

function cmpStr(a: string | null | undefined, b: string | null | undefined): number {
  const av = a ?? "";
  const bv = b ?? "";
  if (av < bv) return -1;
  if (av > bv) return 1;
  return 0;
}

/**
 * Filter then sort. Sorting always tie-breaks on createdAt DESC → id ASC so
 * ordering stays deterministic across renders.
 */
export function filterAndSortStressObservations(
  rows: readonly PhenoStressObservationRow[],
  opts: StressFilterSortOptions = {},
): readonly PhenoStressObservationRow[] {
  const {
    status = "all",
    intensity = "all",
    recommendation = "all",
    sortBy = "newest",
  } = opts;

  const filtered = rows.filter((r) => {
    if (status !== "all" && r.status !== status) return false;
    if (intensity !== "all" && r.intensity !== intensity) return false;
    if (recommendation !== "all" && r.recommendation !== recommendation) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    let primary = 0;
    switch (sortBy) {
      case "newest":
        primary = cmpStr(b.createdAt, a.createdAt);
        break;
      case "oldest":
        primary = cmpStr(a.createdAt, b.createdAt);
        break;
      case "intensity":
        primary = cmpNum(INTENSITY_RANK[b.intensity], INTENSITY_RANK[a.intensity]);
        break;
      case "recommendation":
        primary = cmpNum(
          RECOMMENDATION_RANK[a.recommendation],
          RECOMMENDATION_RANK[b.recommendation],
        );
        break;
      case "candidate":
        primary = cmpStr(a.plantId, b.plantId);
        break;
    }
    if (primary !== 0) return primary;
    // Deterministic tie-breakers.
    const tie = cmpStr(b.createdAt, a.createdAt);
    if (tie !== 0) return tie;
    return cmpStr(a.id, b.id);
  });

  return sorted;
}
