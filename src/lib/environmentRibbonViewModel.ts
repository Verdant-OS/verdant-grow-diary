/**
 * environmentRibbonViewModel — pure view model for the 24-hour environment
 * ribbon (air temp / RH / VPD over time, with a provenance band underneath).
 *
 * Pure. No I/O. No React. Deterministic. Time is injected.
 *
 * Safety contract (load-bearing — see AGENTS.md "Sensor Truth Rules"):
 *
 * - Every bucket carries one of the six canonical sources
 *   (live | manual | csv | demo | stale | invalid) or `none` when no reading
 *   fell in it. Unknown / missing sources normalize to `invalid`, never to a
 *   healthy label (delegated to `normalizeSensorSource`).
 * - A reading whose `status` is not `usable` can never be shown as healthy:
 *   `stale` → `stale`, everything else non-usable → `invalid`.
 * - VPD is only computed from a bucket whose source is not `invalid` and whose
 *   temp / RH pass range checks (delegated to `calculateVpdKpa`). A pinned RH
 *   of 0 % or 100 % marks the bucket `invalid` and excludes it from VPD.
 * - A bucket with no reading renders as a gap. It is never interpolated.
 * - Nothing here writes, fetches, or triggers anything.
 */

import { calculateVpdKpa } from "@/lib/greenhouseClimateRules";
import { normalizeSensorSource, type SensorSource } from "@/lib/sensor/sensorSourceRules";

export type RibbonSource = SensorSource | "none";

export const RIBBON_SOURCES: readonly RibbonSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
  "none",
] as const;

export const DEFAULT_RIBBON_WINDOW_HOURS = 24;
export const DEFAULT_RIBBON_BUCKET_MINUTES = 5;

/** Minimal reading shape. Matches `SensorReading` from `@/mock` structurally. */
export interface EnvironmentRibbonReadingLike {
  /** ISO capture time. Preferred over `ts` when present. */
  capturedAt?: string | null;
  /** ISO fallback timestamp. */
  ts?: string | null;
  temp?: number | null;
  rh?: number | null;
  source?: string | null;
  /** Sensor Snapshot Status Contract v1 status. Missing → not usable. */
  status?: string | null;
  /**
   * Metrics physically present. When present, a metric absent from this list
   * is treated as missing even if a compatibility zero was filled in.
   */
  observedMetrics?: readonly string[] | null;
}

export interface VpdTargetBand {
  minKpa: number;
  maxKpa: number;
}

export interface BuildEnvironmentRibbonInput {
  readings: readonly EnvironmentRibbonReadingLike[] | null | undefined;
  /** "Now" — injected. Epoch ms, ISO string, or Date. */
  now: number | string | Date;
  windowHours?: number;
  bucketMinutes?: number;
  targetVpd?: VpdTargetBand | null;
}

export interface RibbonBucket {
  index: number;
  startMs: number;
  endMs: number;
  tempC: number | null;
  rhPct: number | null;
  /** Null whenever the bucket is invalid, empty, or inputs fail range checks. */
  vpdKpa: number | null;
  source: RibbonSource;
  readingCount: number;
}

/** A maximal run of consecutive buckets sharing one source. */
export interface ProvenanceRun {
  source: RibbonSource;
  startIndex: number;
  /** Inclusive. */
  endIndex: number;
}

export type VpdBandStatus = "unknown" | "low" | "in_band" | "high";

export interface RibbonLatest {
  bucketIndex: number;
  tempC: number | null;
  rhPct: number | null;
  vpdKpa: number | null;
  source: SensorSource;
  vpdBandStatus: VpdBandStatus;
}

