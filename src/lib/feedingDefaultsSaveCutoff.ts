/**
 * Per-plant feeding-save time, stored on the caller's QueryClient.
 * A second sheet on the same client sees the cutoff. A new client, including
 * each test's QueryClient, starts empty, so the cutoff cannot leak across tests.
 */
export function feedingDefaultsSaveCutoffQueryKey(plantId: string) {
  return ["quicklog_v2_feed_defaults_saved_at", plantId] as const;
}

export interface FeedingDefaultsSaveCutoffClient {
  getQueryData: (queryKey: readonly unknown[]) => unknown;
  setQueryData: (queryKey: readonly unknown[], data: number) => unknown;
}

export function recordFeedingDefaultsSaveCutoff(
  client: FeedingDefaultsSaveCutoffClient,
  plantId: string,
  savedAt: number,
): void {
  const key = feedingDefaultsSaveCutoffQueryKey(plantId);
  const previous = client.getQueryData(key);
  const previousAt = typeof previous === "number" ? previous : 0;
  if (savedAt > previousAt) client.setQueryData(key, savedAt);
}

export function readFeedingDefaultsSaveCutoff(
  client: Pick<FeedingDefaultsSaveCutoffClient, "getQueryData">,
  plantId: string | null | undefined,
): number {
  if (!plantId) return 0;
  const value = client.getQueryData(feedingDefaultsSaveCutoffQueryKey(plantId));
  return typeof value === "number" ? value : 0;
}
