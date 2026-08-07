/**
 * CSV validation ranges — single source of truth for thresholds used by the
 * CSV preview row-validation helpers. UI files MUST NOT duplicate these
 * tables; import from here.
 *
 * Pure constants. No I/O, no Supabase, no React.
 *
 * EC / presentation pH tiers are owned by `@/constants/sensorTruthRanges`
 * (#592 residual). This module re-exports the soft entry windows used by
 * CSV import so preview + row validation never drift from the canon.
 */

import {
  EC_MSCM_SUSPICIOUS_MAX,
  PH_CULTIVATION_SOFT,
  RH_PCT_RANGE,
  RH_STUCK_VALUES,
  type RangeMinMax,
} from "@/constants/sensorTruthRanges";

export type { RangeMinMax };

export const HUMIDITY_RANGE: RangeMinMax = RH_PCT_RANGE;
export const HUMIDITY_STUCK_VALUES: ReadonlyArray<number> = RH_STUCK_VALUES;

/**
 * Soft cultivation pH for CSV warnings (not presentation nulling).
 * Presentation uses PH_PRESENTATION_REALISTIC (3–9) in sensorTruthRanges.
 */
export const PH_REALISTIC_RANGE: RangeMinMax = PH_CULTIVATION_SOFT;

/**
 * Raw EC magnitudes above this threshold, when the user selected mS/cm,
 * are likely µS/cm. Treated as warning, never invalid.
 * Same as EC_MSCM_SUSPICIOUS_MAX (soft tier; presentation floor is 20).
 */
export const EC_SUSPICIOUS_MSCM_MAX = EC_MSCM_SUSPICIOUS_MAX;

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
