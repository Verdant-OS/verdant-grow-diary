/**
 * sensorTruthRules — strict, presentation-side truth filter for sensor
 * snapshots. Pure module; no I/O, no Supabase, no React, no timers.
 *
 * Verdant rule (see docs/sensor-truth-rules.md):
 *   "If telemetry is missing, stale, invalid, or unknown-source, the
 *    surface must show that explicitly. The system must not classify a
 *    tent/plant as 'healthy' based on absent or untrusted data."
 *
 * This module never invents, smooths, or back-fills readings. It only
 * classifies the snapshot it is handed and produces a cleaned copy where
 * fields that fail the grow-room realism guards are set to `null` and
 * accompanied by a short reason chip (e.g. "Invalid temp", "Invalid VPD",
 * "Unit mismatch suspected", "Stale reading").
 *
 * Hard constraints:
 *   - No automation. No device control.
 *   - No alert writes. No action_queue writes. No service_role.
 *   - Manual / live / stale / csv / demo / invalid labels stay distinct.
 *     This file does NOT collapse `source`; it only nulls numeric fields
 *     and exposes per-field reasons.
 */

import {
  EMPTY_SNAPSHOT,
  isStale as isSnapshotStale,
  type SensorSnapshot,
} from "@/lib/sensorSnapshot";
import { tempFFromC } from "@/lib/temperatureUnits";

// ---------------------------------------------------------------------------
// Grow-room realism ranges
// ---------------------------------------------------------------------------

/**
 * Realistic indoor grow-room *air* temperature window, expressed in
 * Fahrenheit per Verdant's display convention. Anything outside this
 * window is treated as invalid even if it parses cleanly as a number.
 *
 * 40°F ≈ 4.4°C  (no cultivar survives a tent at that air temp)
 * 110°F ≈ 43°C  (lights-off / runaway condition; never a healthy reading)
 */
export const AIR_TEMP_F_REALISTIC = { min: 40, max: 110 } as const;

/** Soil/substrate temperature realism (Fahrenheit). */
export const SOIL_TEMP_F_REALISTIC = { min: 35, max: 100 } as const;

/** Humidity percent, with stuck-extreme values flagged. */
export const RH_PCT_RANGE = { min: 0, max: 100 } as const;
export const RH_STUCK_VALUES = [0, 100] as const;

/** VPD plausibility for living-plant rooms (kPa). */
export const VPD_KPA_REALISTIC = { min: 0.2, max: 3.0 } as const;

/** Soil volumetric water content (percent). */
export const SOIL_MOISTURE_PCT_RANGE = { min: 0, max: 100 } as const;

/** Soil EC sanity in mS/cm. Values >= this strongly suggest µS/cm. */
export const SOIL_EC_MSCM_UNIT_MISMATCH_AT = 20;
export const SOIL_EC_MSCM_RANGE = { min: 0, max: 8 } as const;

/** pH realism for cultivation (chemical 0-14 but realistic 3-9). */
export const PH_REALISTIC = { min: 3.0, max: 9.0 } as const;

// ---------------------------------------------------------------------------
// Reason chips (UI-safe, short, never echoes user input)
// ---------------------------------------------------------------------------

export type TruthReasonCode =
  | "invalid_temp"
  | "invalid_rh"
  | "invalid_vpd"
  | "vpd_dropped_temp_rh_invalid"
  | "invalid_soil_moisture"
  | "invalid_soil_ec"
  | "invalid_soil_temp"
  | "invalid_ph"
  | "unit_mismatch_suspected"
  | "humidity_stuck_extreme"
  | "stale_reading";

export const TRUTH_REASON_CHIP: Record<TruthReasonCode, string> = {
  invalid_temp: "Invalid temp",
  invalid_rh: "Invalid humidity",
  invalid_vpd: "Invalid VPD",
  vpd_dropped_temp_rh_invalid: "Invalid VPD",
  invalid_soil_moisture: "Invalid soil moisture",
  invalid_soil_ec: "Invalid soil EC",
  invalid_soil_temp: "Invalid soil temp",
  invalid_ph: "Invalid pH",
  unit_mismatch_suspected: "Unit mismatch suspected",
  humidity_stuck_extreme: "Humidity stuck",
  stale_reading: "Stale reading",
};

