import { calculateVPD } from "@/lib/sensors/calculateVPD";

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
}

function finiteNumber(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteMs(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
