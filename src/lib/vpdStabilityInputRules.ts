/**
 * VPD stability inputs shared by Sensors, Tent detail, and the Dashboard strip.
 *
 * Sensors already folds Quick Log manuals into the series it grades. These
 * helpers let the other pages grade the same observed VPD values. Stored rows
 * stay; a manual at the same instant replaces them, matching
 * mergeSensorsSeriesWithQuickLogManuals. Derived-only estimates are not
 * invented here.
 *
 * Sensor truth: a VPD that fails realism, or whose observed temperature or RH
 * at the same capture fails realism, is not admitted (the same rules as
 * buildTentSensorChartSeries and classifySnapshotTruth). Temperature or RH
 * that was simply not observed does not drop VPD.
 *
 * The `stale` flag marks stale lineage only (a `stale` source, or a persisted
 * stale floor). Capture-time freshness is a current-header concern: an older
 * valid reading stays usable for the 24-hour and 7-day stability windows.
 */
import type { StabilityReadingInput } from "@/lib/environmentStabilityRules";
import {
  classifySensorReadingTrust,
  readObservedSensorMetric,
} from "@/lib/sensorReadingSelectionRules";
import { isStale } from "@/lib/sensorSnapshot";
import { classifyManualMetric } from "@/lib/sensorTruthRules";
import type { SensorReading } from "@/mock";

