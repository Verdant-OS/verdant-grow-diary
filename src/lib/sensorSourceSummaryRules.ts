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
 *  - Invalid provenance is never fresh. The Sensor Truth canon accepts vendor
 *    and Quick Log source aliases for its freshness windows that the canonical
 *    provenance classifier does not, so a raw snapshot source such as "mqtt"
 *    or "quick_log" counts as Invalid provenance; its freshness is unknown,
 *    never fresh (Copilot on #2586 at 12f1e03fe).
 *  - A reading's persisted downgrade is a floor the clock cannot lift: a
 *    canonical `status` of stale / invalid / needs_review / no_data, or a
 *    `quality` other than ok, keeps the reading out of `fresh` even when its
 *    source and timestamp alone would pass (Codex P2 on #2586 at b1cab8f9d).
 *  - A persisted snapshot's own `live` claim is never fresh. Diary rows carry
 *    a copy of a reading, not the reading, so the Timeline's persisted-snapshot
 *    trust fence applies to their freshness: a reading with
 *    `context: "persisted_snapshot"` and a live source is unknown even inside
 *    the 15-minute window. Direct readings (Sensors page rows) pass no context
 *    and keep the clock rule (Codex P1 on #2586 at 60b20d9c8).
 *  - `counts.stale` is a freshness count: readings persisted as `stale` plus live
 *    or manual readings older than their canon window or flagged stale. A stale
 *    manual reading therefore counts under both `manual` (provenance) and
 *    `stale` (freshness). The Stale row is an aggregate, not a Timeline source
 *    filter: the Timeline's `sensorSources=stale` filter matches persisted
 *    provenance only, so the row must not link there.
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
  /**
   * Canonical Sensor Snapshot Status for the reading when the caller already
   * derived one (`usable` | `stale` | `invalid` | `needs_review` | `no_data`).
   * Anything other than `usable` is a floor: it can only lower freshness.
   */
  status?: string | null;
  /** Persisted intake quality for raw rows (`ok` or empty means no downgrade). */
  quality?: string | null;
  /**
   * Where the reading came from. `persisted_snapshot` marks a copy stored on a
   * diary row, whose `live` claim is not corroborated and is never fresh.
   * Omitted or `direct` means a reading the caller read from its source table.
   */
  context?: "direct" | "persisted_snapshot";
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

const FRESHNESS_TRUST_RANK: Record<SensorSourceSummaryFreshness, number> = {
  fresh: 0,
  stale: 1,
  unknown: 2,
};

function normalizeFlag(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * The part of a reading's freshness fixed by its persisted status and quality,
 * mirroring the adapter's persisted-status floor: stale stays stale; invalid,
 * degraded, needs_review, no_data and any other non-ok flag are never current.
 * Null when only source and capture time decide.
 */
function persistedFreshnessFloor(
  status: unknown,
  quality: unknown,
): SensorSourceSummaryFreshness | null {
  const s = normalizeFlag(status);
  const q = normalizeFlag(quality);
  if (s && s !== "usable" && s !== "stale") return "unknown";
  if (q === "invalid" || q === "degraded") return "unknown";
  if (s === "stale" || q === "stale") return "stale";
  if (q && q !== "ok") return "unknown";
  return null;
}

/**
 * Freshness of one reading: invalid provenance is unknown; otherwise the same
 * rule the Dashboard badge uses, then lowered (never raised) by the reading's
 * persisted status or quality. Exported so presenters and tests can pin a
 * single reading's bucket.
 */
export function classifySensorSourceSummaryFreshness(
  reading: SensorSourceSummaryReading,
  now: number,
): SensorSourceSummaryFreshness {
  // Provenance first: a source string the canonical classifier rejects (vendor
  // or transport aliases, unknown labels) is Invalid and can never be current,
  // even when the canon's freshness windows would accept the alias. The
  // persisted-snapshot context applies the Timeline's trust fence: a stored
  // copy's live claim is Invalid here, so it is never fresh.
  const provenance = classifyTimelineSensorSource({
    rawSource: reading.source ?? null,
    capturedAt: readingTimestamp(reading),
    context: reading.context,
    fallback: "invalid",
  }).kind;
  if (provenance === "invalid") return "unknown";
  const status = resolveDashboardSensorBadgeStatus(
    { source: reading.source ?? null, captured_at: reading.captured_at, ts: reading.ts },
    now,
  );
  const byClock: SensorSourceSummaryFreshness =
    status === "usable" ? "fresh" : status === "stale" ? "stale" : "unknown";
  const floor = persistedFreshnessFloor(reading.status, reading.quality);
  if (floor === null) return byClock;
  return FRESHNESS_TRUST_RANK[floor] > FRESHNESS_TRUST_RANK[byClock] ? floor : byClock;
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
    fresh: `Live within ${LIVE_CURRENT_STATE_STALE_MINUTES} minutes or manual within ${MANUAL_CURRENT_STATE_STALE_HOURS} hours, with no persisted status or quality downgrade; may be treated as current.`,
    stale:
      "Older than its freshness window, or persisted or flagged as stale; not current telemetry.",
    unknown:
      "Invalid provenance, invalid, missing or future timestamp, rejected quality, or non-current provenance (CSV/demo); never healthy.",
  };

/** The Stale row counts freshness, so it cannot link to the Timeline's persisted-source filter. */
export const SENSOR_SOURCE_SUMMARY_STALE_ROW_NOTE =
  "Freshness count (past its window or flagged stale); not a Timeline source filter.";

export const SENSOR_SOURCE_SUMMARY_FRESHNESS_ORDER: readonly SensorSourceSummaryFreshness[] = [
  "fresh",
  "stale",
  "unknown",
];

export const SENSOR_SOURCE_SUMMARY_EMPTY_TEXT = "No sensor readings found for this range.";

export function sensorSourceSummaryRowKinds(): readonly TimelineSensorSourceKind[] {
  return SENSOR_SOURCE_KINDS;
}
