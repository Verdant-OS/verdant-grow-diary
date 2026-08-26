/**
 * Browser-only calculator math shared by the Grow Help Toolkit.
 *
 * These helpers are deliberately pure: no storage, network, DOM, telemetry,
 * timestamps, or inferred garden data. Callers must provide every value.
 */

export const L_PER_GAL = 3.785411784;
export const ML_PER_TSP = 4.92892;
export const M2_PER_FT2 = 0.09290304;
export const G_PER_OZ = 28.3495;
export const G_PER_LB = 453.59237;

export type PpmScale = 500 | 640 | 700;

export class CalculatorInputError extends RangeError {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "CalculatorInputError";
    this.field = field;
  }
}

export function requireFinite(field: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new CalculatorInputError(field, "must be a finite number");
  }
  return value;
}

export function requirePositive(field: string, value: number): number {
  requireFinite(field, value);
  if (value <= 0) throw new CalculatorInputError(field, "must be greater than 0");
  return value;
}

export function requireNonNegative(field: string, value: number): number {
  requireFinite(field, value);
  if (value < 0) throw new CalculatorInputError(field, "must be 0 or greater");
  return value;
}

export function requireHours(field: string, value: number): number {
  requirePositive(field, value);
  if (value > 24) throw new CalculatorInputError(field, "must be 24 or less");
  return value;
}

/** Derived 500-scale ppm. EC remains the direct nutrient-strength value. */
export function ppm500(ecMsCm: number): number {
  return requireNonNegative("EC", ecMsCm) * 500;
}

/** Derived 700-scale ppm. EC remains the direct nutrient-strength value. */
export function ppm700(ecMsCm: number): number {
  return requireNonNegative("EC", ecMsCm) * 700;
}

/** Optional derived 640-scale ppm, always labeled with its scale in the UI. */
export function ppm640(ecMsCm: number): number {
  return requireNonNegative("EC", ecMsCm) * 640;
}

/** Convert a scale-dependent ppm display back to EC in mS/cm. */
export function ecFromPpm(ppm: number, scale: PpmScale): number {
  requireNonNegative("PPM", ppm);
  if (scale !== 500 && scale !== 640 && scale !== 700) {
    throw new CalculatorInputError("PPM scale", "must be 500, 640, or 700");
  }
  return ppm / scale;
}

/** Short alias matching the displayed formula: EC = ppm / scale. */
export const ec = ecFromPpm;

export function cfFromEc(ecMsCm: number): number {
  return requireNonNegative("EC", ecMsCm) * 10;
}

/** Short alias matching the displayed formula: CF = EC × 10. */
export const cf = cfFromEc;

export function dli(ppfd: number, hours: number): number {
  requireNonNegative("PPFD", ppfd);
  requireHours("Photoperiod", hours);
  return (ppfd * hours * 3600) / 1_000_000;
}

export function kwh(watts: number, hours: number, days: number): number {
  requireNonNegative("Watts", watts);
  requireHours("Hours per day", hours);
  requireNonNegative("Days", days);
  // Multiply the whole-number factors before dividing so canonical cases such
  // as 300 W × 18 h × 30 d produce exactly 162 in IEEE-754 arithmetic.
  return (watts * hours * days) / 1000;
}

export function cost(energyKwh: number, ratePerKwh: number): number {
  requireNonNegative("kWh", energyKwh);
  requireNonNegative("Electricity rate", ratePerKwh);
  return energyKwh * ratePerKwh;
}

export function areaM2FromFeet(lengthFt: number, widthFt: number): number {
  return (
    requirePositive("Canopy length", lengthFt) *
    requirePositive("Canopy width", widthFt) *
    M2_PER_FT2
  );
}

export function areaM2(lengthM: number, widthM: number): number {
  return requirePositive("Canopy length", lengthM) * requirePositive("Canopy width", widthM);
}

export function areaFt2FromMeters(lengthM: number, widthM: number): number {
  return areaM2(lengthM, widthM) / M2_PER_FT2;
}

export function ppfEstimated(watts: number, micromolesPerJoule: number): number {
  return (
    requirePositive("Actual fixture watts", watts) * requirePositive("Efficacy", micromolesPerJoule)
  );
}

export function gallonsToLiters(gallons: number): number {
  return requirePositive("Reservoir gallons", gallons) * L_PER_GAL;
}

export function litersToGallons(liters: number): number {
  return requirePositive("Reservoir liters", liters) / L_PER_GAL;
}
