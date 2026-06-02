/**
 * CSV validation ranges — single source of truth for thresholds used by the
 * CSV preview row-validation helpers. UI files MUST NOT duplicate these
 * tables; import from here.
 *
 * Pure constants. No I/O, no Supabase, no React.
 */

export interface RangeMinMax {
  readonly min: number;
  readonly max: number;
}

export const HUMIDITY_RANGE: RangeMinMax = { min: 0, max: 100 };
export const HUMIDITY_STUCK_VALUES: ReadonlyArray<number> = [0, 100];

/**
 * Realistic cultivation pH window. Outside this range we warn (not invalid)
 * because a CSV could still represent a legitimate edge case.
 */
export const PH_REALISTIC_RANGE: RangeMinMax = { min: 4.5, max: 8.5 };

/**
 * Raw EC magnitudes above this threshold, when the user selected mS/cm,
 * are likely µS/cm. Treated as warning, never invalid.
 */
export const EC_SUSPICIOUS_MSCM_MAX = 50;

export const AIR_TEMP_C_RANGE: RangeMinMax = { min: -10, max: 50 };
export const SUBSTRATE_TEMP_C_RANGE: RangeMinMax = { min: -10, max: 50 };
export const VWC_RANGE: RangeMinMax = { min: 0, max: 100 };

export const CSV_VALIDATION_RANGES = {
  humidity: HUMIDITY_RANGE,
  humidityStuck: HUMIDITY_STUCK_VALUES,
  ph: PH_REALISTIC_RANGE,
  ecSuspiciousMscmMax: EC_SUSPICIOUS_MSCM_MAX,
  airTempC: AIR_TEMP_C_RANGE,
  substrateTempC: SUBSTRATE_TEMP_C_RANGE,
  vwc: VWC_RANGE,
} as const;
