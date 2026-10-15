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