/** Epoch milliseconds for a stability timestamp, or null when unparseable. */
function observationMs(ts: StabilityReadingInput["ts"] | null | undefined): number | null {
  if (ts instanceof Date) {
    const ms = ts.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof ts === "number") return Number.isFinite(ts) ? ts : null;
  if (typeof ts === "string" && ts.trim()) {
    const ms = Date.parse(ts);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

/** Newest first by instant; unparseable timestamps last; ties by spelling. */
function compareNewestFirst(a: StabilityReadingInput, b: StabilityReadingInput): number {
  const aMs = observationMs(a.ts);
  const bMs = observationMs(b.ts);
  if (aMs !== null && bMs !== null && aMs !== bMs) return bMs - aMs;
  if (aMs === null && bMs !== null) return 1;
  if (aMs !== null && bMs === null) return -1;
  return String(a.ts).localeCompare(String(b.ts));
}

/** One identity per capture instant, whatever the timestamp spelling. */
function observationKey(ts: StabilityReadingInput["ts"]): string {
  const ms = observationMs(ts);
  return ms !== null ? `ms:${ms}` : `raw:${String(ts)}`;
}

function siblingMetricInvalid(
  reading: SensorReading,
  metric: "temp" | "rh",
  truthMetric: "temperature_c" | "humidity_pct",
): boolean {
  const value = readObservedSensorMetric(reading, metric);
  return value !== null && !classifyManualMetric(truthMetric, value).valid;
}

/** Stale lineage only; time-derived staleness does not count here. */
function hasStaleLineage(reading: SensorReading): boolean {
  if (reading.source === "stale") return true;
  return reading.freshness?.floor === "stale";
}

export function vpdStabilityInputsFromWideReadings(
  readings: readonly SensorReading[] | null | undefined,
): StabilityReadingInput[] {
  const out: StabilityReadingInput[] = [];
  for (const reading of readings ?? []) {
    if (!reading) continue;
    const vpd = readObservedSensorMetric(reading, "vpd");
    if (vpd === null) continue;
    if (!classifyManualMetric("vpd_kpa", vpd).valid) continue;
    if (siblingMetricInvalid(reading, "temp", "temperature_c")) continue;
    if (siblingMetricInvalid(reading, "rh", "humidity_pct")) continue;
    if (classifySensorReadingTrust(reading).isInvalid) continue;
    out.push({
      ts: reading.capturedAt ?? reading.ts,
      vpd,
      source: typeof reading.source === "string" ? reading.source : null,
      stale: hasStaleLineage(reading),
    });
  }
  out.sort(compareNewestFirst);
  return out;
}

/** Stored VPD first. A manual reading at the same instant wins. */
export function mergeVpdStabilityInputs(
  stored: readonly StabilityReadingInput[] | null | undefined,
  manuals: readonly StabilityReadingInput[] | null | undefined,
): StabilityReadingInput[] {
  const byInstant = new Map<string, StabilityReadingInput>();
  for (const row of stored ?? []) {
    if (!row) continue;
    const key = observationKey(row.ts);
    if (!byInstant.has(key)) byInstant.set(key, row);
  }
  for (const row of manuals ?? []) {
    if (!row) continue;
    byInstant.set(observationKey(row.ts), row);
  }
  return Array.from(byInstant.values()).sort(compareNewestFirst);
}

/**
 * Stored and Quick Log manual stability inputs, built independently and then
 * merged (a manual at the same instant wins). A manual observation never
 * inherits a colliding stored row's freshness floor or sibling metrics, so a
 * valid manual VPD is not marked stale or rejected by stored-row metadata.
 */
export function buildSharedVpdStabilityInputs(
  stored: readonly SensorReading[] | null | undefined,
  manuals: readonly SensorReading[] | null | undefined,
): StabilityReadingInput[] {
  return mergeVpdStabilityInputs(
    vpdStabilityInputsFromWideReadings(stored),
    vpdStabilityInputsFromWideReadings(manuals),
  );
}

/** Quick Log manual readings for one tent, from a multi-tent read. */
export function quickLogManualsForTent(
  manuals: readonly SensorReading[] | null | undefined,
  tentId: string,
): SensorReading[] {
  return (manuals ?? []).filter((reading) => reading?.tentId === tentId);
}

export interface DisplayedVpdObservation {
  value: number | null;
  capturedAt: string | null;
  source: string | null;
  /**
   * True when the reading must not be presented as current: aged past its
   * source window against `nowMs`, or (for a fallback) carrying persisted
   * stale lineage from the stability series `stale` flag.
   */
  stale: boolean;
}

function finiteDisplayedVpd(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function observationTimestamp(ts: StabilityReadingInput["ts"] | null | undefined): string | null {
  if (typeof ts === "string") {
    const trimmed = ts.trim();
    if (!trimmed || !Number.isFinite(new Date(trimmed).getTime())) return null;
    return trimmed;
  }
  if (typeof ts === "number" && Number.isFinite(ts)) return new Date(ts).toISOString();
  if (ts instanceof Date && Number.isFinite(ts.getTime())) return ts.toISOString();
  return null;
}

/** Fallback sources that may stand in for a current header reading. */
const CURRENT_FALLBACK_SOURCES: ReadonlySet<string> = new Set(["live", "manual"]);

function isStrictlyNewer(candidate: string | null, reference: string | null): boolean {
  if (candidate === null || reference === null) return false;
  return new Date(candidate).getTime() > new Date(reference).getTime();
}

/**
 * Header VPD keeps the stored snapshot when that snapshot observed VPD.
 * Otherwise it uses the newest shared series point, with that point's own
 * timestamp and source. Freshness is aged against `nowMs`, and a fallback's
 * persisted stale lineage (`fallback.stale`) always keeps it stale, as does a
 * source other than live or manual (CSV and other history). A series point
 * can stay eligible for historical stability and still be too old to guide
 * the current header.
 *
 * When the stored snapshot observed a VPD that sensor truth rejected
 * (`snapshotVpdRejected`), only a fallback strictly newer than that snapshot
 * may be shown: an older (or same-instant) point must not stand in for a
 * reading the header deliberately withheld, but a later valid observation
 * (e.g. a Quick Log manual VPD) supersedes the rejected one. If either time
 * is unknown, nothing is shown.
 */
export function resolveDisplayedVpdObservation(args: {
  snapshotVpd: number | null | undefined;
  snapshotVpdRejected?: boolean;
  snapshotCapturedAt: string | null;
  snapshotSource: string | null;
  snapshotStale: boolean;
  fallback: StabilityReadingInput | null | undefined;
  nowMs: number;
}): DisplayedVpdObservation {
  const snapshotValue = finiteDisplayedVpd(args.snapshotVpd);
  if (snapshotValue !== null) {
    return {
      value: snapshotValue,
      capturedAt: args.snapshotCapturedAt,
      source: args.snapshotSource,
      stale: args.snapshotStale,
    };
  }
  const fallbackValue = finiteDisplayedVpd(args.fallback?.vpd);
  if (fallbackValue === null || !args.fallback) {
    return { value: null, capturedAt: null, source: null, stale: false };
  }
  const capturedAt = observationTimestamp(args.fallback.ts);
  if (
    args.snapshotVpdRejected === true &&
    !isStrictlyNewer(capturedAt, observationTimestamp(args.snapshotCapturedAt))
  ) {
    return { value: null, capturedAt: null, source: null, stale: false };
  }
  const source = typeof args.fallback.source === "string" ? args.fallback.source : null;
  return {
    value: fallbackValue,
    capturedAt,
    source,
    // Only live and manual observations may read as a current reading. CSV
    // imports and any other historical source stay usable for stability
    // history but are never a healthy current-state cue.
    stale:
      capturedAt === null ||
      args.fallback.stale === true ||
      !CURRENT_FALLBACK_SOURCES.has((source ?? "").trim().toLowerCase()) ||
      isStale(capturedAt, args.nowMs, undefined, source),
  };
}

/** Read state of the Quick Log manual-history query that feeds VPD stability. */
export type ManualHistoryReadState = "ready" | "pending" | "paused" | "unavailable";

/**
 * Pending and failed reads are disclosed, never folded into "no manual
 * history". A failed read wins over a pending one so a retry is offered.
 */
export function resolveManualHistoryReadState(query: {
  isPending?: boolean | null;
  isError?: boolean | null;
  fetchStatus?: string | null;
}): ManualHistoryReadState {
  if (query.isError === true) return "unavailable";
  if (query.isPending === true) return query.fetchStatus === "paused" ? "paused" : "pending";
  return "ready";
}

/** Disclosure copy shared by Tent detail and the Dashboard strip. */
export const QUICK_LOG_MANUAL_HISTORY_COPY = {
  pending: "Checking Quick Log manual history… VPD stability uses stored readings until it loads.",
  paused:
    "Waiting for connection to check Quick Log manual history. VPD stability uses stored readings for now.",
  unavailable:
    "Quick Log manual history couldn't be checked. VPD stability uses the stored readings that loaded.",
  retry: "Retry",
  ariaPending: "Quick Log manual history loading",
  ariaUnavailable: "Quick Log manual history unavailable",
} as const;
