/**
 * calculateVPD — pure, deterministic vapor pressure deficit calculator.
 *
 * Hard rules:
 *  - No I/O, no React, no Supabase. Pure function.
 *  - Never invents values. Null inputs → null output.
 *  - Humidity must be a finite number in [0, 100]. Otherwise → null.
 *  - Temperature must be a finite number in [-40, 80] °C. Otherwise → null.
 *  - Ingest does not call this. It uses `VpdFromTempRh.withoutTempRange`
 *    so a stored reading outside that band keeps the previous result.
 *  - Uses Tetens saturation vapor pressure formula:
 *      es(T) = 0.6108 * exp(17.27 * T / (T + 237.3))  [kPa]
 *      vpd   = es * (1 - RH/100)
 *  - Returns kPa rounded to 2 decimals.
 */
import { VpdFromTempRh } from "@/lib/vpdCalculationRules";
export function calculateVPD(
  tempC: number | null | undefined,
  rhPct: number | null | undefined,
): number | null {
  return VpdFromTempRh.kpa(tempC, rhPct);
}
