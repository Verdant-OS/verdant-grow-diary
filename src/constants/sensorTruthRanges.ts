/**
 * sensorTruthRanges — presentation-side grow-room realism + EC unit-mismatch
 * tiers for Sensor Truth (#592 residual).
 *
 * Pure constants. No I/O. No React. No Supabase.
 *
 * Two EC tiers are intentional (do not collapse without a product decision):
 *   - EC_MSCM_UNIT_MISMATCH_AT (20): presentation/normalizer floor — values
 *     at/above this cannot honestly be mS/cm for soil current-state.
 *   - EC_MSCM_SUSPICIOUS_MAX (50): manual/CSV/intake soft warning when the
 *     grower selected mS/cm but typed a µS/cm-looking magnitude.
 *
 * Presentation bands here are the grower-facing "is this healthy evidence?"
 * table used by `sensorTruthRules.classifySnapshotTruth`. Operator/ingest
 * gates may use wider physical accept bands (documented locally) but must
 * not invent a third pH/temp presentation table.
 *
 * See docs/sensor-truth-rules.md §§4–5, 11.
 */

export interface RangeMinMax {
  readonly min: number;
  readonly max: number;
}

// ---------------------------------------------------------------------------
// EC (mS/cm) — two-tier unit-mismatch model
// ---------------------------------------------------------------------------

/** Plausible soil EC in mS/cm for presentation (outside → invalid). */
export const SOIL_EC_MSCM_PLAUSIBLE: RangeMinMax = { min: 0, max: 8 };

/**
 * Presentation / normalizer unit-mismatch floor (mS/cm).
 * Values ≥ this strongly suggest µS/cm reported as mS/cm.
 */
export const EC_MSCM_UNIT_MISMATCH_AT = 20;

/**
 * Manual / CSV / bridge soft warning (mS/cm selected, magnitude looks like µS).
 * Higher than {@link EC_MSCM_UNIT_MISMATCH_AT} so entry UX is less noisy than
 * the presentation nulling gate.
 */
export const EC_MSCM_SUSPICIOUS_MAX = 50;

/** @deprecated Prefer {@link EC_MSCM_SUSPICIOUS_MAX} — alias for CSV/manual imports. */
export const EC_SUSPICIOUS_MSCM_MAX = EC_MSCM_SUSPICIOUS_MAX;

// ---------------------------------------------------------------------------
// Presentation realism (grow-room current-state)
// ---------------------------------------------------------------------------

/**
 * Indoor grow-room air temperature (°F, display convention).
 * 40°F ≈ 4.4°C; 110°F ≈ 43°C.
 */
export const AIR_TEMP_F_REALISTIC: RangeMinMax = { min: 40, max: 110 };

/** Soil/substrate temperature realism (°F). */
export const SOIL_TEMP_F_REALISTIC: RangeMinMax = { min: 35, max: 100 };

/** Humidity percent physical bounds. */
export const RH_PCT_RANGE: RangeMinMax = { min: 0, max: 100 };

/** Humidity stuck extremes → suspicious (not auto-nulled by presentation). */
export const RH_STUCK_VALUES = [0, 100] as const;

/** VPD plausibility for living-plant rooms (kPa). */
export const VPD_KPA_REALISTIC: RangeMinMax = { min: 0.2, max: 3.0 };

/** Soil volumetric water content (percent). */
export const SOIL_MOISTURE_PCT_RANGE: RangeMinMax = { min: 0, max: 100 };

/** Soil moisture stuck extremes (same as RH). */
export const SOIL_MOISTURE_STUCK_VALUES = [0, 100] as const;

/**
 * Presentation pH for cultivation (chemical 0–14; realistic current-state 3–9).
 * Soft entry/CSV cultivation warning uses {@link PH_CULTIVATION_SOFT}.
 */
export const PH_PRESENTATION_REALISTIC: RangeMinMax = { min: 3.0, max: 9.0 };

/** Soft cultivation pH for manual/CSV warnings (not presentation nulling). */
export const PH_CULTIVATION_SOFT: RangeMinMax = { min: 4.5, max: 8.5 };

/** Chemical pH physical bounds (ingest reject only). */
export const PH_PHYSICAL: RangeMinMax = { min: 0, max: 14 };

/**
 * Future-timestamp skew allowed before a reading is invalid by time
 * (matches live-source operator gate: 5 minutes).
 */
export const SENSOR_TRUTH_FUTURE_SKEW_MS = 5 * 60 * 1000;

/** Barrel of presentation ranges for tests / docs. */
export const SENSOR_TRUTH_PRESENTATION_RANGES = {
  airTempF: AIR_TEMP_F_REALISTIC,
  soilTempF: SOIL_TEMP_F_REALISTIC,
  rhPct: RH_PCT_RANGE,
  rhStuck: RH_STUCK_VALUES,
  vpdKpa: VPD_KPA_REALISTIC,
  soilMoisturePct: SOIL_MOISTURE_PCT_RANGE,
  soilMoistureStuck: SOIL_MOISTURE_STUCK_VALUES,
  soilEcMscm: SOIL_EC_MSCM_PLAUSIBLE,
  ecUnitMismatchAt: EC_MSCM_UNIT_MISMATCH_AT,
  ecSuspiciousMax: EC_MSCM_SUSPICIOUS_MAX,
  phPresentation: PH_PRESENTATION_REALISTIC,
  phCultivationSoft: PH_CULTIVATION_SOFT,
  phPhysical: PH_PHYSICAL,
} as const;
