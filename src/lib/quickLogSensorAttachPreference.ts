/**
 * Pure, side-effect-light helpers for persisting the Quick Log
 * "Attach sensor snapshot" toggle across page reloads and tent changes.
 *
 * Boundaries:
 *  - No React, no Supabase, no network.
 *  - Read/write a single localStorage key per tent. Safe in SSR / private
 *    browsing — every access is try/catched and returns the fallback.
 *  - Never widens the trust model: this only restores a UI preference.
 *    The real attach gate still requires snapshot.status === "usable".
 */

const KEY_PREFIX = "verdant.quicklog.sensorAttach.";

function keyFor(tentId: string | null | undefined): string | null {
  if (typeof tentId !== "string" || tentId.length === 0) return null;
  return `${KEY_PREFIX}${tentId}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Returns the persisted attach preference for `tentId`, or `fallback`
 * when nothing has been stored, the value is malformed, or storage is
 * unavailable. Recognized values are the literal strings "1" / "0".
 */
export function loadQuickLogSensorAttachPreference(
  tentId: string | null | undefined,
  fallback: boolean,
): boolean {
  const key = keyFor(tentId);
  if (!key) return fallback;
  const storage = safeStorage();
  if (!storage) return fallback;
  try {
    const v = storage.getItem(key);
    if (v === "1") return true;
    if (v === "0") return false;
    return fallback;
  } catch {
    return fallback;
  }
}

/** Persist the toggle for `tentId`. No-ops when storage is unavailable. */
export function saveQuickLogSensorAttachPreference(
  tentId: string | null | undefined,
  value: boolean,
): void {
  const key = keyFor(tentId);
  if (!key) return;
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value ? "1" : "0");
  } catch {
    /* private-mode / quota: preference is best-effort */
  }
}

/** True when a preference exists for `tentId`. Used to skip auto-default. */
export function hasQuickLogSensorAttachPreference(
  tentId: string | null | undefined,
): boolean {
  const key = keyFor(tentId);
  if (!key) return false;
  const storage = safeStorage();
  if (!storage) return false;
  try {
    const v = storage.getItem(key);
    return v === "1" || v === "0";
  } catch {
    return false;
  }
}
