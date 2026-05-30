/**
 * Pure helpers for the AI Doctor Sessions index filters.
 *
 * No side effects. No network. No data writes.
 * Used by the read-only /doctor/sessions index page and tests.
 */

export type RiskFilter = "all" | "low" | "medium" | "high" | "critical";
export type HasActionsFilter = "all" | "yes" | "no";
export type DateRangeFilter = "all" | "7d" | "30d";

export interface SessionsIndexFilters {
  risk: RiskFilter;
  hasActions: HasActionsFilter;
  dateRange: DateRangeFilter;
}

export const DEFAULT_FILTERS: SessionsIndexFilters = {
  risk: "all",
  hasActions: "all",
  dateRange: "all",
};

export const RISK_OPTIONS: RiskFilter[] = ["all", "low", "medium", "high", "critical"];
export const HAS_ACTIONS_OPTIONS: HasActionsFilter[] = ["all", "yes", "no"];
export const DATE_RANGE_OPTIONS: DateRangeFilter[] = ["all", "7d", "30d"];

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

export function parseFilters(input: Partial<Record<keyof SessionsIndexFilters, unknown>>): SessionsIndexFilters {
  return {
    risk: parseRisk(input.risk),
    hasActions: parseHasActions(input.hasActions),
    dateRange: parseDateRange(input.dateRange),
  };
}

export function isFiltersActive(f: SessionsIndexFilters): boolean {
  return f.risk !== "all" || f.hasActions !== "all" || f.dateRange !== "all";
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
  return labels;
}
