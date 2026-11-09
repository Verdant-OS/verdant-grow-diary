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
    lastActivityIncludesEntry: newest?.id === input.growEventId,
  };
}