// ---------------------------------------------------------------------------
// Pure validators
// ---------------------------------------------------------------------------

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Air temperature realism in Fahrenheit. */
export function isAirTempFRealistic(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true; // missing != invalid
  return finite(v) && v >= AIR_TEMP_F_REALISTIC.min && v <= AIR_TEMP_F_REALISTIC.max;
}

/** Air temperature realism in Celsius (snapshot canonical unit). */
export function isAirTempCRealistic(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (!finite(v)) return false;
  return isAirTempFRealistic(tempFFromC(v));
}

export function isSoilTempCRealistic(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (!finite(v)) return false;
  const f = tempFFromC(v);
  return f !== null && f >= SOIL_TEMP_F_REALISTIC.min && f <= SOIL_TEMP_F_REALISTIC.max;
}

export function isHumidityRealistic(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  return finite(v) && v >= RH_PCT_RANGE.min && v <= RH_PCT_RANGE.max;
}

export function isHumidityStuckExtreme(v: number | null | undefined): boolean {
  if (!finite(v)) return false;
  return (RH_STUCK_VALUES as readonly number[]).includes(v);
}

export function isVpdRealistic(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  return finite(v) && v >= VPD_KPA_REALISTIC.min && v <= VPD_KPA_REALISTIC.max;
}

export function isSoilMoistureRealistic(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  return (
    finite(v) && v >= SOIL_MOISTURE_PCT_RANGE.min && v <= SOIL_MOISTURE_PCT_RANGE.max
  );
}

export function isSoilEcMscmRealistic(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  return finite(v) && v >= SOIL_EC_MSCM_RANGE.min && v <= SOIL_EC_MSCM_RANGE.max;
}

export function isSoilEcUnitMismatchSuspected(v: number | null | undefined): boolean {
  if (!finite(v)) return false;
  return v >= SOIL_EC_MSCM_UNIT_MISMATCH_AT;
}

export function isPhRealistic(v: number | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  return finite(v) && v >= PH_REALISTIC.min && v <= PH_REALISTIC.max;
}

// ---------------------------------------------------------------------------
// Snapshot truth filter
// ---------------------------------------------------------------------------

export type SnapshotMetricKey =
  | "temp"
  | "rh"
  | "vpd"
  | "soil"
  | "soil_ec"
  | "soil_temp";

export interface SensorTruthAssessment {
  /**
   * Cleaned snapshot: numeric fields that failed realism guards are set
   * to `null`. `source`, `ts`, `device_id` are preserved unchanged.
   */
  snapshot: SensorSnapshot;
  /** Metric keys that were rejected as invalid and nulled. */
  invalidFields: SnapshotMetricKey[];
  /** Metric keys that look suspicious but were kept (e.g. unit mismatch). */
  suspiciousFields: SnapshotMetricKey[];
  /** Whether the snapshot is stale per the standard threshold. */
  stale: boolean;
  /** True if any invalid field exists. */
  hasInvalid: boolean;
  /** Stable, ordered list of UI reason chips. Never echoes raw values. */
  reasonChips: string[];
  /** Underlying reason codes (for tests / downstream programmatic use). */
  reasonCodes: TruthReasonCode[];
}

/**
 * Classify a snapshot and return a cleaned copy where invalid metrics
 * are nulled. Never invents data. Never upgrades source labels. Never
 * mutates the input.
 *
 * Rule wiring:
 *   - air temp invalid             → drop temp + drop vpd (derived)
 *   - humidity invalid             → drop rh + drop vpd
 *   - humidity stuck at 0/100      → suspicious chip; rh kept
 *   - vpd invalid                  → drop vpd
 *   - soil moisture invalid        → drop soil
 *   - soil ec invalid              → drop soil_ec
 *   - soil ec unit-mismatch        → suspicious chip; value kept (caller
 *                                    decides whether to surface)
 *   - soil temp invalid            → drop soil_temp
 *
 * A snapshot whose `source === "unavailable"` returns immediately with no
 * chips and no changes.
 */
