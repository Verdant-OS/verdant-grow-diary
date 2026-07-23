/**
 * GlobalSearch session memory — sessionStorage-only persistence.
 *
 * Remembers the last query text and category filter toggles for the current
 * browser tab/session so reopening the palette resumes where the user left
 * off. Scoped to sessionStorage (not localStorage) so it never leaks across
 * grower sessions or long-lived shared machines, and guarded so SSR /
 * storage-disabled browsers degrade silently to defaults.
 */

export type GlobalSearchEntityType = "grow" | "tent" | "plant" | "cultivar";

export interface GlobalSearchSessionState {
  query: string;
  filters: Record<GlobalSearchEntityType, boolean>;
}

const STORAGE_KEY = "verdant.globalSearch.session.v1";
const MAX_QUERY_LENGTH = 120;
const ALL_ON: Record<GlobalSearchEntityType, boolean> = {
  grow: true,
  tent: true,
  plant: true,
  cultivar: true,
};

export const DEFAULT_FILTERS: Record<GlobalSearchEntityType, boolean> = ALL_ON;

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function normalizeFilters(
  input: unknown,
): Record<GlobalSearchEntityType, boolean> {
  const out: Record<GlobalSearchEntityType, boolean> = { ...ALL_ON };
  if (!input || typeof input !== "object") return out;
  const keys: GlobalSearchEntityType[] = ["grow", "tent", "plant", "cultivar"];
  for (const k of keys) {
    const v = (input as Record<string, unknown>)[k];
    if (typeof v === "boolean") out[k] = v;
  }
  // Guard: never persist an all-off state (would surface as empty results).
  if (!keys.some((k) => out[k])) return { ...ALL_ON };
  return out;
}

export function readGlobalSearchSession(): GlobalSearchSessionState {
  const storage = safeStorage();
  const fallback: GlobalSearchSessionState = { query: "", filters: { ...ALL_ON } };
  if (!storage) return fallback;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return fallback;
    const query =
      typeof (parsed as { query?: unknown }).query === "string"
        ? ((parsed as { query: string }).query).slice(0, MAX_QUERY_LENGTH)
        : "";
    const filters = normalizeFilters((parsed as { filters?: unknown }).filters);
    return { query, filters };
  } catch {
    return fallback;
  }
}

export function writeGlobalSearchSession(
  state: GlobalSearchSessionState,
): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    const payload: GlobalSearchSessionState = {
      query: (state.query ?? "").slice(0, MAX_QUERY_LENGTH),
      filters: normalizeFilters(state.filters),
    };
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

export function clearGlobalSearchSession(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const GLOBAL_SEARCH_SESSION_STORAGE_KEY = STORAGE_KEY;
