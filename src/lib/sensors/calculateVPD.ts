/**
 * calculateVPD — pure, deterministic vapor pressure deficit calculator.
 *
 * Hard rules:
 *  - No I/O, no React, no Supabase. Pure function.
 *  - Never invents values. Null inputs → null output.
 *  - Humidity must be a finite number in [0, 100]. Otherwise → null.
 *  - Temperature must be a finite number. Otherwise → null.
 *  - Uses Tetens saturation vapor pressure formula:
 *      es(T) = 0.6108 * exp(17.27 * T / (T + 237.3))  [kPa]
 *      vpd   = es * (1 - RH/100)
 *  - Returns kPa rounded to 2 decimals.
 */
export function calculateVPD(
  tempC: number | null | undefined,
  rhPct: number | null | undefined,
): number | null {
  if (typeof tempC !== "number" || !Number.isFinite(tempC)) return null;
  if (typeof rhPct !== "number" || !Number.isFinite(rhPct)) return null;
  if (rhPct < 0 || rhPct > 100) return null;
  const es = 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
  const vpd = es * (1 - rhPct / 100);
  if (!Number.isFinite(vpd)) return null;
  return Math.round(vpd * 100) / 100;
}
