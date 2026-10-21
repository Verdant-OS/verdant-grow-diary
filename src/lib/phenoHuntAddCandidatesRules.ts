/**
 * Pure rules for adding plants to an EXISTING pheno hunt.
 *
 * A candidate is a `plants` row tagged with `pheno_hunt_id`, `candidate_label`
 * and `candidate_number`. These helpers decide which plants may join a hunt and
 * which numbers / labels they receive. They never touch existing candidates.
 * No React, no Supabase, no clock.
 */

export interface PhenoHuntAddCandidatePlant {
  readonly id: string;
  readonly name: string | null;
  readonly grow_id: string | null;
  readonly pheno_hunt_id: string | null;
  readonly is_archived?: boolean | null;
}

export type AddCandidateFailureReason =
  | "ineligible"
  | "entitlement"
  | "not_owner"
  | "duplicate"
  | "hunt_not_found"
  | "invalid"
  | "network";

/** Calm, grower-facing copy. Pinned here so tests can assert exact strings. */
export const PHENO_HUNT_ADD_CANDIDATES_COPY = {
  ineligible:
    "That plant can't be added. It may already be in a pheno hunt or belong to a different grow.",
  entitlement: "Adding numbered candidates needs Pro. Nothing was changed for that plant.",
  not_owner: "Only the hunt owner can add candidates. Nothing was changed.",
  duplicate:
    "Another number was taken at the same moment. Nothing was changed for that plant; try again.",
  hunt_not_found: "This pheno hunt could not be found. Refresh and try again.",
  invalid: "Pick at least one plant to add.",
  network: "Could not add that plant right now. Nothing was changed; try again.",
} as const satisfies Record<AddCandidateFailureReason, string>;

/** Bounded retry when a concurrent writer takes the planned candidate number. */
export const PHENO_HUNT_ADD_CANDIDATES_MAX_NUMBER_ATTEMPTS = 3;

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function sortKey(plant: PhenoHuntAddCandidatePlant): string {
  return (plant.name ?? "").trim().toLowerCase();
}

/**
 * Plants that may join the hunt: same grow as the hunt, not archived, and not
 * already a candidate of ANY hunt. Stable order: name (case-insensitive), then id.
 */
export function selectEligiblePhenoHuntPlants(
  plants: readonly PhenoHuntAddCandidatePlant[] | null | undefined,
  hunt: { readonly grow_id: string | null } | null | undefined,
): PhenoHuntAddCandidatePlant[] {
  const growId = hunt?.grow_id ?? null;
  if (!growId || !Array.isArray(plants)) return [];
  return plants
    .filter(
      (p) =>
        p != null &&
        typeof p.id === "string" &&
        p.id.length > 0 &&
        p.grow_id === growId &&
        p.pheno_hunt_id == null &&
        p.is_archived !== true,
    )
    .slice()
    .sort((a, b) => {
      const ka = sortKey(a);
      const kb = sortKey(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

/** Highest valid candidate number in the hunt, or 0 when none is numbered. */
export function maxPhenoCandidateNumber(
  numbers: readonly (number | null | undefined)[] | null | undefined,
): number {
  if (!Array.isArray(numbers)) return 0;
  return numbers.reduce<number>((max, n) => (isPositiveInteger(n) && n > max ? n : max), 0);
}

/** Next `count` numbers after the current max, in pick order: max+1, max+2, ... */
export function planNextPhenoCandidateNumbers(
  existingNumbers: readonly (number | null | undefined)[] | null | undefined,
  count: number,
): number[] {
  if (!Number.isInteger(count) || count <= 0) return [];
  const max = maxPhenoCandidateNumber(existingNumbers);
  return Array.from({ length: count }, (_, i) => max + i + 1);
}

/**
 * Label for an added candidate. Setup labels candidates "#1", "#2", ... by
 * position (`defaultCandidateLabel`); an added candidate takes "#<number>" so
 * label and number agree. Existing labels are never rewritten.
 */
export function phenoCandidateLabelForNumber(candidateNumber: number): string {
  return `#${candidateNumber}`;
}

/**
 * Keep only picked ids that are eligible, de-duplicated, in the eligible list's
 * stable order — so numbering is deterministic regardless of click order.
 */
export function orderPickedPhenoPlantIds(
  pickedIds: readonly string[] | null | undefined,
  eligible: readonly PhenoHuntAddCandidatePlant[],
): string[] {
  if (!Array.isArray(pickedIds)) return [];
  const picked = new Set(pickedIds.filter((id) => typeof id === "string" && id.length > 0));
  return eligible.filter((p) => picked.has(p.id)).map((p) => p.id);
}

/** Whether a plant page should offer "Add to pheno hunt". */
export function canOfferAddToPhenoHunt(
  plant: PhenoHuntAddCandidatePlant | null | undefined,
  hunt: { readonly id: string; readonly grow_id: string | null } | null | undefined,
): boolean {
  if (!plant || !hunt?.id) return false;
  return selectEligiblePhenoHuntPlants([plant], hunt).length === 1;
}
