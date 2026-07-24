/**
 * Recent GlobalSearch queries — local-only persistence.
 *
 * Stores the last few non-empty search queries the user submitted in the
 * GlobalSearchDialog so we can offer them as one-tap suggestions when the
 * palette opens with an empty input. Purely a client-side convenience — no
 * private grower data is written, and reads/writes are guarded so SSR and
 * storage-disabled browsers degrade silently to an empty list.
 */

const STORAGE_KEY = "verdant.globalSearch.recent.v1";
const MAX_RECENT = 5;
const MAX_QUERY_LENGTH = 120;

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRecentSearches(): string[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter((v) => v.length > 0)
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function pushRecentSearch(query: string): string[] {
  const storage = safeStorage();
  const trimmed = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (!trimmed) return readRecentSearches();
  const existing = readRecentSearches();
  const deduped = [
    trimmed,
    ...existing.filter((v) => v.toLowerCase() !== trimmed.toLowerCase()),
  ].slice(0, MAX_RECENT);
  if (storage) {
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(deduped));
    } catch {
      /* ignore quota / privacy-mode errors */
    }
  }
  return deduped;
}

export function clearRecentSearches(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const RECENT_SEARCHES_STORAGE_KEY = STORAGE_KEY;
export const RECENT_SEARCHES_MAX = MAX_RECENT;
