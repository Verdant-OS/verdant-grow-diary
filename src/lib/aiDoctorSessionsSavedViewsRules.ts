/**
 * Pure helpers + localStorage adapter for /doctor/sessions saved filter views.
 *
 * No network. No database. No AI. No automation. No device control.
 * Only touches `window.localStorage` when called.
 */
import {
  DEFAULT_FILTERS,
  formatActiveFilterLabels,
  isFiltersActive,
  serializeFilters,
  serializePageParam,
  parseFilters,
  parsePageParam,
  type SessionsIndexFilters,
} from "@/lib/aiDoctorSessionsIndexFilters";

/**
 * Human-readable one-line summary of a saved view's filters + page.
 * Used in the delete-confirmation dialog so growers can verify what
 * they're about to remove. Pure: no side effects.
 */
export function formatSavedViewSummary(
  filters: SessionsIndexFilters,
  page: number,
): string {
  const parts: string[] = [];
  if (isFiltersActive(filters)) {
    parts.push(...formatActiveFilterLabels(filters));
  } else {
    parts.push("All sessions");
  }
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 0;
  if (safePage > 0) parts.push(`Page ${safePage + 1}`);
  return parts.join(" · ");
}

export const SAVED_VIEWS_STORAGE_KEY = "verdant:ai-doctor-sessions:saved-views:v1";
export const SAVED_VIEW_MAX_LABEL_LENGTH = 60;
export const SAVED_VIEWS_MAX = 20;

export interface SavedView {
  id: string;
  label: string;
  filters: SessionsIndexFilters;
  /** 0-based page index, like the in-memory state. */
  page: number;
  createdAt: string;
}

export type SaveViewError =
  | "empty-label"
  | "label-too-long"
  | "duplicate-label"
  | "duplicate-params"
  | "limit-reached";

export interface SaveViewResult {
  ok: boolean;
  views?: SavedView[];
  view?: SavedView;
  error?: SaveViewError;
}
// Back-compat type aliases (unused at runtime).
export type SaveViewSuccess = SaveViewResult;
export type SaveViewFailure = SaveViewResult;

/** Stable signature used for duplicate detection. */
export function viewSignature(filters: SessionsIndexFilters, page: number): string {
  const f = serializeFilters(filters);
  const p = serializePageParam(page);
  // Sort keys for determinism.
  const sortedFilters = Object.keys(f)
    .sort()
    .map((k) => `${k}=${f[k]}`)
    .join("&");
  return `${sortedFilters}|page=${p ?? ""}`;
}

function normalizeLabel(raw: string): string {
  return (raw ?? "").trim().replace(/\s+/g, " ");
}

function isValidSavedView(v: unknown): v is SavedView {
  if (!v || typeof v !== "object") return false;
  const x = v as Record<string, unknown>;
  if (typeof x.id !== "string" || x.id.length === 0) return false;
  if (typeof x.label !== "string" || x.label.length === 0) return false;
  if (typeof x.createdAt !== "string") return false;
  if (typeof x.page !== "number" || !Number.isFinite(x.page) || x.page < 0) return false;
  if (!x.filters || typeof x.filters !== "object") return false;
  return true;
}

/**
 * Parse a raw JSON blob into a sanitized SavedView list. Corrupt / invalid
 * data fails safely to an empty list (never throws).
 */
export function parseSavedViews(raw: string | null | undefined): SavedView[] {
  if (typeof raw !== "string" || raw.length === 0) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: SavedView[] = [];
  for (const item of parsed) {
    if (!isValidSavedView(item)) continue;
    out.push({
      id: item.id,
      label: item.label,
      // Re-normalize filters through parseFilters so unknown values reset.
      filters: parseFilters(item.filters as unknown as Record<string, unknown>),
      page: Math.floor(item.page),
      createdAt: item.createdAt,
    });
  }
  return out;
}

export function serializeSavedViews(views: SavedView[]): string {
  return JSON.stringify(views);
}

interface BuildSavedViewInput {
  label: string;
  filters: SessionsIndexFilters;
  page: number;
  existing: SavedView[];
  now?: Date;
  id?: string;
}

/**
 * Validate + construct a new SavedView without persisting. Returns either
 * the updated list (existing + new view) or a typed error.
 */
export function addSavedView(input: BuildSavedViewInput): SaveViewResult {
  const label = normalizeLabel(input.label);
  if (label.length === 0) return { ok: false, error: "empty-label" };
  if (label.length > SAVED_VIEW_MAX_LABEL_LENGTH)
    return { ok: false, error: "label-too-long" };
  if (input.existing.length >= SAVED_VIEWS_MAX)
    return { ok: false, error: "limit-reached" };

  const labelKey = label.toLowerCase();
  if (input.existing.some((v) => v.label.toLowerCase() === labelKey))
    return { ok: false, error: "duplicate-label" };

  const sig = viewSignature(input.filters, input.page);
  if (input.existing.some((v) => viewSignature(v.filters, v.page) === sig))
    return { ok: false, error: "duplicate-params" };

  const view: SavedView = {
    id: input.id ?? generateId(),
    label,
    filters: { ...input.filters },
    page: Math.max(0, Math.floor(input.page)),
    createdAt: (input.now ?? new Date()).toISOString(),
  };
  return { ok: true, view, views: [...input.existing, view] };
}

export function removeSavedView(views: SavedView[], id: string): SavedView[] {
  return views.filter((v) => v.id !== id);
}

export function findSavedView(views: SavedView[], id: string): SavedView | null {
  return views.find((v) => v.id === id) ?? null;
}

