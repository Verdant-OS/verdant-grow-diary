/**
 * sensorSourceSummaryRules — pure helpers that summarize sensor readings for a
 * given (optional) date range along two separate axes:
 *
 *   provenance — which canonical Verdant source each reading came from
 *                (live | manual | csv | demo | stale | invalid)
 *   freshness  — whether each reading may still be treated as current
 *                (fresh | stale | unknown)
 *
 * Rules:
 *  - Pure: no I/O, no DB, no React, no time except injected `now`.
 *  - Deterministic. Null-safe. Preserves input ordering.
 *  - Provenance reuses `classifyTimelineSensorSource` and is never downgraded
 *    by age: an old live reading still counts as live provenance.
 *  - Freshness reuses the Dashboard's `resolveDashboardSensorBadgeStatus`, which
 *    applies the Sensor Truth canon windows (15-minute live, 24-hour manual) and
 *    never lets a missing, unparseable, or future timestamp read as current.
 *    This keeps the summary in agreement with the individual badges and the
 *    Dashboard (VER-299).
 *  - `counts.stale` is a freshness count: readings persisted as `stale` plus live
 *    or manual readings older than their canon window. A stale manual reading
 *    therefore counts under both `manual` (provenance) and `stale` (freshness).
 *  - Missing/unknown source counts as `invalid` (unless caller supplies a
 *    `fallback`, used e.g. for demo-mode datasets).
 *  - Date range is half-open: [from, to). Either bound may be null.
 */

import {
  classifyTimelineSensorSource,
  type TimelineSensorSourceKind,
} from "@/lib/timelineSensorSourceBadgeRules";
import { resolveDashboardSensorBadgeStatus } from "@/lib/dashboardSensorEvidenceRules";
import { SENSOR_SOURCE_KINDS } from "@/constants/sensorSourceLabels";
import {
  LIVE_CURRENT_STATE_STALE_MINUTES,
  MANUAL_CURRENT_STATE_STALE_HOURS,
} from "@/lib/sensorTruthCanon";

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
  /**
   * Clock (ms) for freshness checks. Inject it from the caller's `useNowTick`
   * so the summary and the badges beside it agree on "now". Defaults to
   * Date.now() only when omitted.
   */
  now?: number;
  /**
   * Fallback kind for readings with no usable source string (e.g. when
   * mock data is intentionally treated as "demo"). Defaults to "invalid".
   */
  fallback?: TimelineSensorSourceKind;
}

export type SensorSourceSummaryCounts = Record<TimelineSensorSourceKind, number>;

/**
 * Freshness buckets, mapped from the Dashboard's snapshot status:
 *   usable → fresh; stale → stale; invalid / needs_review / no_data → unknown.
 * `unknown` is never healthy: it covers invalid provenance, missing or future
 * timestamps, and non-current provenance such as csv or demo.
 */
export type SensorSourceSummaryFreshness = "fresh" | "stale" | "unknown";

export type SensorSourceSummaryFreshnessCounts = Record<SensorSourceSummaryFreshness, number>;

export interface SensorSourceSummary {
  /** Provenance counts; `stale` is the freshness count (see module header). */
  counts: SensorSourceSummaryCounts;
  /** Freshness counts. `fresh + stale + unknown === total`. */
  freshness: SensorSourceSummaryFreshnessCounts;
  total: number;
  isEmpty: boolean;
}

function emptyCounts(): SensorSourceSummaryCounts {
  return { live: 0, manual: 0, csv: 0, demo: 0, stale: 0, invalid: 0 };
}

function emptyFreshness(): SensorSourceSummaryFreshnessCounts {
  return { fresh: 0, stale: 0, unknown: 0 };
}

/**
 * Freshness of one reading, by the same rule the Dashboard badge uses.
 * Exported so presenters and tests can pin a single reading's bucket.
 */
export function classifySensorSourceSummaryFreshness(
  reading: SensorSourceSummaryReading,
  now: number,
): SensorSourceSummaryFreshness {
  const status = resolveDashboardSensorBadgeStatus(
    { source: reading.source ?? null, captured_at: reading.captured_at, ts: reading.ts },
    now,
  );
  if (status === "usable") return "fresh";
  if (status === "stale") return "stale";
  return "unknown";
}

function readingTimestamp(r: SensorSourceSummaryReading): string | null {
  if (typeof r.captured_at === "string" && r.captured_at) return r.captured_at;
  if (typeof r.ts === "string" && r.ts) return r.ts;
  return null;
}

function withinRange(
  ts: string | null,
  range: SensorSourceSummaryRange | null | undefined,
): boolean {
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
  const freshness = emptyFreshness();
  if (!Array.isArray(readings) || readings.length === 0) {
    return { counts, freshness, total: 0, isEmpty: true };
  }

  const fallback: TimelineSensorSourceKind = options.fallback ?? "invalid";
  const now =
    typeof options.now === "number" && Number.isFinite(options.now) ? options.now : Date.now();
  let total = 0;

  for (const r of readings) {
    if (!r || typeof r !== "object") continue;
    const ts = readingTimestamp(r);
    if (!withinRange(ts, options.range)) continue;
    // Provenance: never downgraded by age (no staleMs passed on purpose).
    const badge = classifyTimelineSensorSource({
      rawSource: r.source ?? null,
      capturedAt: ts,
      fallback,
    });
    // Freshness: the Dashboard's source-aware canon rule.
    const bucket = classifySensorSourceSummaryFreshness(r, now);
    freshness[bucket] += 1;
    if (badge.kind !== "stale") counts[badge.kind] += 1;
    // Stale row: persisted-stale provenance, or live/manual past its canon window.
    if (badge.kind === "stale" || bucket === "stale") counts.stale += 1;
    total += 1;
  }

  return { counts, freshness, total, isEmpty: total === 0 };
}

export const SENSOR_SOURCE_SUMMARY_FRESHNESS_LABEL: Record<SensorSourceSummaryFreshness, string> = {
  fresh: "Fresh",
  stale: "Stale",
  unknown: "Unknown",
};

export const SENSOR_SOURCE_SUMMARY_FRESHNESS_LEGEND: Record<SensorSourceSummaryFreshness, string> =
  {
    fresh: `Live within ${LIVE_CURRENT_STATE_STALE_MINUTES} minutes or manual within ${MANUAL_CURRENT_STATE_STALE_HOURS} hours; may be treated as current.`,
    stale: "Older than its freshness window, or persisted as stale; not current telemetry.",
    unknown:
      "Invalid, missing or future timestamp, or non-current provenance (CSV/demo); never healthy.",
  };

export const SENSOR_SOURCE_SUMMARY_FRESHNESS_ORDER: readonly SensorSourceSummaryFreshness[] = [
  "fresh",
  "stale",
  "unknown",
];

export const SENSOR_SOURCE_SUMMARY_EMPTY_TEXT = "No sensor readings found for this range.";

export function sensorSourceSummaryRowKinds(): readonly TimelineSensorSourceKind[] {
  return SENSOR_SOURCE_KINDS;
}
