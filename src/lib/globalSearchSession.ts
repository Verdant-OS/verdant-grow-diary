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

// ---------------------------------------------------------------------------
// Per-session query history — remembers recent {query, filters} snapshots for
// the current tab so a grower can re-run a search + its filter shape in one
// click. Stored separately from the "resume last state" blob so clearing one
// doesn't nuke the other.
// ---------------------------------------------------------------------------

export interface GlobalSearchHistoryEntry {
  query: string;
  filters: Record<GlobalSearchEntityType, boolean>;
  ts: number;
}

const HISTORY_STORAGE_KEY = "verdant.globalSearch.history.v1";
const HISTORY_MAX_ENTRIES = 8;

function sameFilters(
  a: Record<GlobalSearchEntityType, boolean>,
  b: Record<GlobalSearchEntityType, boolean>,
): boolean {
  return (
    a.grow === b.grow &&
    a.tent === b.tent &&
    a.plant === b.plant &&
    a.cultivar === b.cultivar
  );
}

export function readGlobalSearchHistory(): GlobalSearchHistoryEntry[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out: GlobalSearchHistoryEntry[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== "object") continue;
      const q = (item as { query?: unknown }).query;
      const ts = (item as { ts?: unknown }).ts;
      if (typeof q !== "string" || !q.trim()) continue;
      out.push({
        query: q.slice(0, MAX_QUERY_LENGTH),
        filters: normalizeFilters((item as { filters?: unknown }).filters),
        ts: typeof ts === "number" && Number.isFinite(ts) ? ts : 0,
      });
      if (out.length >= HISTORY_MAX_ENTRIES) break;
    }
    return out;
  } catch {
    return [];
  }
}

export function pushGlobalSearchHistory(
  entry: Omit<GlobalSearchHistoryEntry, "ts"> & { ts?: number },
): GlobalSearchHistoryEntry[] {
  const q = (entry.query ?? "").trim();
  if (!q) return readGlobalSearchHistory();
  const filters = normalizeFilters(entry.filters);
  const ts = entry.ts ?? Date.now();
  const existing = readGlobalSearchHistory().filter(
    (e) => !(e.query === q && sameFilters(e.filters, filters)),
  );
  const next = [{ query: q.slice(0, MAX_QUERY_LENGTH), filters, ts }, ...existing].slice(
    0,
    HISTORY_MAX_ENTRIES,
  );
  const storage = safeStorage();
  if (storage) {
    try {
      storage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }
  return next;
}

export function clearGlobalSearchHistory(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(HISTORY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const GLOBAL_SEARCH_HISTORY_STORAGE_KEY = HISTORY_STORAGE_KEY;
export const GLOBAL_SEARCH_HISTORY_MAX = HISTORY_MAX_ENTRIES;

// ---------------------------------------------------------------------------
// Last selected result — remembers the {entity_type, id} of the row the user
// most recently highlighted or opened so reopening the palette restores the
// preview panel to that item (when it's still present in the current result
// set). Never used to auto-navigate; presentation-only.
// ---------------------------------------------------------------------------

export interface GlobalSearchLastSelected {
  entity_type: GlobalSearchEntityType;
  id: string;
  ts: number;
}

const LAST_SELECTED_STORAGE_KEY = "verdant.globalSearch.lastSelected.v1";
const VALID_TYPES: readonly GlobalSearchEntityType[] = [
  "grow",
  "tent",
  "plant",
  "cultivar",
];

export function readGlobalSearchLastSelected(): GlobalSearchLastSelected | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(LAST_SELECTED_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const entity_type = (parsed as { entity_type?: unknown }).entity_type;
    const id = (parsed as { id?: unknown }).id;
    const ts = (parsed as { ts?: unknown }).ts;
    if (
      typeof entity_type !== "string" ||
      !VALID_TYPES.includes(entity_type as GlobalSearchEntityType) ||
      typeof id !== "string" ||
      !id
    ) {
      return null;
    }
    return {
      entity_type: entity_type as GlobalSearchEntityType,
      id,
      ts: typeof ts === "number" && Number.isFinite(ts) ? ts : 0,
    };
  } catch {
    return null;
  }
}

export function writeGlobalSearchLastSelected(
  entry: Omit<GlobalSearchLastSelected, "ts"> & { ts?: number },
): void {
  const storage = safeStorage();
  if (!storage) return;
  if (!VALID_TYPES.includes(entry.entity_type) || !entry.id) return;
  try {
    const payload: GlobalSearchLastSelected = {
      entity_type: entry.entity_type,
      id: entry.id,
      ts: entry.ts ?? Date.now(),
    };
    storage.setItem(LAST_SELECTED_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function clearGlobalSearchLastSelected(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.removeItem(LAST_SELECTED_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export const GLOBAL_SEARCH_LAST_SELECTED_STORAGE_KEY = LAST_SELECTED_STORAGE_KEY;