/** Safe localStorage read. Returns [] on any failure. */
export function readSavedViews(storage?: Storage | null): SavedView[] {
  const s = storage ?? safeLocalStorage();
  if (!s) return [];
  try {
    return parseSavedViews(s.getItem(SAVED_VIEWS_STORAGE_KEY));
  } catch {
    return [];
  }
}

/** Safe localStorage write. Returns true on success. */
export function writeSavedViews(views: SavedView[], storage?: Storage | null): boolean {
  const s = storage ?? safeLocalStorage();
  if (!s) return false;
  try {
    s.setItem(SAVED_VIEWS_STORAGE_KEY, serializeSavedViews(views));
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function generateId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `sv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Translate a saved view into the URL params we want on /doctor/sessions,
 * preserving any unrelated params the caller passes in.
 *
 * Doctor-session-managed keys (risk, hasActions, dateRange, page) are
 * stripped from `preserved` so a saved view fully overrides the current
 * filter/page state.
 */
import { FILTER_PARAM_KEYS } from "@/lib/aiDoctorSessionsIndexFilters";

const MANAGED_KEYS = new Set<string>([
  FILTER_PARAM_KEYS.risk,
  FILTER_PARAM_KEYS.hasActions,
  FILTER_PARAM_KEYS.dateRange,
  FILTER_PARAM_KEYS.page,
]);

export function savedViewToSearchParams(
  view: SavedView,
  preserved: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams();
  preserved.forEach((value, key) => {
    if (!MANAGED_KEYS.has(key)) next.set(key, value);
  });
  for (const [k, v] of Object.entries(serializeFilters(view.filters))) next.set(k, v);
  const pageStr = serializePageParam(view.page);
  if (pageStr) next.set(FILTER_PARAM_KEYS.page, pageStr);
  return next;
}

export { parsePageParam };

// ---------------- export / import ----------------

export const SAVED_VIEWS_EXPORT_VERSION = 1;

export interface SavedViewsExportPayload {
  version: number;
  exportedAt: string;
  views: Array<Pick<SavedView, "label" | "filters" | "page" | "createdAt">>;
}

/**
 * Serialize saved views into a portable JSON snippet. Strips internal `id`s
 * (those are regenerated on import) and never includes user identifiers,
 * tokens, or database row ids.
 */
export function exportSavedViewsToJson(
  views: SavedView[],
  now: Date = new Date(),
): string {
  const payload: SavedViewsExportPayload = {
    version: SAVED_VIEWS_EXPORT_VERSION,
    exportedAt: now.toISOString(),
    views: views.map((v) => ({
      label: v.label,
      filters: v.filters,
      page: v.page,
      createdAt: v.createdAt,
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export type ImportError =
  | "empty-input"
  | "invalid-json"
  | "wrong-shape"
  | "no-valid-views";

export interface ImportResult {
  ok: boolean;
  views?: SavedView[];
  added?: SavedView[];
  skipped?: Array<{ label: string; reason: "duplicate-label" | "duplicate-params" | "invalid" }>;
  error?: ImportError;
}
export type ImportSuccess = ImportResult;
export type ImportFailure = ImportResult;

interface ImportInput {
  raw: string;
  existing: SavedView[];
  now?: Date;
}

/**
 * Parse a pasted JSON snippet, validate, dedupe, and merge into the existing
 * saved-views list. Never throws. Never overwrites: a failure result returns
 * an error and leaves `existing` untouched (callers should not persist).
 *
 * Accepts both the canonical `{ version, views }` payload shape and a bare
 * array of view-shaped objects for flexibility.
 */
export function importSavedViewsFromJson(input: ImportInput): ImportResult {
  const raw = (input.raw ?? "").trim();
  if (raw.length === 0) return { ok: false, error: "empty-input" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: "invalid-json" };
  }

  let candidates: unknown[];
  if (Array.isArray(parsed)) {
    candidates = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    Array.isArray((parsed as { views?: unknown }).views)
  ) {
    candidates = (parsed as { views: unknown[] }).views;
  } else {
    return { ok: false, error: "wrong-shape" };
  }

  const merged: SavedView[] = [...input.existing];
  const added: SavedView[] = [];
  const skipped: ImportSuccess["skipped"] = [];

  for (const item of candidates) {
    if (!item || typeof item !== "object") {
      skipped.push({ label: "(unknown)", reason: "invalid" });
      continue;
    }
    const it = item as Record<string, unknown>;
    const label = typeof it.label === "string" ? it.label : "";
    const filtersInput =
      it.filters && typeof it.filters === "object"
        ? (it.filters as Record<string, unknown>)
        : {};
    const filters = parseFilters(filtersInput);
    const page =
      typeof it.page === "number" && Number.isFinite(it.page) && it.page >= 0
        ? Math.floor(it.page)
        : 0;

    const result = addSavedView({
      label,
      filters,
      page,
      existing: merged,
      now: input.now,
    });
    if (result.ok && result.view) {
      merged.push(result.view);
      added.push(result.view);
    } else {
      if (result.error === "duplicate-label") {
        skipped.push({ label, reason: "duplicate-label" });
      } else if (result.error === "duplicate-params") {
        skipped.push({ label, reason: "duplicate-params" });
      } else {
        skipped.push({ label: label || "(unknown)", reason: "invalid" });
      }
    }
  }

  if (added.length === 0) {
    return { ok: false, error: "no-valid-views" };
  }
  return { ok: true, views: merged, added, skipped };
}

