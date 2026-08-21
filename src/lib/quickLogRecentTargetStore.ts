/**
 * Best-effort persistence for the Quick Log recent-plant suggestion.
 *
 * The record is account-scoped and local-only. A failed browser-storage write
 * must never turn a confirmed Quick Log save into a failure.
 */
import {
  buildRecentTargetStorageKey,
  parseRecentTargetRecord,
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
    window.localStorage.setItem(scopedKey, JSON.stringify(target));
  } catch {
    // Non-critical speed preference. Never block saving if storage is unavailable.
  }
}

/**
 * Read this account's remembered target, or null.
 *
 * Null covers every reason a record cannot be produced — no window, no signed-in
 * account, no stored value, unreadable storage, malformed payload — because a
 * caller that has to tell them apart would be reasoning about a target it must
 * not offer either way.
 */
export function readRecentQuickLogTarget(
  userId: string | null | undefined,
): RecentTargetRecord | null {
  if (typeof window === "undefined") return null;
  const scopedKey = buildRecentTargetStorageKey(userId ?? null);
  if (!scopedKey) return null;
  try {
    return parseRecentTargetRecord(window.localStorage.getItem(scopedKey));
  } catch {
    return null;
  }
}
