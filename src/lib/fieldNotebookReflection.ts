import type { RefreshReflection } from "@/lib/fieldNotebookOutcomeRules";

function containsId(value: unknown, id: string): boolean {
  if (value === id) return true;
  if (Array.isArray(value)) return value.some((item) => containsId(item, id));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => containsId(item, id));
  }
  return false;
}

export function reflectionFromEvidence(input: {
  timelineCaches: unknown[];
  recentItems: Array<{ id?: string | null }> | null;
  growEventId: string;
}): RefreshReflection {
  const timelineHit = input.timelineCaches.some((cache) => containsId(cache, input.growEventId));
  const counted = input.timelineCaches.some(
    (cache) => Array.isArray(cache) && cache.length > 0 && containsId(cache, input.growEventId),
  );
  const newest = input.recentItems?.[0];
  return {
    timelineHasEntry: timelineHit,
    countIncludesEntry: counted,
    lastActivityIncludesEntry: sameRecentActivityId(newest?.id, input.growEventId),
  };
}

/** Recent Activity prefixes grow-event ids. A diary row with the same uuid is not a match. */
export function sameRecentActivityId(
  recentId: string | null | undefined,
  growEventId: string,
): boolean {
  if (!recentId || !growEventId) return false;
  if (recentId === growEventId) return true;
  const prefix = "grow-event-";
  if (recentId.startsWith(prefix) && recentId.slice(prefix.length) === growEventId) return true;
  if (growEventId.startsWith(prefix) && growEventId.slice(prefix.length) === recentId) return true;
  return false;
}
