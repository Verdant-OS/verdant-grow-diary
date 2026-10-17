/**
 * VPD stability inputs shared by Sensors, Tent detail, and the Dashboard strip.
 *
 * Sensors already folds Quick Log manuals into the series it grades. These
 * helpers let the other pages grade the same observed VPD values. Stored rows
 * stay; a manual at the same timestamp replaces them, matching
 * mergeSensorsSeriesWithQuickLogManuals. Derived-only estimates are not
 * invented here.
 */
import type { StabilityReadingInput } from "@/lib/environmentStabilityRules";
import {
  classifySensorReadingTrust,
  readObservedSensorMetric,
} from "@/lib/sensorReadingSelectionRules";
import { isStale } from "@/lib/sensorSnapshot";
import type { SensorReading } from "@/mock";

export function vpdStabilityInputsFromWideReadings(
  readings: readonly SensorReading[] | null | undefined,
): StabilityReadingInput[] {
  const out: StabilityReadingInput[] = [];
  for (const reading of readings ?? []) {
    if (!reading) continue;
    const vpd = readObservedSensorMetric(reading, "vpd");
    if (vpd === null) continue;
    const trust = classifySensorReadingTrust(reading);
    if (trust.isInvalid) continue;
    out.push({
      ts: reading.capturedAt ?? reading.ts,
      vpd,
      source: typeof reading.source === "string" ? reading.source : null,
      stale: trust.isStale,
    });
  }
  out.sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  return out;
}

/** Stored VPD first. A manual reading at the same timestamp wins. */
export function mergeVpdStabilityInputs(
  stored: readonly StabilityReadingInput[] | null | undefined,
  manuals: readonly StabilityReadingInput[] | null | undefined,
): StabilityReadingInput[] {
  const byTs = new Map<string, StabilityReadingInput>();
  for (const row of stored ?? []) {
    if (!row) continue;
    const key = String(row.ts);
    if (!byTs.has(key)) byTs.set(key, row);
  }
  for (const row of manuals ?? []) {
    if (!row) continue;
    byTs.set(String(row.ts), row);
  }
  return Array.from(byTs.values()).sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}

export interface DisplayedVpdObservation {
  value: number | null;
  capturedAt: string | null;
  source: string | null;
  /**
   * Current-reading freshness against `nowMs`. This is not the stability
   * series `stale` flag, which only marks stored source/status lineage.
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

/**
 * Header VPD keeps the stored snapshot when that snapshot observed VPD.
 * Otherwise it uses the newest shared series point, with that point's own
 * timestamp and source. Freshness is aged against `nowMs`. A series point
 * can stay eligible for historical stability and still be too old to guide
 * the current header.
 */
export function resolveDisplayedVpdObservation(args: {
  snapshotVpd: number | null | undefined;
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
  const source = typeof args.fallback.source === "string" ? args.fallback.source : null;
  return {
    value: fallbackValue,
    capturedAt,
    source,
    stale: capturedAt === null || isStale(capturedAt, args.nowMs, undefined, source),
  };
}
