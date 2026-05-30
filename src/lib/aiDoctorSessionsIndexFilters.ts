/**
 * Pure helpers for the AI Doctor Sessions index filters.
 *
 * No side effects. No network. No data writes.
 * Used by the read-only /doctor/sessions index page and tests.
 */
import {
  buildSessionRowCautionIndicator,
  type SessionRowLike,
} from "@/lib/aiDoctorSessionDetailViewModel";
import {
  isReviewStatusFilterActive,
  type AiDoctorSessionReviewState,
  type AiDoctorSessionReviewStatusFilter,
} from "@/lib/aiDoctorSessionReviewStatusRules";

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
/**
 * "Caution" is a derived filter: a session is "caution" when
 * `buildSessionRowCautionIndicator(row).show` is true. Read-only.
 */
export type CautionFilter = "all" | "yes" | "no";
/**
 * "Has review checklist" is a derived filter: true when the row has one or
 * more deterministic review-checklist items. Read-only.
 */
export type HasChecklistFilter = "all" | "yes" | "no";
/**
 * Confidence bucket filter, derived from displayed/raw/diagnosis confidence.
 * "unknown" matches sessions with no recorded confidence.
 */
export type ConfidenceFilter = "all" | "low" | "medium" | "high" | "unknown";

/**
 * Sort options for the AI Doctor sessions index. All sorting is performed
 * client-side over the currently-loaded page of rows. Pure + deterministic.
 *
 *   newest:          created_at desc (default; matches existing server order)
 *   oldest:          created_at asc
 *   highest-risk:    critical > high > medium > low > unknown, then newest
 *   lowest-conf:     unknown < low < medium < high, then newest
 *   review-priority: caution sessions first, then checklist, then risk,
 *                    then lower/unknown confidence, then newest
 */
export type SortOption =
  | "newest"
  | "oldest"
  | "highest-risk"
  | "lowest-confidence"
  | "review-priority";

export interface SessionsIndexFilters {
  risk: RiskFilter;
  hasActions: HasActionsFilter;
  dateRange: DateRangeFilter;
  needsReview: NeedsReviewFilter;
  caution: CautionFilter;
  hasChecklist: HasChecklistFilter;
  confidence: ConfidenceFilter;
  /**
   * Durable review status from `ai_doctor_session_reviews`. "any" is the
   * default and is not active. "not_reviewed" matches rows with no review
   * events (missing state) and rows whose latest event is "cleared".
   */
  reviewStatus: AiDoctorSessionReviewStatusFilter;
  sort: SortOption;
}

export const SORT_OPTIONS: SortOption[] = [
  "newest",
  "oldest",
  "highest-risk",
  "lowest-confidence",
  "review-priority",
];

export const DEFAULT_FILTERS: SessionsIndexFilters = {
  risk: "all",
  hasActions: "all",
  dateRange: "all",
  needsReview: "all",
  caution: "all",
  hasChecklist: "all",
  confidence: "all",
  reviewStatus: "any",
  sort: "newest",
};

export const RISK_OPTIONS: RiskFilter[] = ["all", "low", "medium", "high", "critical"];
export const HAS_ACTIONS_OPTIONS: HasActionsFilter[] = ["all", "yes", "no"];
export const DATE_RANGE_OPTIONS: DateRangeFilter[] = ["all", "7d", "30d"];
export const NEEDS_REVIEW_OPTIONS: NeedsReviewFilter[] = ["all", "yes", "no"];
export const CAUTION_OPTIONS: CautionFilter[] = ["all", "yes", "no"];
export const HAS_CHECKLIST_OPTIONS: HasChecklistFilter[] = ["all", "yes", "no"];
export const CONFIDENCE_OPTIONS: ConfidenceFilter[] = [
  "all",
  "low",
  "medium",
  "high",
  "unknown",
];
export const REVIEW_STATUS_OPTIONS: AiDoctorSessionReviewStatusFilter[] = [
  "any",
  "not_reviewed",
  "reviewed",
  "needs_follow_up",
];

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

