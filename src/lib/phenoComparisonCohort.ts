/**
 * phenoComparisonCohort — pure helpers for the grower-selected comparison
 * cohort: a bounded (2–6) subset of a hunt's candidates the grower explicitly
 * chooses to compare side by side.
 *
 * The cohort travels to the read-only compare route as a `candidates` query
 * param (`/pheno-hunts/:id/compare?candidates=id1,id2`). Selection is by
 * candidate id (= plants.id); hunt isolation is enforced by intersecting the
 * requested ids with the hunt's OWN candidate ids at read time, so an id from
 * another hunt can never enter the cohort.
 *
 * Pure. No I/O, no React, no Supabase, no randomness. Never ranks or reorders
 * toward a "winner" — selection order is the grower's, comparison stays
 * evidence-first and read-only.
 */

export const PHENO_COHORT_MIN = 2;
export const PHENO_COHORT_MAX = 6;
export const PHENO_COHORT_PARAM = "candidates";

function cleanId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/** Ordered, de-duplicated candidate ids parsed from a `candidates` param value. */
export function parseCohortParamValue(raw: string | null | undefined): string[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const id = cleanId(decodeURIComponent(part));
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Read the cohort ids out of a URLSearchParams / query string. */
export function readCohortFromSearch(
  search: string | URLSearchParams | null | undefined,
): string[] {
  if (!search) return [];
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return parseCohortParamValue(params.get(PHENO_COHORT_PARAM));
}

/** Serialise cohort ids to a `candidates=…` query fragment (URI-encoded). */
export function serializeCohortParam(ids: readonly string[]): string {
  const clean = dedupeIds(ids);
  if (clean.length === 0) return "";
  return `${PHENO_COHORT_PARAM}=${clean.map((id) => encodeURIComponent(id)).join(",")}`;
}

function dedupeIds(ids: readonly string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = cleanId(raw);
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/**
 * Build the compare route href. With no (or too few) ids it links to the plain
 * compare route (which shows the whole hunt — the existing behaviour). With a
 * cohort it appends the `candidates` param.
 */
export function buildPhenoCompareHref(huntId: string, ids: readonly string[] = []): string {
  const base = `/pheno-hunts/${huntId}/compare`;
  const q = serializeCohortParam(ids);
  return q ? `${base}?${q}` : base;
}

export function isValidCohortSize(count: number): boolean {
  return Number.isInteger(count) && count >= PHENO_COHORT_MIN && count <= PHENO_COHORT_MAX;
}

/**
 * Restrict a requested cohort to a hunt's OWN candidate ids, preserving the
 * hunt's canonical order. This is the hunt-isolation gate: ids not belonging to
 * the hunt are dropped. Returns the intersected ids in hunt order.
 */
export function restrictCohortToHunt(
  requestedIds: readonly string[],
  huntCandidateIds: readonly string[],
): string[] {
  const requested = new Set(dedupeIds(requestedIds));
  return huntCandidateIds.filter((id) => requested.has(id));
}

export interface CohortToggleResult {
  readonly ids: string[];
  /** True when the toggle was blocked because the cohort is already at max. */
  readonly atMax: boolean;
}

/**
 * Toggle a candidate id in a cohort selection. Adding past PHENO_COHORT_MAX is
 * refused (returns the unchanged set with atMax=true). Selection order is
 * preserved; removing is always allowed.
 */
export function toggleCohortMember(
  current: readonly string[],
  id: string,
  max: number = PHENO_COHORT_MAX,
): CohortToggleResult {
  const clean = dedupeIds(current);
  const cleanId2 = cleanId(id);
  if (!cleanId2) return { ids: clean, atMax: false };
  if (clean.includes(cleanId2)) {
    return { ids: clean.filter((x) => x !== cleanId2), atMax: false };
  }
  if (clean.length >= max) return { ids: clean, atMax: true };
  return { ids: [...clean, cleanId2], atMax: false };
}
