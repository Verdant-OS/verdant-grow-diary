/**
 * Tent Plant Tabs — per-tent local preferences for the selected plant tab.
 *
 * Read-only client-side persistence. Scoped per tent. Defaults to null
 * ("All plants"). No Supabase, no schema, no writes outside of localStorage.
 *
 * Safety:
 * - Pure, deterministic, null-safe.
 * - Missing/invalid tentId never writes/reads.
 * - Corrupt/empty stored values fall back to null ("All plants").
 * - All storage errors are swallowed.
 */

const KEY_PREFIX = "verdant.tentPlantTabs.selected.v1.";
const MAX_VALUE_LENGTH = 200;

function normalizeTentId(tentId: unknown): string | null {
  if (typeof tentId !== "string") return null;
  const trimmed = tentId.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function normalizePlantId(plantId: unknown): string | null {
  if (typeof plantId !== "string") return null;
  const trimmed = plantId.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_VALUE_LENGTH) return null;
  return trimmed;
}

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function tentPlantTabsSelectedKey(
  tentId: string | null | undefined,
): string | null {
  const id = normalizeTentId(tentId);
  return id ? `${KEY_PREFIX}${id}` : null;
}

export function readTentPlantTabsSelectedPlantId(
  tentId: string | null | undefined,
): string | null {
  const key = tentPlantTabsSelectedKey(tentId);
  if (!key) return null;
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    return normalizePlantId(raw);
  } catch {
    return null;
  }
}

export function writeTentPlantTabsSelectedPlantId(
  tentId: string | null | undefined,
  plantId: string | null | undefined,
): void {
  const key = tentPlantTabsSelectedKey(tentId);
  if (!key) return;
  const storage = getStorage();
  if (!storage) return;
  try {
    const normalized = normalizePlantId(plantId);
    if (normalized == null) {
      storage.removeItem(key);
    } else {
      storage.setItem(key, normalized);
    }
  } catch {
    /* swallow */
  }
}
