/**
 * Last feeding-save time per plant, shared by every Quick Log sheet in this
 * page session. A second sheet does not inherit the first sheet's React state,
 * and an offline refetch leaves the cached recipe in place.
 */
const cutoffByPlant = new Map<string, number>();

export function recordFeedingDefaultsSaveCutoff(plantId: string, savedAt: number): void {
  const previous = cutoffByPlant.get(plantId) ?? 0;
  if (savedAt > previous) cutoffByPlant.set(plantId, savedAt);
}

export function feedingDefaultsSaveCutoff(plantId: string | null | undefined): number {
  if (!plantId) return 0;
  return cutoffByPlant.get(plantId) ?? 0;
}

export function clearFeedingDefaultsSaveCutoffs(): void {
  cutoffByPlant.clear();
}
