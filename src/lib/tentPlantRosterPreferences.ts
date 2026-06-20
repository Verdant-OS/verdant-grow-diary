/**
 * Tent Plant Roster — per-tent local preferences.
 *
 * Read-only client-side persistence for the "Show archived plants" toggle on
 * the Tent Plant Roster. Scoped per tent. Defaults to false. No Supabase,
 * no schema, no writes outside of localStorage.
 *
 * Safety:
 * - Pure, deterministic, null-safe.
 * - Missing/invalid tentId never writes.
 * - Corrupt/non-boolean stored values fall back to false.
 * - All storage errors are swallowed.
 */

const KEY_PREFIX = "verdant.tentPlantRoster.includeArchived.v1.";

function normalizeTentId(tentId: unknown): string | null {
  if (typeof tentId !== "string") return null;
  const trimmed = tentId.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function tentPlantRosterIncludeArchivedKey(
  tentId: string | null | undefined,
): string | null {
  const id = normalizeTentId(tentId);
  return id ? `${KEY_PREFIX}${id}` : null;
}

export function readTentPlantRosterIncludeArchived(
  tentId: string | null | undefined,
): boolean {
  const key = tentPlantRosterIncludeArchivedKey(tentId);
  if (!key) return false;
  const storage = getStorage();
  if (!storage) return false;
  try {
    const raw = storage.getItem(key);
    if (raw === "true") return true;
    if (raw === "false" || raw === null) return false;
    return false;
  } catch {
    return false;
  }
}

export function writeTentPlantRosterIncludeArchived(
  tentId: string | null | undefined,
  value: boolean,
): void {
  const key = tentPlantRosterIncludeArchivedKey(tentId);
  if (!key) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    storage.setItem(key, value === true ? "true" : "false");
  } catch {
    /* swallow */
  }
}
