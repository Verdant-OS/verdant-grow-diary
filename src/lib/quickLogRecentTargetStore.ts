/**
 * Best-effort persistence for the Quick Log recent-plant suggestion.
 *
 * The record is account-scoped and local-only. A failed browser-storage write
 * must never turn a confirmed Quick Log save into a failure.
 */
import {
  buildRecentTargetStorageKey,
  type RecentTargetRecord,
} from "./quickLogRecentTargetSuggestion";

export function rememberRecentQuickLogTarget(
  target: RecentTargetRecord,
  userId: string | null | undefined,
): void {
  if (typeof window === "undefined") return;
  const scopedKey = buildRecentTargetStorageKey(userId ?? null);
  if (!scopedKey) return;

  try {
    // Project the approved schema explicitly. TypeScript's structural typing
    // cannot prevent a wider runtime object from reaching this boundary, so
    // serializing `target` wholesale could persist unrelated fields added by
    // a caller. Local memory is target identity only.
    window.localStorage.setItem(
      scopedKey,
      JSON.stringify({
        plantId: target.plantId,
        growId: target.growId,
        tentId: target.tentId,
        savedAt: target.savedAt,
      }),
    );
  } catch {
    // Non-critical speed preference. Never block saving if storage is unavailable.
  }
}
