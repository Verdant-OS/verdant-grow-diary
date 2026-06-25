/**
 * sensorSourceSummaryRules — pure helpers that summarize how many
 * sensor readings come from each canonical Verdant source for a given
 * (optional) date range.
 *
 * Allowed source kinds:
 *   live | manual | csv | demo | stale | invalid
 *
 * Rules:
 *  - Pure: no I/O, no DB, no React, no time except injected `now`.
 *  - Deterministic. Null-safe. Preserves input ordering.
 *  - Reuses `classifyTimelineSensorSource` so we never re-derive
 *    source classification in two different places.
 *  - Missing/unknown source counts as `invalid` (unless caller supplies
 *    a `fallback`, used e.g. for demo-mode datasets).
 *  - Live readings older than `staleMs` count as `stale`.
 *  - Other explicit sources (manual/csv/demo) are NEVER downgraded.
 *  - Date range is half-open: [from, to). Either bound may be null.
 */

import {
  classifyTimelineSensorSource,
  type TimelineSensorSourceKind,
} from "@/lib/timelineSensorSourceBadgeRules";
import { SENSOR_SOURCE_KINDS } from "@/constants/sensorSourceLabels";

export interface SensorSourceSummaryReading {
  /** Canonical source string from the reading row. */
  source?: string | null;
  /** Either of these timestamps will be used (captured_at preferred). */
  captured_at?: string | null;
  ts?: string | null;
}

export interface SensorSourceSummaryRange {
  /** ISO string lower bound, inclusive. Null = no lower bound. */
  from?: string | null;
  /** ISO string upper bound, exclusive. Null = no upper bound. */
  to?: string | null;
}

export interface SensorSourceSummaryOptions {
  range?: SensorSourceSummaryRange | null;
  /** Optional `now` for freshness checks. Defaults to Date.now(). */
  now?: number;
  /** Stale freshness window in ms. When set, old live readings → stale. */
  staleMs?: number;
  /**
   * Fallback kind for readings with no usable source string (e.g. when
   * mock data is intentionally treated as "demo"). Defaults to "invalid".
   */
  fallback?: TimelineSensorSourceKind;
}

export type SensorSourceSummaryCounts = Record<TimelineSensorSourceKind, number>;

export interface SensorSourceSummary {
  counts: SensorSourceSummaryCounts;
  total: number;
  isEmpty: boolean;
}

function emptyCounts(): SensorSourceSummaryCounts {
  return { live: 0, manual: 0, csv: 0, demo: 0, stale: 0, invalid: 0 };
}

function readingTimestamp(r: SensorSourceSummaryReading): string | null {
  if (typeof r.captured_at === "string" && r.captured_at) return r.captured_at;
  if (typeof r.ts === "string" && r.ts) return r.ts;
  return null;
}

function withinRange(ts: string | null, range: SensorSourceSummaryRange | null | undefined): boolean {
  if (!range || (range.from == null && range.to == null)) return true;
  if (!ts) return false;
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return false;
  if (range.from) {
    const from = Date.parse(range.from);
    if (Number.isFinite(from) && t < from) return false;
  }
  if (range.to) {
    const to = Date.parse(range.to);
    if (Number.isFinite(to) && t >= to) return false;
  }
  return true;
}

export function summarizeSensorSources(
  readings: ReadonlyArray<SensorSourceSummaryReading> | null | undefined,
  options: SensorSourceSummaryOptions = {},
): SensorSourceSummary {
  const counts = emptyCounts();
  if (!Array.isArray(readings) || readings.length === 0) {
    return { counts, total: 0, isEmpty: true };
  }

  const fallback: TimelineSensorSourceKind = options.fallback ?? "invalid";
  let total = 0;

  for (const r of readings) {
    if (!r || typeof r !== "object") continue;
    const ts = readingTimestamp(r);
    if (!withinRange(ts, options.range)) continue;
    const badge = classifyTimelineSensorSource({
      rawSource: r.source ?? null,
      capturedAt: ts,
      staleMs: options.staleMs,
      now: options.now,
      fallback,
    });
    counts[badge.kind] += 1;
    total += 1;
  }

  return { counts, total, isEmpty: total === 0 };
}

export const SENSOR_SOURCE_SUMMARY_EMPTY_TEXT =
  "No sensor readings found for this range.";

export function sensorSourceSummaryRowKinds(): readonly TimelineSensorSourceKind[] {
  return SENSOR_SOURCE_KINDS;
}
