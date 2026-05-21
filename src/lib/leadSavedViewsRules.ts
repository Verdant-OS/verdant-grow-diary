/**
 * Pure helpers for operator-saved /leads views.
 *
 * Stored client-side (localStorage). No I/O here, no Supabase, no side effects.
 * Only filter/search/sort preferences — never lead data — should be persisted.
 */
import type { LeadQuickFilter } from "@/lib/leadFollowupRules";
import type { LeadSortOption } from "@/lib/leadSearchRules";

export const STORAGE_KEY = "verdant.leads.savedViews.v1";
export const MAX_NAME_LENGTH = 60;
export const MAX_SEARCH_LENGTH = 200;

export const VALID_QUICK_FILTERS: ReadonlySet<LeadQuickFilter> = new Set([
  "all",
  "needs_action",
  "overdue",
  "due_today",
  "upcoming",
  "new",
  "follow_up",
  "closed",
  "spam",
]);

export const VALID_SORTS: ReadonlySet<LeadSortOption> = new Set([
  "default",
  "newest",
  "oldest",
  "follow_up_soonest",
  "status",
  "az",
]);

export interface LeadSavedView {
  id: string;
  name: string;
  search: string;
  quickFilter: LeadQuickFilter;
  sort: LeadSortOption;
  createdAt: string; // ISO timestamp
}

export interface SavedViewDraft {
  name: string;
  search: string;
  quickFilter: LeadQuickFilter;
  sort: LeadSortOption;
}

/** Trim and length-cap a saved view name. Returns null if blank. */
export function sanitizeName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, MAX_NAME_LENGTH);
}

function sanitizeSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.slice(0, MAX_SEARCH_LENGTH);
}

/**
 * Validate an unknown payload (e.g. from localStorage or a draft) and return
 * a typed LeadSavedView, or null if it is malformed in any way.
 */
export function validateView(input: unknown): LeadSavedView | null {
  if (!input || typeof input !== "object") return null;
  const v = input as Record<string, unknown>;
  const name = sanitizeName(v.name);
  if (!name) return null;
  if (typeof v.id !== "string" || !v.id) return null;
  if (typeof v.createdAt !== "string" || !v.createdAt) return null;
  if (typeof v.quickFilter !== "string") return null;
  if (!VALID_QUICK_FILTERS.has(v.quickFilter as LeadQuickFilter)) return null;
  if (typeof v.sort !== "string") return null;
  if (!VALID_SORTS.has(v.sort as LeadSortOption)) return null;
  return {
    id: v.id,
    name,
    search: sanitizeSearch(v.search),
    quickFilter: v.quickFilter as LeadQuickFilter,
    sort: v.sort as LeadSortOption,
    createdAt: v.createdAt,
  };
}

/** Deterministic sort: createdAt ASC, id ASC tie-breaker. */
export function sortViews(views: LeadSavedView[]): LeadSavedView[] {
  return views.slice().sort((a, b) => {
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
}

/** Safe parse: never throws; drops malformed entries. */
export function parseStoredViews(raw: string | null): LeadSavedView[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: LeadSavedView[] = [];
  for (const item of parsed) {
    const v = validateView(item);
    if (v) out.push(v);
  }
  return sortViews(out);
}

export function serializeViews(views: LeadSavedView[]): string {
  return JSON.stringify(sortViews(views));
}

export interface IdClock {
  id: () => string;
  now: () => string;
}

const defaultClock: IdClock = {
  id: () =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `v_${Math.random().toString(36).slice(2)}_${Date.now()}`,
  now: () => new Date().toISOString(),
};

/**
 * Create a new saved view from a draft. Returns null if the draft is invalid
 * (blank name, unknown quickFilter, unknown sort).
 */
export function buildView(
  draft: SavedViewDraft,
  clock: IdClock = defaultClock,
): LeadSavedView | null {
  return validateView({
    id: clock.id(),
    name: draft.name,
    search: draft.search,
    quickFilter: draft.quickFilter,
    sort: draft.sort,
    createdAt: clock.now(),
  });
}

export function addView(
  views: LeadSavedView[],
  view: LeadSavedView,
): LeadSavedView[] {
  return sortViews([...views.filter((v) => v.id !== view.id), view]);
}

export function renameView(
  views: LeadSavedView[],
  id: string,
  name: string,
): LeadSavedView[] {
  const next = sanitizeName(name);
  if (!next) return views;
  return sortViews(
    views.map((v) => (v.id === id ? { ...v, name: next } : v)),
  );
}

export function removeView(
  views: LeadSavedView[],
  id: string,
): LeadSavedView[] {
  return sortViews(views.filter((v) => v.id !== id));
}
