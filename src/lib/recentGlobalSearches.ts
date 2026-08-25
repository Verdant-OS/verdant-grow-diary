/**
 * Recent GlobalSearch queries — session-only persistence.
 *
 * Stores the last few non-empty search queries the user submitted in the
 * GlobalSearchDialog so we can offer them as one-tap suggestions when the
 * palette opens with an empty input. Query text can contain private grow,
 * tent, or plant labels, so it must never outlive the browser session or an
 * auth identity transition. Reads/writes are guarded so SSR and
 * storage-disabled browsers degrade silently to an empty list. The old
 * localStorage slot is deleted on every access to remove legacy data.
 */

const STORAGE_KEY = "verdant.globalSearch.recent.v1";
const MAX_RECENT = 5;
const MAX_QUERY_LENGTH = 120;

function safeSessionStorage(provided?: Storage | null): Storage | null {
  if (provided !== undefined) return provided;
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function safeLegacyLocalStorage(provided?: Storage | null): Storage | null {
  if (provided !== undefined) return provided;
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function clearLegacyRecentSearches(provided?: Storage | null): void {
  const storage = safeLegacyLocalStorage(provided);
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function readRecentSearches(): string[] {
  clearLegacyRecentSearches();
  const storage = safeSessionStorage();
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
  const storage = safeSessionStorage();
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

export interface ClearRecentSearchesDeps {
  sessionStorage?: Storage | null;
  /** Legacy persistent slot; removal only, never read for display. */
  localStorage?: Storage | null;
}

export function clearRecentSearches(deps: ClearRecentSearchesDeps = {}): void {
  const storage = safeSessionStorage(deps.sessionStorage);
  if (storage) {
    try {
      storage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
  clearLegacyRecentSearches(deps.localStorage);
}

export const RECENT_SEARCHES_STORAGE_KEY = STORAGE_KEY;
export const RECENT_SEARCHES_MAX = MAX_RECENT;
