import type { GrowDataSourceMeta } from "@/hooks/useGrowData";

/**
 * A successful read that returned no rows. Empty is not the same as a
 * failed read. Every meta must say `no-rows`; one fetch error keeps the
 * Unavailable badge.
 */
export function isSuccessfulEmptyGrowRead(metas: readonly GrowDataSourceMeta[]): boolean {
  return metas.length > 0 && metas.every((meta) => meta.sourceReason === "no-rows");
}
