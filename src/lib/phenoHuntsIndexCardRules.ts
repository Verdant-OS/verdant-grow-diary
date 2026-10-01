/**
 * Pheno Hunts index — per-hunt card summary line (#550).
 *
 * The card count comes from `listPhenoHuntsForOwner`, which counts the hunt's
 * NON-ARCHIVED plants only. Keepers are read separately from `pheno_keepers`
 * by `hunt_id` and are not filtered by whether their source plant is still
 * active. A finished hunt whose kept plants were archived after harvest
 * therefore has keepers and zero active candidates — both true. The old card
 * read "0 candidates" beside a stability panel listing that hunt's keepers,
 * which looked contradictory. This module names the count for what it is
 * ("active candidates") and states the hunt's keeper count beside it.
 *
 * Keeper counts are `null` when the keeper roll-up could not be read. A failed
 * read never renders as "no keepers": the clause is omitted and the page shows
 * its own roll-up-unavailable notice.
 *
 * Pure. No React, no network, no clock.
 */

export const PHENO_HUNT_CARD_SETUP_IN_PROGRESS = "setup in progress" as const;
export const PHENO_HUNT_CARD_SEPARATOR = " · " as const;

export interface KeeperHuntRef {
  readonly huntId: string | null | undefined;
}

/**
 * Count keepers per hunt id. Rows without a usable hunt id are skipped rather
 * than attributed anywhere. Returns a null-prototype map so a hunt id such as
 * "constructor" can never resolve to an inherited value.
 */
export function countKeepersByHunt(
  keepers: readonly KeeperHuntRef[] | null | undefined,
): Record<string, number> {
  const counts: Record<string, number> = Object.create(null);
  if (!Array.isArray(keepers)) return counts;
  for (const k of keepers) {
    const id = typeof k?.huntId === "string" ? k.huntId.trim() : "";
    if (!id) continue;
    counts[id] = (counts[id] ?? 0) + 1;
  }
  return counts;
}

/** Keeper count for one hunt; `null` when the roll-up is unavailable. */
export function keeperCountForHunt(
  counts: Readonly<Record<string, number>> | null,
  huntId: string,
): number | null {
  if (counts === null) return null;
  return Object.prototype.hasOwnProperty.call(counts, huntId) ? counts[huntId] : 0;
}

export function formatActiveCandidateCount(count: number): string {
  return `${count} active ${count === 1 ? "candidate" : "candidates"}`;
}

export function formatKeeperCount(count: number): string {
  return `${count} ${count === 1 ? "keeper" : "keepers"}`;
}

export interface PhenoHuntCardSummaryInput {
  readonly activeCandidateCount: number;
  /** `null` = keeper roll-up unavailable (clause omitted, never "0 keepers"). */
  readonly keeperCount: number | null;
  readonly setupCompleted: boolean;
  /** Pre-formatted start date, or "" when unknown. */
  readonly startedLabel: string;
}

/**
 * The card's single meta line, e.g.
 * "0 active candidates · 4 keepers · started Jul 9, 2026".
 */
export function buildPhenoHuntCardSummary(input: PhenoHuntCardSummaryInput): string {
  const parts: string[] = [formatActiveCandidateCount(input.activeCandidateCount)];
  if (typeof input.keeperCount === "number" && input.keeperCount > 0) {
    parts.push(formatKeeperCount(input.keeperCount));
  }
  if (!input.setupCompleted) parts.push(PHENO_HUNT_CARD_SETUP_IN_PROGRESS);
  if (input.startedLabel) parts.push(`started ${input.startedLabel}`);
  return parts.join(PHENO_HUNT_CARD_SEPARATOR);
}