export function parseCaution(value: unknown): CautionFilter {
  return CAUTION_OPTIONS.includes(value as CautionFilter)
    ? (value as CautionFilter)
    : "all";
}

export function parseHasChecklist(value: unknown): HasChecklistFilter {
  return HAS_CHECKLIST_OPTIONS.includes(value as HasChecklistFilter)
    ? (value as HasChecklistFilter)
    : "all";
}

export function parseConfidence(value: unknown): ConfidenceFilter {
  return CONFIDENCE_OPTIONS.includes(value as ConfidenceFilter)
    ? (value as ConfidenceFilter)
    : "all";
}

export function parseSort(value: unknown): SortOption {
  return SORT_OPTIONS.includes(value as SortOption)
    ? (value as SortOption)
    : "newest";
}

export function parseReviewStatus(
  value: unknown,
): AiDoctorSessionReviewStatusFilter {
  return REVIEW_STATUS_OPTIONS.includes(value as AiDoctorSessionReviewStatusFilter)
    ? (value as AiDoctorSessionReviewStatusFilter)
    : "any";
}

export function parseFilters(input: Partial<Record<keyof SessionsIndexFilters, unknown>>): SessionsIndexFilters {
  return {
    risk: parseRisk(input.risk),
    hasActions: parseHasActions(input.hasActions),
    dateRange: parseDateRange(input.dateRange),
    needsReview: parseNeedsReview(input.needsReview),
    caution: parseCaution(input.caution),
    hasChecklist: parseHasChecklist(input.hasChecklist),
    confidence: parseConfidence(input.confidence),
    reviewStatus: parseReviewStatus(input.reviewStatus),
    sort: parseSort(input.sort),
  };
}

