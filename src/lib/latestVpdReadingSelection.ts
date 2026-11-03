import type { SensorReading } from "@/mock";
import { calculateVPD } from "@/lib/sensors/calculateVPD";
import {
  hasObservedSensorMetric,
  readObservedSensorMetric,
  sortSensorReadingsNewestFirst,
} from "@/lib/sensorReadingSelectionRules";

export type LatestVpdReadingChoice =
  | { kind: "stored"; vpdKpa: number; capturedAtMs: number }
  | { kind: "derived"; vpdKpa: number; capturedAtMs: number }
  | { kind: "none" };

export interface LatestVpdReadingSelectionInput {
  storedVpdKpa: number | null;
  storedCapturedAtMs: number | null;
  pairTempC: number | null;
  pairRh: number | null;
  pairCapturedAtMs: number | null;
}

/**
 * One rule for the VPD shown as the current reading.
 *
 * A stored VPD is current only while nothing newer observed both temperature
 * and humidity. A newer pair replaces that stored value with the VPD derived
 * from the pair, including when the stored value came from CSV history and
 * the pair is a later manual reading that did not store `vpd_kpa`.
 * The same instant keeps the stored value.
 */
export class LatestVpdReadingSelection {
  static choose(input: LatestVpdReadingSelectionInput): LatestVpdReadingChoice {
    const storedVpd = finiteNumber(input.storedVpdKpa);
    const storedAt = storedVpd === null ? null : finiteMs(input.storedCapturedAtMs);
    const pairAt = finiteMs(input.pairCapturedAtMs);
    const derived = pairAt === null ? null : calculateVPD(input.pairTempC, input.pairRh);
    const pairWins =
      derived !== null && pairAt !== null && (storedAt === null || pairAt > storedAt);
    if (pairWins && derived !== null && pairAt !== null) {
      return { kind: "derived", vpdKpa: derived, capturedAtMs: pairAt };
    }
    if (storedVpd !== null && storedAt !== null) {
      return { kind: "stored", vpdKpa: storedVpd, capturedAtMs: storedAt };
    }
    return { kind: "none" };
  }

  /**
   * Chart series for the sensors VPD card.
   *
   * Recorded VPD rows stay. Temperature and humidity rows that did not store
   * VPD contribute a derived point. With no recorded VPD row the series stays
   * empty, so a value calculated only for the current card does not draw a
   * chart of one invented point.
   */
  static historyForChart(
    recorded: readonly SensorReading[],
    cohort: readonly SensorReading[],
  ): SensorReading[] {
    if (recorded.length === 0) return [];
    const derived: SensorReading[] = [];
    for (const reading of cohort) {
      if (hasObservedSensorMetric(reading, "vpd")) continue;
      const vpd = calculateVPD(
        readObservedSensorMetric(reading, "temp"),
        readObservedSensorMetric(reading, "rh"),
      );
      if (vpd === null) continue;
      derived.push({
        ...reading,
        vpd,
        vpdPointKind: "calculated",
      });
    }
    return sortSensorReadingsNewestFirst([...recorded, ...derived]);
  }
}

function finiteNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteMs(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
