/**
 * actionQueueFilterRules — pure helpers for /actions search & filtering.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - Deterministic. Case-insensitive search. Filters compose predictably:
 *    `applyActionQueueListPipeline` runs the trace filter first, then
 *    the search match.
 *  - NEVER searches payload raw bytes, hidden metadata, service keys, bridge
 *    tokens, or internal UUIDs. Only grower-visible fields and the
 *    caller-provided source/plant labels are searched.
 *  - `[alert:<id>]` / `[session:<id>]` back-pointer tokens are stripped
 *    out of `reason` before search matching so internal ids cannot leak
 *    into the search index.
 */

import { stripBackPointerTokens } from "@/lib/actionQueueProvenanceRules";

export interface ActionSearchRowLike {
  id?: string | null;
  action_type?: string | null;
  suggested_change?: string | null;
  reason?: string | null;
  source?: string | null;
  plant_id?: string | null;
}

export interface ActionSearchLookups {
  /** Optional grower-facing source label, e.g. "Environment Alerts". */
  sourceLabelFor?: (row: ActionSearchRowLike) => string | null | undefined;
  /** Optional plant lookup by id. Only `name` is searched. */
  plantsById?: Record<string, { name?: string | null } | undefined>;
}

export interface TraceFailureLike {
  actionId: string;
}

export function normalizeActionSearchQuery(
  query: string | null | undefined,
): string {
  if (typeof query !== "string") return "";
  return query.trim().toLowerCase();
}

/**
 * Returns the grower-visible, search-safe fields for a row. Exposed so
 * tests can assert payload raw bytes and internal IDs are not in the index.
 */
export function collectActionSearchFields(
  row: ActionSearchRowLike,
  lookups?: ActionSearchLookups,
): string[] {
  const fields: string[] = [];
  if (row.action_type) fields.push(row.action_type);
  if (row.suggested_change) fields.push(row.suggested_change);
  if (row.reason) fields.push(stripBackPointerTokens(row.reason));
  const sourceLabel = lookups?.sourceLabelFor?.(row);
  if (sourceLabel) fields.push(sourceLabel);
  const plantName =
    row.plant_id && lookups?.plantsById?.[row.plant_id]?.name;
  if (plantName) fields.push(plantName);
  return fields;
}

export function actionMatchesSearch(
  row: ActionSearchRowLike,
  query: string | null | undefined,
  lookups?: ActionSearchLookups,
): boolean {
  const needle = normalizeActionSearchQuery(query);
  if (!needle) return true;
  const fields = collectActionSearchFields(row, lookups);
  for (const field of fields) {
    if (typeof field === "string" && field.toLowerCase().includes(needle)) {
      return true;
    }
  }
  return false;
}

export function actionMatchesTraceFailedFilter(
  row: { id?: string | null },
  traceFailure: TraceFailureLike | null | undefined,
): boolean {
  if (!traceFailure) return false;
  if (!row || typeof row.id !== "string") return false;
  return row.id === traceFailure.actionId;
}

export type ActionListExtraFilter = "none" | "trace_failed";

export interface ActionListPipelineInput<T extends ActionSearchRowLike> {
  rows: ReadonlyArray<T>;
  query: string | null | undefined;
  traceFilter: ActionListExtraFilter;
  traceFailure: TraceFailureLike | null | undefined;
  lookups?: ActionSearchLookups;
}

/**
 * Composition order is fixed and tested: trace filter first, then
 * search match. Callers that need other filters (status, risk, etc.)
 * apply those before calling this helper.
 */
export function applyActionQueueListPipeline<T extends ActionSearchRowLike>(
  input: ActionListPipelineInput<T>,
): T[] {
  const { rows, query, traceFilter, traceFailure, lookups } = input;
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const traceFiltered =
    traceFilter === "trace_failed"
      ? rows.filter((r) => actionMatchesTraceFailedFilter(r, traceFailure))
      : rows.slice();
  const needle = normalizeActionSearchQuery(query);
  if (!needle) return traceFiltered;
  return traceFiltered.filter((r) => actionMatchesSearch(r, needle, lookups));
}
