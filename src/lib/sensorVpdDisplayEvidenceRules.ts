import type { SensorReading } from "@/mock";
import {
  classifySensorReadingTrust,
  readObservedSensorMetric,
  selectLatestTrustedVpdInputs,
  type LatestTrustedVpdInputs,
} from "@/lib/sensorReadingSelectionRules";

function sameEvidence(left: LatestTrustedVpdInputs, right: LatestTrustedVpdInputs): boolean {
  return (
    left.temperatureC === right.temperatureC &&
    left.humidityPct === right.humidityPct &&
    left.reading.tentId === right.reading.tentId &&
    left.reading.capturedAt === right.reading.capturedAt &&
    left.reading.ts === right.reading.ts &&
    left.reading.source === right.reading.source &&
    left.reading.status === right.reading.status
  );
}

/**
 * Keep an estimate already shown during this visit when its unchanged inputs
 * age. Its reading carries the current stale status, so it cannot supply
 * healthy stage guidance. A fresh visit still refuses to derive from stale
 * inputs; invalidation, correction, removal or scope changes discard the cache.
 */
export function selectSensorVpdDisplayEvidence(
  readings: readonly SensorReading[] | null | undefined,
  previous: LatestTrustedVpdInputs | null,
): LatestTrustedVpdInputs | null {
  const current = selectLatestTrustedVpdInputs(readings);
  if (current) {
    return previous && sameEvidence(current, previous) ? previous : current;
  }
  if (!previous) return null;

  const retained = readings?.find((reading) => {
    const trust = classifySensorReadingTrust(reading);
    return (
      trust.isStale &&
      !trust.isInvalid &&
      reading.tentId === previous.reading.tentId &&
      reading.capturedAt === previous.reading.capturedAt &&
      reading.source === previous.reading.source &&
      readObservedSensorMetric(reading, "temp") === previous.temperatureC &&
      readObservedSensorMetric(reading, "rh") === previous.humidityPct
    );
  });
  if (!retained) return null;
  const next = { ...previous, reading: retained };
  return sameEvidence(next, previous) ? previous : next;
}
