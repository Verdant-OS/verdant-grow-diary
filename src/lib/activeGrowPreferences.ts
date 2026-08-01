/**
 * activeGrowPreferences — per-user active grow id in localStorage.
 *
 * Key shape: `verdant.activeGrow.<userId>`
 * Legacy bare key: `verdant.activeGrow` (pre multi-account).
 *
 * On read: prefer user-scoped key; if missing, migrate once from the bare
 * key so existing browsers keep their selection without sharing it across
 * accounts after the next write.
 *
 * Safety:
 *  - No schema / backend write.
 *  - Never stores tokens, emails, or grow content — only opaque UUIDs.
 *  - Fails open (null) when storage is unavailable or user id is invalid.
 */

/** Legacy single-account key (pre user-scoping). */
export const ACTIVE_GROW_LEGACY_KEY = "verdant.activeGrow" as const;

export const ACTIVE_GROW_KEY_PREFIX = "verdant.activeGrow." as const;

/** UUID-ish grow id validation (loose — Supabase UUIDs; reject empty/garbage). */
const GROW_ID_RE = /^[A-Za-z0-9_-]{8,128}$/;
const USER_ID_RE = /^[A-Za-z0-9_\-:.]{1,128}$/;

export function activeGrowStorageKey(userId: string | null | undefined): string | null {
  if (typeof userId !== "string" || !userId.trim()) return null;
  const id = userId.trim();
  if (!USER_ID_RE.test(id)) return null;
  return `${ACTIVE_GROW_KEY_PREFIX}${id}`;
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isValidActiveGrowId(value: unknown): value is string {
  return typeof value === "string" && GROW_ID_RE.test(value.trim());
}

/**
 * Read the active grow for this user. Migrates bare legacy key → user key
 * when the user key is empty (one-way copy; does not delete legacy until write).
 */
export function getStoredActiveGrowId(userId: string | null | undefined): string | null {
  const key = activeGrowStorageKey(userId);
  const s = safeStorage();
  if (!key || !s) return null;
  try {
    const scoped = s.getItem(key);
    if (isValidActiveGrowId(scoped)) return scoped.trim();

    // One-time migrate from bare key (shared multi-account browsers).
    const legacy = s.getItem(ACTIVE_GROW_LEGACY_KEY);
    if (isValidActiveGrowId(legacy)) {
      const id = legacy.trim();
      try {
        s.setItem(key, id);
      } catch {
        /* keep returning id even if migrate write fails */
      }
      return id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist active grow for this user. Always writes the scoped key and removes
 * the bare legacy key so a later login on the same browser cannot pick up
 * another account's selection from the shared legacy slot.
 */
export function setStoredActiveGrowId(
  userId: string | null | undefined,
  growId: string | null | undefined,
): void {
  const key = activeGrowStorageKey(userId);
  const s = safeStorage();
  if (!key || !s) return;
  try {
    if (growId && isValidActiveGrowId(growId)) {
      s.setItem(key, growId.trim());
    } else {
      s.removeItem(key);
    }
    // Drop legacy bare key after any intentional write for this user.
    s.removeItem(ACTIVE_GROW_LEGACY_KEY);
  } catch {
    /* fail open — in-memory state still works for the session */
  }
}

export function clearStoredActiveGrowId(userId: string | null | undefined): void {
  setStoredActiveGrowId(userId, null);
}
