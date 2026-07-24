/**
 * Pure rules for the cultivar-follow retention loop.
 *
 * A follow records the guide version the grower last saw (`seenGuideVersion`).
 * When the cultivar's current immutable guide version has advanced past that,
 * there is an "updated since you followed" nudge. No I/O, no plant linkage.
 */
export interface CultivarFollowRow {
  cultivarSlug: string;
  seenGuideVersion: number;
}

export interface CultivarFollowUpdate {
  cultivarSlug: string;
  seenGuideVersion: number;
  currentGuideVersion: number;
  hasUpdate: boolean;
}

/** True when the live guide version is newer than what the grower last saw. */
export function hasCultivarGuideUpdate(
  seenGuideVersion: number,
  currentGuideVersion: number,
): boolean {
  return (
    Number.isFinite(seenGuideVersion) &&
    Number.isFinite(currentGuideVersion) &&
    currentGuideVersion > seenGuideVersion
  );
}

/**
 * Join follows against the current guide versions (by slug). Follows whose slug
 * is unknown in `currentVersionBySlug` are dropped (a published cultivar may
 * have been unpublished). Deterministic order: updates first, then by slug.
 */
export function summarizeFollowedUpdates(
  follows: readonly CultivarFollowRow[],
  currentVersionBySlug: Readonly<Record<string, number>>,
): CultivarFollowUpdate[] {
  const rows: CultivarFollowUpdate[] = [];
  for (const follow of follows) {
    const current = currentVersionBySlug[follow.cultivarSlug];
    if (typeof current !== "number") continue;
    rows.push({
      cultivarSlug: follow.cultivarSlug,
      seenGuideVersion: follow.seenGuideVersion,
      currentGuideVersion: current,
      hasUpdate: hasCultivarGuideUpdate(follow.seenGuideVersion, current),
    });
  }
  rows.sort((a, b) => {
    if (a.hasUpdate !== b.hasUpdate) return a.hasUpdate ? -1 : 1;
    return a.cultivarSlug.localeCompare(b.cultivarSlug);
  });
  return rows;
}

/** Count followed cultivars that have a pending guide update. */
export function countUpdatedFollows(
  follows: readonly CultivarFollowRow[],
  currentVersionBySlug: Readonly<Record<string, number>>,
): number {
  return summarizeFollowedUpdates(follows, currentVersionBySlug).filter((r) => r.hasUpdate)
    .length;
}
