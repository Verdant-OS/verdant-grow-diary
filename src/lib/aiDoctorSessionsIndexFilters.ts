/**
 * Pure helpers for the AI Doctor Sessions index filters.
 *
 * No side effects. No network. No data writes.
 * Used by the read-only /doctor/sessions index page and tests.
 */

export type RiskFilter = "all" | "low" | "medium" | "high" | "critical";
export type HasActionsFilter = "all" | "yes" | "no";
export type DateRangeFilter = "all" | "7d" | "30d";
/**
 * "Needs review" is a derived filter (see `sessionNeedsReview`):
 *   A session needs review when its diagnosis riskLevel is high or
 *   critical, OR it has at least one suggested action.
 *
 * This filter does NOT introduce a reviewed/completion state on the row.
 * It is purely a read-only lens over existing fields.
 */
export type NeedsReviewFilter = "all" | "yes" | "no";

export interface SessionsIndexFilters {
  risk: RiskFilter;
  hasActions: HasActionsFilter;
  dateRange: DateRangeFilter;
  needsReview: NeedsReviewFilter;
}

export const DEFAULT_FILTERS: SessionsIndexFilters = {
  risk: "all",
  hasActions: "all",
  dateRange: "all",
  needsReview: "all",
};

export const RISK_OPTIONS: RiskFilter[] = ["all", "low", "medium", "high", "critical"];
export const HAS_ACTIONS_OPTIONS: HasActionsFilter[] = ["all", "yes", "no"];
export const DATE_RANGE_OPTIONS: DateRangeFilter[] = ["all", "7d", "30d"];
export const NEEDS_REVIEW_OPTIONS: NeedsReviewFilter[] = ["all", "yes", "no"];

export function parseRisk(value: unknown): RiskFilter {
  return RISK_OPTIONS.includes(value as RiskFilter) ? (value as RiskFilter) : "all";
}

export function parseHasActions(value: unknown): HasActionsFilter {
  return HAS_ACTIONS_OPTIONS.includes(value as HasActionsFilter)
    ? (value as HasActionsFilter)
    : "all";
}

export function parseDateRange(value: unknown): DateRangeFilter {
  return DATE_RANGE_OPTIONS.includes(value as DateRangeFilter)
    ? (value as DateRangeFilter)
    : "all";
}

export function parseNeedsReview(value: unknown): NeedsReviewFilter {
  return NEEDS_REVIEW_OPTIONS.includes(value as NeedsReviewFilter)
    ? (value as NeedsReviewFilter)
    : "all";
}

export function parseFilters(input: Partial<Record<keyof SessionsIndexFilters, unknown>>): SessionsIndexFilters {
  return {
    risk: parseRisk(input.risk),
    hasActions: parseHasActions(input.hasActions),
    dateRange: parseDateRange(input.dateRange),
    needsReview: parseNeedsReview(input.needsReview),
  };
}

export function isFiltersActive(f: SessionsIndexFilters): boolean {
  return (
    f.risk !== "all" ||
    f.hasActions !== "all" ||
    f.dateRange !== "all" ||
    f.needsReview !== "all"
  );
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Returns the lower-bound ISO timestamp for the date range filter, or null
 * if "all". `now` is injectable for deterministic tests.
 */
export function dateRangeSince(range: DateRangeFilter, now: Date = new Date()): Date | null {
  if (range === "7d") return new Date(now.getTime() - 7 * MS_PER_DAY);
  if (range === "30d") return new Date(now.getTime() - 30 * MS_PER_DAY);
  return null;
}

const RISK_LABEL: Record<Exclude<RiskFilter, "all">, string> = {
  low: "Risk: Low",
  medium: "Risk: Medium",
  high: "Risk: High",
  critical: "Risk: Critical",
};

const DATE_RANGE_LABEL: Record<Exclude<DateRangeFilter, "all">, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
};

export function formatActiveFilterLabels(f: SessionsIndexFilters): string[] {
  const labels: string[] = [];
  if (f.risk !== "all") labels.push(RISK_LABEL[f.risk]);
  if (f.hasActions === "yes") labels.push("Has suggested actions");
  if (f.hasActions === "no") labels.push("No suggested actions");
  if (f.dateRange !== "all") labels.push(DATE_RANGE_LABEL[f.dateRange]);
  if (f.needsReview === "yes") labels.push("Needs review");
  if (f.needsReview === "no") labels.push("No review needed");
  return labels;
}

/**
 * URL search-param keys used by /doctor/sessions for filters + pagination.
 * Centralized so the page and tests stay in lock-step.
 */
export const FILTER_PARAM_KEYS = {
  risk: "risk",
  hasActions: "hasActions",
  dateRange: "dateRange",
  needsReview: "needsReview",
  page: "page",
} as const;

/**
 * Serialize filter state to a plain object suitable for URLSearchParams.
 * Default values are omitted so they don't clutter the URL.
 */
export function serializeFilters(f: SessionsIndexFilters): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.risk !== DEFAULT_FILTERS.risk) out[FILTER_PARAM_KEYS.risk] = f.risk;
  if (f.hasActions !== DEFAULT_FILTERS.hasActions) out[FILTER_PARAM_KEYS.hasActions] = f.hasActions;
  if (f.dateRange !== DEFAULT_FILTERS.dateRange) out[FILTER_PARAM_KEYS.dateRange] = f.dateRange;
  if (f.needsReview !== DEFAULT_FILTERS.needsReview)
    out[FILTER_PARAM_KEYS.needsReview] = f.needsReview;
  return out;
}

/**
 * Parse a 1-based page param from URL into a 0-based page index. Invalid or
 * missing values normalize to 0. (URL is 1-based for human readability.)
 */
export function parsePageParam(value: unknown): number {
  if (typeof value !== "string") return 0;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 0;
  return n - 1;
}

/**
 * Serialize a 0-based page index to a 1-based URL string. Page 0 returns null
 * so callers can omit the param entirely from the URL.
 */
export function serializePageParam(page: number): string | null {
  if (!Number.isFinite(page) || page <= 0) return null;
  return String(Math.floor(page) + 1);
}

// ---------------- needs-review derived rule ----------------

/**
 * Minimal shape required to evaluate "needs review". Kept loose so callers
 * can pass either a full AiDoctorSessionRow or a small test fixture.
 */
export interface NeedsReviewInput {
  diagnosis?: { riskLevel?: unknown } | null;
  suggested_actions?: unknown;
}

/**
 * Derived, read-only predicate:
 *   A session needs review when its diagnosis risk is high or critical,
 *   OR when it has one or more suggested actions.
 *
 * Pure. Null-safe. Does NOT mark sessions reviewed, mutate rows, or imply
 * any completion state. Used both client-side (label/badge) and as the
 * source of truth for the URL filter mirrored server-side in the hook.
 */
export function sessionNeedsReview(row: NeedsReviewInput | null | undefined): boolean {
  if (!row || typeof row !== "object") return false;
  const risk = row.diagnosis?.riskLevel;
  if (risk === "high" || risk === "critical") return true;
  const actions = row.suggested_actions;
  if (Array.isArray(actions) && actions.length > 0) return true;
  return false;
}