export function isFiltersActive(f: SessionsIndexFilters): boolean {
  return (
    f.risk !== "all" ||
    f.hasActions !== "all" ||
    f.dateRange !== "all" ||
    f.needsReview !== "all" ||
    f.caution !== "all" ||
    f.hasChecklist !== "all" ||
    f.confidence !== "all" ||
    isReviewStatusFilterActive(f.reviewStatus) ||
    f.sort !== "newest"
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

const CONFIDENCE_LABEL: Record<Exclude<ConfidenceFilter, "all">, string> = {
  low: "Confidence: Low",
  medium: "Confidence: Medium",
  high: "Confidence: High",
  unknown: "Confidence: Unknown",
};

const SORT_LABEL: Record<Exclude<SortOption, "newest">, string> = {
  oldest: "Sort: Oldest first",
  "highest-risk": "Sort: Highest risk first",
  "lowest-confidence": "Sort: Lowest confidence first",
  "review-priority": "Sort: Review priority",
};

export function formatActiveFilterLabels(f: SessionsIndexFilters): string[] {
  const labels: string[] = [];
  if (f.risk !== "all") labels.push(RISK_LABEL[f.risk]);
  if (f.hasActions === "yes") labels.push("Has suggested actions");
  if (f.hasActions === "no") labels.push("No suggested actions");
  if (f.dateRange !== "all") labels.push(DATE_RANGE_LABEL[f.dateRange]);
  if (f.needsReview === "yes") labels.push("Needs review");
  if (f.needsReview === "no") labels.push("No review needed");
  if (f.caution === "yes") labels.push("Caution only");
  if (f.caution === "no") labels.push("No caution");
  if (f.hasChecklist === "yes") labels.push("Has review checklist");
  if (f.hasChecklist === "no") labels.push("No review checklist");
  if (f.confidence !== "all") labels.push(CONFIDENCE_LABEL[f.confidence]);
  if (f.sort !== "newest") labels.push(SORT_LABEL[f.sort]);
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
  caution: "caution",
  hasChecklist: "hasChecklist",
  confidence: "confidence",
  sort: "sort",
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
  if (f.caution !== DEFAULT_FILTERS.caution) out[FILTER_PARAM_KEYS.caution] = f.caution;
  if (f.hasChecklist !== DEFAULT_FILTERS.hasChecklist)
    out[FILTER_PARAM_KEYS.hasChecklist] = f.hasChecklist;
  if (f.confidence !== DEFAULT_FILTERS.confidence)
    out[FILTER_PARAM_KEYS.confidence] = f.confidence;
  if (f.sort !== DEFAULT_FILTERS.sort) out[FILTER_PARAM_KEYS.sort] = f.sort;
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

// ---------------- caution / checklist / confidence derived rules ----------------

/**
 * Bucket a 0-100 confidence percent into low/medium/high. Returns "unknown"
 * for null/invalid values. Pure.
 *   low:    pct <= 60
 *   medium: 61 <= pct <= 80
 *   high:   pct >  80
 */
export function confidenceBucketFromPct(
  pct: number | null | undefined,
): Exclude<ConfidenceFilter, "all"> {
  if (typeof pct !== "number" || !Number.isFinite(pct)) return "unknown";
  if (pct <= 60) return "low";
  if (pct <= 80) return "medium";
  return "high";
}

function pctFromUnit(val: unknown): number | null {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  const clamped = Math.max(0, Math.min(1, val));
  return Math.round(clamped * 100);
}

/**
 * Loose row shape for client-side filtering. Matches what the index hook
 * returns. Kept loose so tests can pass minimal fixtures.
 */
export interface FilterableSessionRow extends SessionRowLike {
  displayed_confidence?: number | null;
  raw_confidence?: number | null;
}

export function rowHasCaution(row: FilterableSessionRow): boolean {
  return buildSessionRowCautionIndicator(row).show;
}

export function rowHasChecklist(row: FilterableSessionRow): boolean {
  return buildSessionRowCautionIndicator(row).checklistItems.length > 0;
}

export function rowConfidenceBucket(
  row: FilterableSessionRow,
): Exclude<ConfidenceFilter, "all"> {
  const pct =
    pctFromUnit(row.displayed_confidence) ??
    pctFromUnit(row.raw_confidence) ??
    pctFromUnit(row.diagnosis?.confidence as unknown);
  return confidenceBucketFromPct(pct);
}

/**
 * Apply client-side derived filters (caution, hasChecklist, confidence) to a
 * page of session rows. Risk / hasActions / dateRange / needsReview are
 * already applied server-side by `useAiDoctorSessionsIndex`.
 *
 * Pure. Deterministic. Order-preserving.
 */
export function applyClientSideFilters<T extends FilterableSessionRow>(
  rows: T[],
  f: SessionsIndexFilters,
): T[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return rows.filter((row) => {
    if (f.caution === "yes" && !rowHasCaution(row)) return false;
    if (f.caution === "no" && rowHasCaution(row)) return false;
    if (f.hasChecklist === "yes" && !rowHasChecklist(row)) return false;
    if (f.hasChecklist === "no" && rowHasChecklist(row)) return false;
    if (f.confidence !== "all" && rowConfidenceBucket(row) !== f.confidence)
      return false;
    return true;
  });
}

// ---------------- "Needs my attention" preset ----------------

/**
 * The "Needs my attention" preset is a one-click shortcut that applies the
 * existing caution + hasChecklist filters together. It does NOT introduce a
 * new data model — it just toggles two existing filter keys.
 *
 * Read-only. No writes. No automation.
 */
export const NEEDS_ATTENTION_PRESET_LABEL = "Needs my attention";

export function isNeedsAttentionPresetActive(f: SessionsIndexFilters): boolean {
  return f.caution === "yes" && f.hasChecklist === "yes";
}

/**
 * Apply the preset over an existing filter state. Preserves all other filter
 * keys (risk, hasActions, dateRange, needsReview, confidence) untouched.
 */
export function applyNeedsAttentionPreset(f: SessionsIndexFilters): SessionsIndexFilters {
  return { ...f, caution: "yes", hasChecklist: "yes" };
}

/**
 * Clear only the preset-specific filter keys, preserving the rest.
 */
export function clearNeedsAttentionPreset(f: SessionsIndexFilters): SessionsIndexFilters {
  return { ...f, caution: "all", hasChecklist: "all" };
}

/**
 * Count rows in the currently-loaded page that match the preset criteria.
 * Pure. Does NOT query the database — caller passes already-loaded rows.
 */
export function countNeedsAttentionVisible<T extends FilterableSessionRow>(
  rows: T[],
): number {
  if (!Array.isArray(rows)) return 0;
  let n = 0;
  for (const row of rows) {
    if (rowHasCaution(row) && rowHasChecklist(row)) n += 1;
  }
  return n;
}

// ---------------- client-side sort ----------------

const RISK_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function riskRank(row: FilterableSessionRow): number {
  const r = row.diagnosis?.riskLevel;
  if (typeof r === "string" && r in RISK_RANK) return RISK_RANK[r];
  return 0; // unknown / missing
}

const CONFIDENCE_RANK: Record<Exclude<ConfidenceFilter, "all">, number> = {
  // Lower number = lower confidence (sorted first by "lowest-confidence").
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function createdAtMs(row: FilterableSessionRow): number {
  const v = (row as { created_at?: unknown }).created_at;
  if (typeof v !== "string") return 0;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}

/** Newest-first by created_at; stable tie-break by id. */
function compareNewest(a: FilterableSessionRow, b: FilterableSessionRow): number {
  const d = createdAtMs(b) - createdAtMs(a);
  if (d !== 0) return d;
  return String((a as { id?: unknown }).id ?? "").localeCompare(
    String((b as { id?: unknown }).id ?? ""),
  );
}

function compareOldest(a: FilterableSessionRow, b: FilterableSessionRow): number {
  return -compareNewest(a, b);
}

function compareHighestRisk(
  a: FilterableSessionRow,
  b: FilterableSessionRow,
): number {
  const d = riskRank(b) - riskRank(a);
  if (d !== 0) return d;
  return compareNewest(a, b);
}

function compareLowestConfidence(
  a: FilterableSessionRow,
  b: FilterableSessionRow,
): number {
  const d = CONFIDENCE_RANK[rowConfidenceBucket(a)] - CONFIDENCE_RANK[rowConfidenceBucket(b)];
  if (d !== 0) return d;
  return compareNewest(a, b);
}

function compareReviewPriority(
  a: FilterableSessionRow,
  b: FilterableSessionRow,
): number {
  // Caution first.
  const ca = rowHasCaution(a) ? 1 : 0;
  const cb = rowHasCaution(b) ? 1 : 0;
  if (ca !== cb) return cb - ca;
  // Then checklist.
  const ka = rowHasChecklist(a) ? 1 : 0;
  const kb = rowHasChecklist(b) ? 1 : 0;
  if (ka !== kb) return kb - ka;
  // Then higher risk.
  const rd = riskRank(b) - riskRank(a);
  if (rd !== 0) return rd;
  // Then lower (or unknown) confidence.
  const cd = CONFIDENCE_RANK[rowConfidenceBucket(a)] - CONFIDENCE_RANK[rowConfidenceBucket(b)];
  if (cd !== 0) return cd;
  // Final tie-break: newest first.
  return compareNewest(a, b);
}

const COMPARATORS: Record<
  SortOption,
  (a: FilterableSessionRow, b: FilterableSessionRow) => number
> = {
  newest: compareNewest,
  oldest: compareOldest,
  "highest-risk": compareHighestRisk,
  "lowest-confidence": compareLowestConfidence,
  "review-priority": compareReviewPriority,
};

/**
 * Apply the chosen sort to currently-loaded rows. Pure + stable +
 * deterministic. Does NOT mutate the input.
 *
 * NOTE: sorting is applied to the currently loaded page only. Pagination
 * remains driven by the server query (newest-first). Use of non-default
 * sorts is best paired with a tight filter so the loaded page contains
 * the rows the grower wants to triage.
 */
export function applyClientSideSort<T extends FilterableSessionRow>(
  rows: T[],
  sort: SortOption,
): T[] {
  if (!Array.isArray(rows) || rows.length <= 1) {
    return Array.isArray(rows) ? [...rows] : [];
  }
  const cmp = COMPARATORS[sort] ?? compareNewest;
  return [...rows].sort(cmp);
}

