/**
 * Best-effort persistence for the Quick Log recent-plant suggestion.
 *
 * The record is account-scoped and local-only. A failed browser-storage write
 * must never turn a confirmed Quick Log save into a failure.
 *
 * This module is the ONLY writer of that key, which makes it the boundary the
 * localStorage privacy fence has to cover — see
 * `src/test/quicklog-sensor-strip-split-guardrail.test.ts`. The fence scans for
 * forbidden payload classes near every `localStorage` call site, so it must
 * scan this file and not only the component that calls it.
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

  // Serialize the canonical fields EXPLICITLY. `JSON.stringify(target)` would
  // write whatever the caller handed over, and TypeScript's excess-property
  // check only catches an object literal at the call site — a widened value, a
  // spread row, or an `as` cast passes straight through. That is how a sensor
  // payload, a note, or an id nobody meant to persist ends up on the device.
  //
  // A static scan cannot see a field that exists only at runtime, so the fence
  // and this narrowing are complementary rather than redundant: the scan keeps
  // forbidden CLASSES out of this file, and this keeps unknown FIELDS out of
  // the stored value.
  const record: RecentTargetRecord = {
    plantId: target.plantId,
    growId: target.growId ?? null,
    tentId: target.tentId ?? null,
    savedAt: target.savedAt,
  };

  try {
    window.localStorage.setItem(scopedKey, JSON.stringify(record));
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
