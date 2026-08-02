/**
 * activeGrowStorageRules — pure helpers for per-user active grow persistence.
 *
 * Key shape: `verdant.activeGrow.<userId>`
 * Legacy bare key: `verdant.activeGrow` (pre multi-account). Never treat the
 * bare key as authoritative until the grow id is confirmed owned by the
 * signed-in user (after the RLS grow list loads).
 *
 * Pure: no React, no Supabase. Storage access is injected via get/set/remove.
 */

export const LEGACY_ACTIVE_GROW_STORAGE_KEY = "verdant.activeGrow" as const;

export const ACTIVE_GROW_STORAGE_PREFIX = "verdant.activeGrow." as const;

export function activeGrowStorageKey(userId: string | null | undefined): string | null {
  if (typeof userId !== "string") return null;
  const id = userId.trim();
  if (!id) return null;
  return `${ACTIVE_GROW_STORAGE_PREFIX}${id}`;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function cleanId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

/**
 * Read the user-scoped active grow id only. Does NOT promote the bare legacy
 * key — callers must migrate after ownership is known.
 */
export function readScopedActiveGrowId(
  userId: string | null | undefined,
  storage: StorageLike | null | undefined,
): string | null {
  const key = activeGrowStorageKey(userId);
  if (!key || !storage) return null;
  try {
    return cleanId(storage.getItem(key));
  } catch {
    return null;
  }
}

export function readLegacyActiveGrowId(storage: StorageLike | null | undefined): string | null {
  if (!storage) return null;
  try {
    return cleanId(storage.getItem(LEGACY_ACTIVE_GROW_STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * Persist active grow for a user. Always clears the bare legacy key so a later
 * account never inherits an unscoped selection.
 */
export function writeActiveGrowId(input: {
  userId: string | null | undefined;
  growId: string | null | undefined;
  storage: StorageLike | null | undefined;
}): void {
  const storage = input.storage;
  if (!storage) return;
  const key = activeGrowStorageKey(input.userId);
  const growId = cleanId(input.growId ?? null);
  try {
    // Always drop the unscoped key when we know which user is writing.
    storage.removeItem(LEGACY_ACTIVE_GROW_STORAGE_KEY);
    if (!key) return;
    if (growId) storage.setItem(key, growId);
    else storage.removeItem(key);
  } catch {
    /* fail open — in-memory state still works for the session */
  }
}

/**
 * If scoped key is empty and the bare legacy id is one of the user's grows,
 * promote it into the scoped key and remove the bare key.
 * Returns the grow id that should become active (or null if no migration).
 */
export function migrateLegacyActiveGrowIfOwned(input: {
  userId: string | null | undefined;
  ownedGrowIds: ReadonlyArray<string>;
  storage: StorageLike | null | undefined;
  currentActiveGrowId?: string | null;
}): string | null {
  const current = cleanId(input.currentActiveGrowId ?? null);
  if (current) {
    // Still scrub bare key so it cannot leak to another account later.
    try {
      input.storage?.removeItem(LEGACY_ACTIVE_GROW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }

  const legacy = readLegacyActiveGrowId(input.storage);
  if (!legacy) return null;
  if (!input.ownedGrowIds.includes(legacy)) {
    // Bare key points at a grow this user does not own — drop it.
    try {
      input.storage?.removeItem(LEGACY_ACTIVE_GROW_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return null;
  }

  writeActiveGrowId({
    userId: input.userId,
    growId: legacy,
    storage: input.storage,
  });
  return legacy;
}

/**
 * After the grow list loads: keep active id if still owned; otherwise fall
 * back to first grow; optionally migrate legacy first.
 */
export function resolveActiveGrowAfterLoad(input: {
  userId: string | null | undefined;
  ownedGrowIds: ReadonlyArray<string>;
  currentActiveGrowId: string | null | undefined;
  storage: StorageLike | null | undefined;
}): string | null {
  const owned = input.ownedGrowIds.filter((id) => typeof id === "string" && id.length > 0);
  if (owned.length === 0) return null;

  const migrated = migrateLegacyActiveGrowIfOwned({
    userId: input.userId,
    ownedGrowIds: owned,
    storage: input.storage,
    currentActiveGrowId: input.currentActiveGrowId,
  });
  const candidate = cleanId(migrated ?? input.currentActiveGrowId ?? null);
  if (candidate && owned.includes(candidate)) return candidate;
  return owned[0] ?? null;
}