export function classifySnapshotTruth(
  snapshot: SensorSnapshot | null | undefined,
  now: number = Date.now(),
): SensorTruthAssessment {
  if (!snapshot || snapshot.source === "unavailable") {
    return {
      snapshot: snapshot ?? EMPTY_SNAPSHOT,
      invalidFields: [],
      suspiciousFields: [],
      stale: false,
      hasInvalid: false,
      reasonChips: [],
      reasonCodes: [],
    };
  }

  const invalid: SnapshotMetricKey[] = [];
  const suspicious: SnapshotMetricKey[] = [];
  const codes: TruthReasonCode[] = [];

  const cleaned: SensorSnapshot = { ...snapshot };

  if (!isAirTempCRealistic(cleaned.temp)) {
    invalid.push("temp");
    codes.push("invalid_temp");
    cleaned.temp = null;
  }
  if (!isHumidityRealistic(cleaned.rh)) {
    invalid.push("rh");
    codes.push("invalid_rh");
    cleaned.rh = null;
  } else if (isHumidityStuckExtreme(cleaned.rh)) {
    suspicious.push("rh");
    codes.push("humidity_stuck_extreme");
  }

  // Derived VPD must be dropped when temp/rh are invalid, even if the
  // recorded vpd value itself parses inside the plausible band.
  const tempOrRhInvalid = invalid.includes("temp") || invalid.includes("rh");
  if (cleaned.vpd !== null && tempOrRhInvalid) {
    invalid.push("vpd");
    codes.push("vpd_dropped_temp_rh_invalid");
    cleaned.vpd = null;
  } else if (!isVpdRealistic(cleaned.vpd)) {
    invalid.push("vpd");
    codes.push("invalid_vpd");
    cleaned.vpd = null;
  }

  if (!isSoilMoistureRealistic(cleaned.soil)) {
    invalid.push("soil");
    codes.push("invalid_soil_moisture");
    cleaned.soil = null;
  }

  if (!isSoilEcMscmRealistic(cleaned.soil_ec)) {
    invalid.push("soil_ec");
    if (isSoilEcUnitMismatchSuspected(snapshot.soil_ec)) {
      codes.push("unit_mismatch_suspected");
    } else {
      codes.push("invalid_soil_ec");
    }
    cleaned.soil_ec = null;
  } else if (isSoilEcUnitMismatchSuspected(cleaned.soil_ec)) {
    suspicious.push("soil_ec");
    codes.push("unit_mismatch_suspected");
  }

  if (!isSoilTempCRealistic(cleaned.soil_temp)) {
    invalid.push("soil_temp");
    codes.push("invalid_soil_temp");
    cleaned.soil_temp = null;
  }

  const stale = isSnapshotStale(snapshot.ts, now);
  if (stale) codes.push("stale_reading");

  // Dedupe codes preserving order.
  const seen = new Set<TruthReasonCode>();
  const orderedCodes: TruthReasonCode[] = [];
  for (const c of codes) {
    if (!seen.has(c)) {
      seen.add(c);
      orderedCodes.push(c);
    }
  }

  return {
    snapshot: cleaned,
    invalidFields: invalid,
    suspiciousFields: suspicious,
    stale,
    hasInvalid: invalid.length > 0,
    reasonChips: orderedCodes.map((c) => TRUTH_REASON_CHIP[c]),
    reasonCodes: orderedCodes,
  };
}

/**
 * Convenience: return the cleaned snapshot only. Useful where a caller
 * already has its own stale/source plumbing and only needs invalid
 * fields dropped before computing a healthy display.
 */
export function applySensorTruth(
  snapshot: SensorSnapshot | null | undefined,
  now: number = Date.now(),
): SensorSnapshot {
  return classifySnapshotTruth(snapshot, now).snapshot;
}
