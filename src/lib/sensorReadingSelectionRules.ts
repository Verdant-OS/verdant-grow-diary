import type { SensorReading, SensorReadingMetricKey } from "@/mock";
import { isUsableGrowSensorReading } from "@/lib/growSensorEvidenceRules";

function timestampMs(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function deterministicTieKey(reading: SensorReading): string {
  return [
    reading.tentId,
    reading.capturedAt,
    reading.source,
    reading.status,
    reading.temp,
    reading.rh,
    reading.vpd,
    reading.co2,
    reading.soil,
    reading.ppfd ?? "",
  ].join("|");
}

/**
 * Return a defensive newest-first copy of grower-facing sensor snapshots.
 *
 * The repository already requests newest-first rows, but presenter code must
 * not depend on input position for the word "latest". Invalid timestamps sort
 * last and equal timestamps use captured time plus a stable content key.
 */
export function sortSensorReadingsNewestFirst(
  readings: readonly SensorReading[] | null | undefined,
): SensorReading[] {
  if (!Array.isArray(readings) || readings.length === 0) return [];

  return [...readings].sort((left, right) => {
    const leftTimestamp = timestampMs(left.ts);
    const rightTimestamp = timestampMs(right.ts);
    if (leftTimestamp !== rightTimestamp) return rightTimestamp > leftTimestamp ? 1 : -1;

    const leftCapturedAt = timestampMs(left.capturedAt);
    const rightCapturedAt = timestampMs(right.capturedAt);
    if (leftCapturedAt !== rightCapturedAt) return rightCapturedAt > leftCapturedAt ? 1 : -1;

    return deterministicTieKey(left).localeCompare(deterministicTieKey(right));
  });
}

export function selectLatestSensorReading(
  readings: readonly SensorReading[] | null | undefined,
): SensorReading | null {
  return sortSensorReadingsNewestFirst(readings)[0] ?? null;
}

export function selectRecentSensorReadings(
  readings: readonly SensorReading[] | null | undefined,
  limit: number,
): SensorReading[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return sortSensorReadingsNewestFirst(readings).slice(0, Math.floor(limit));
}

/**
 * Older explicit snapshot fixtures predate `observedMetrics` and are treated
 * as complete. DB-adapted snapshots always provide the array, including an
 * empty array when no recognized finite metric was present.
 */
export function hasObservedSensorMetric(
  reading: SensorReading,
  metric: SensorReadingMetricKey,
): boolean {
  return !Array.isArray(reading.observedMetrics) || reading.observedMetrics.includes(metric);
}

export function readObservedSensorMetric(
  reading: SensorReading | null | undefined,
  metric: SensorReadingMetricKey,
): number | null {
  if (!reading || !hasObservedSensorMetric(reading, metric)) return null;
  const value = reading[metric];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export interface SensorReadingTrustFlags {
  isUsable: boolean;
  isStale: boolean;
  isInvalid: boolean;
}

/**
 * Translate the canonical snapshot contract into presenter flags. A stored
 * row is never healthy merely because it contains a number: stale lineage is
 * cautionary, while invalid/review/no-data rows fail closed as invalid.
 */
export function classifySensorReadingTrust(
  reading: SensorReading | null | undefined,
): SensorReadingTrustFlags {
  if (!reading) return { isUsable: false, isStale: false, isInvalid: false };

  return {
    isUsable: isUsableGrowSensorReading(reading),
    isStale: reading.source === "stale" || reading.status === "stale",
    isInvalid:
      reading.source === "invalid" ||
      reading.status === "invalid" ||
      reading.status === "needs_review" ||
      reading.status === "no_data",
  };
}

export interface TrustedVpdInputs {
  temperatureC: number;
  humidityPct: number;
}

/**
 * VPD may be derived only from a single usable snapshot that actually
 * observed both inputs. Compatibility zeroes, stale rows, invalid rows, and
 * split timestamps never become derived environmental evidence.
 */
export function readTrustedVpdInputs(
  reading: SensorReading | null | undefined,
): TrustedVpdInputs | null {
  if (
    !reading ||
    !classifySensorReadingTrust(reading).isUsable ||
    (reading.source !== "live" && reading.source !== "manual")
  ) {
    return null;
  }
  const temperatureC = readObservedSensorMetric(reading, "temp");
  const humidityPct = readObservedSensorMetric(reading, "rh");
  if (temperatureC === null || humidityPct === null) return null;
  return { temperatureC, humidityPct };
}

export function selectReadingsWithObservedMetric(
  readings: readonly SensorReading[] | null | undefined,
  metric: SensorReadingMetricKey,
): SensorReading[] {
  return sortSensorReadingsNewestFirst(readings).filter((reading) =>
    hasObservedSensorMetric(reading, metric),
  );
}

export function selectRecentObservedSensorValues(
  readings: readonly SensorReading[] | null | undefined,
  metric: SensorReadingMetricKey,
  limit: number,
): number[] {
  if (!Number.isFinite(limit) || limit <= 0) return [];
  return selectReadingsWithObservedMetric(readings, metric)
    .map((reading) => readObservedSensorMetric(reading, metric))
    .filter((value): value is number => value !== null)
    .slice(0, Math.floor(limit));
}