export interface EnvironmentRibbonViewModel {
  windowStartMs: number;
  windowEndMs: number;
  bucketMinutes: number;
  buckets: RibbonBucket[];
  runs: ProvenanceRun[];
  /** Newest bucket that holds a reading, or null when the window is empty. */
  latest: RibbonLatest | null;
  counts: Record<RibbonSource, number>;
  hasAnyReading: boolean;
  /** True when at least one bucket contributes a VPD point. */
  hasAnyVpd: boolean;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function toEpochMs(value: number | string | Date | null | undefined): number | null {
  if (value == null) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

function readingTimeMs(r: EnvironmentRibbonReadingLike): number | null {
  return toEpochMs(r.capturedAt) ?? toEpochMs(r.ts);
}

function metricObserved(r: EnvironmentRibbonReadingLike, key: "temp" | "rh"): boolean {
  if (r.observedMetrics == null) return true; // legacy fixtures: treat as complete
  return r.observedMetrics.includes(key);
}

/**
 * Classify one reading into a canonical source, fail-closed.
 * Exported for tests; not for UI use.
 */
export function classifyRibbonReadingSource(r: EnvironmentRibbonReadingLike): SensorSource {
  const base = normalizeSensorSource(r.source);
  const status = typeof r.status === "string" ? r.status.trim().toLowerCase() : "";
  if (base === "invalid") return "invalid";
  if (status === "usable") return base;
  if (status === "stale") return base === "demo" ? "demo" : "stale";
  // needs_review, no_data, missing, or anything unrecognized: never healthy.
  return "invalid";
}

function pinnedRh(rh: number): boolean {
  return rh <= 0 || rh >= 100;
}

function bandStatus(vpd: number | null, band: VpdTargetBand | null | undefined): VpdBandStatus {
  if (!isFiniteNumber(vpd)) return "unknown";
  if (!band || !isFiniteNumber(band.minKpa) || !isFiniteNumber(band.maxKpa)) return "unknown";
  if (band.minKpa > band.maxKpa) return "unknown";
  if (vpd < band.minKpa) return "low";
  if (vpd > band.maxKpa) return "high";
  return "in_band";
}

function emptyCounts(): Record<RibbonSource, number> {
  return { live: 0, manual: 0, csv: 0, demo: 0, stale: 0, invalid: 0, none: 0 };
}

interface Placed {
  ms: number;
  order: number;
  reading: EnvironmentRibbonReadingLike;
}

/**
 * Build the ribbon. Never throws on bad input: malformed readings are dropped,
 * a malformed `now` yields an empty window anchored at epoch 0.
 */
export function buildEnvironmentRibbonViewModel(
  input: BuildEnvironmentRibbonInput,
): EnvironmentRibbonViewModel {
  const nowMs = toEpochMs(input?.now) ?? 0;
  const windowHours =
    isFiniteNumber(input?.windowHours) && input.windowHours > 0
      ? input.windowHours
      : DEFAULT_RIBBON_WINDOW_HOURS;
  const bucketMinutes =
    isFiniteNumber(input?.bucketMinutes) && input.bucketMinutes > 0
      ? input.bucketMinutes
      : DEFAULT_RIBBON_BUCKET_MINUTES;

  const bucketMs = bucketMinutes * 60_000;
  const windowMs = windowHours * 3_600_000;
  const bucketCount = Math.max(1, Math.ceil(windowMs / bucketMs));
  const windowEndMs = nowMs;
  const windowStartMs = windowEndMs - bucketCount * bucketMs;

  // Stable order: by time, then by original index. No randomness.
  const placed: Placed[] = [];
  const source = Array.isArray(input?.readings) ? input.readings : [];
  source.forEach((reading, order) => {
    if (!reading || typeof reading !== "object") return;
    const ms = readingTimeMs(reading);
    if (ms == null) return;
    if (ms < windowStartMs || ms > windowEndMs) return;
    placed.push({ ms, order, reading });
  });
  placed.sort((a, b) => a.ms - b.ms || a.order - b.order);

  // Buckets are (start, end]: the reading captured exactly at `now` owns the
  // newest bucket. A reading exactly at the window start is kept in bucket 0.
  // Latest reading per bucket wins for values; ties resolved by input order.
  const perBucket = new Map<number, Placed[]>();
  for (const p of placed) {
    let idx = Math.ceil((p.ms - windowStartMs) / bucketMs) - 1;
    if (idx < 0) idx = 0;
    if (idx >= bucketCount) idx = bucketCount - 1;
    const list = perBucket.get(idx);
    if (list) list.push(p);
    else perBucket.set(idx, [p]);
  }

  const buckets: RibbonBucket[] = [];
  const counts = emptyCounts();
  let hasAnyVpd = false;

  for (let i = 0; i < bucketCount; i++) {
    const startMs = windowStartMs + i * bucketMs;
    const endMs = startMs + bucketMs;
    const list = perBucket.get(i);
    if (!list || list.length === 0) {
      buckets.push({
        index: i,
        startMs,
        endMs,
        tempC: null,
        rhPct: null,
        vpdKpa: null,
        source: "none",
        readingCount: 0,
      });
      counts.none += 1;
      continue;
    }

    const chosen = list[list.length - 1].reading;
    let src = classifyRibbonReadingSource(chosen);
    const tempC =
      metricObserved(chosen, "temp") && isFiniteNumber(chosen.temp) ? chosen.temp : null;
    const rhPct = metricObserved(chosen, "rh") && isFiniteNumber(chosen.rh) ? chosen.rh : null;

    if (rhPct != null && pinnedRh(rhPct)) src = "invalid";

    let vpdKpa: number | null = null;
    if (src !== "invalid" && tempC != null && rhPct != null) {
      vpdKpa = calculateVpdKpa({ tempC, rhPercent: rhPct });
      if (vpdKpa == null) src = "invalid"; // out of realistic range
    }
    if (src === "invalid") vpdKpa = null;

    if (vpdKpa != null) hasAnyVpd = true;
    counts[src] += 1;
    buckets.push({
      index: i,
      startMs,
      endMs,
      tempC: src === "invalid" ? null : tempC,
      rhPct: src === "invalid" ? null : rhPct,
      vpdKpa,
      source: src,
      readingCount: list.length,
    });
  }

  const runs: ProvenanceRun[] = [];
  for (const b of buckets) {
    const last = runs[runs.length - 1];
    if (last && last.source === b.source) last.endIndex = b.index;
    else runs.push({ source: b.source, startIndex: b.index, endIndex: b.index });
  }

  let latest: RibbonLatest | null = null;
  for (let i = buckets.length - 1; i >= 0; i--) {
    const b = buckets[i];
    if (b.source === "none") continue;
    latest = {
      bucketIndex: b.index,
      tempC: b.tempC,
      rhPct: b.rhPct,
      vpdKpa: b.vpdKpa,
      source: b.source,
      vpdBandStatus: bandStatus(b.vpdKpa, input?.targetVpd),
    };
    break;
  }

  return {
    windowStartMs,
    windowEndMs,
    bucketMinutes,
    buckets,
    runs,
    latest,
    counts,
    hasAnyReading: latest != null,
    hasAnyVpd,
  };
}

/** Plain-language reason a source label is shown. Presentation copy only. */
export const RIBBON_SOURCE_EXPLANATION: Record<RibbonSource, string> = {
  live: "bridge packet within the freshness window",
  manual: "entered by hand",
  csv: "imported from a file",
  demo: "demo fixture — not a real reading",
  stale: "outside the freshness window; last known value shown, not treated as current",
  invalid: "failed validation or out of realistic range; excluded from VPD",
  none: "no reading in this interval",
};

/** Human label for the band status. Presentation copy only. */
export const VPD_BAND_STATUS_LABEL: Record<VpdBandStatus, string> = {
  unknown: "no target or no valid VPD",
  low: "below target",
  in_band: "in band",
  high: "above target",
};

/** Format a bucket start as HH:MM in the supplied UTC offset (minutes). */
export function formatBucketClock(startMs: number, utcOffsetMinutes = 0): string {
  const shifted = new Date(startMs + utcOffsetMinutes * 60_000);
  const hh = String(shifted.getUTCHours()).padStart(2, "0");
  const mm = String(shifted.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Adapt a grow-target range (either bound may be null) into a ribbon band.
 * Returns null unless both bounds are finite and ordered — a half-open target
 * cannot classify "in band" honestly.
 */
export function vpdTargetBandFromRange(
  range: { min: number | null | undefined; max: number | null | undefined } | null | undefined,
): VpdTargetBand | null {
  if (!range) return null;
  const { min, max } = range;
  if (!isFiniteNumber(min) || !isFiniteNumber(max)) return null;
  if (min > max) return null;
  return { minKpa: min, maxKpa: max };
}
