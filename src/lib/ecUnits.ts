/**
 * EC/PPM unit conversion helpers.
 *
 * Pure & deterministic. No I/O. No React.
 *
 * The grower picks the unit they entered (mS/cm, µS/cm, PPM-500, PPM-700).
 * Conversion to canonical mS/cm is well-defined for all four:
 *   - µS/cm   → mS/cm  : divide by 1000
 *   - PPM-500 → mS/cm  : divide by 500
 *   - PPM-700 → mS/cm  : divide by 700
 *
 * The PPM↔EC factor is conventional, not exact. Callers must keep the
 * original value + unit in note text so the conversion basis is visible.
 */
import { type EcUnit } from "@/constants/units";

export function toCanonicalMscm(
  value: number | null | undefined,
  unit: EcUnit,
): number | null {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value)) return null;
  switch (unit) {
    case "mS/cm":
      return value;
    case "µS/cm":
      return value / 1000;
    case "PPM-500":
      return value / 500;
    case "PPM-700":
      return value / 700;
    default:
      return null;
  }
}

/**
 * Maximum plausible value (per unit) for a hydroponic/soil grow
 * reservoir or runoff sample. Used by plausibility validation; values
 * above are flagged, not silently accepted.
 */
export const EC_PLAUSIBLE_MAX: Record<EcUnit, number> = {
  "mS/cm": 5,
  "µS/cm": 5_000,
  "PPM-500": 2_500,
  "PPM-700": 3_500,
};
