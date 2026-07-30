/**
 * sensorReadingRangeValidation — pure per-metric range checks applied to a
 * single `sensor_readings` row BEFORE it is inserted.
 *
 * Complements the shape check in `useInsertSensorReading.validateSensorReadingPayload`:
 * that one guards the row shape (tent_id, metric enum, finite numeric value);
 * this one guards the numeric value itself against physically implausible
 * ranges so bad manual entries can't reach the DB and be interpreted as
 * healthy by AI/dashboards later.
 *
 * Constraints:
 *  - Pure. No React, no Supabase, no I/O, no timers, no randomness.
 *  - Never mutates the payload. Never relabels source.
 *  - Never fabricates units — Celsius/mS-cm/kPa are the canonical units
 *    already enforced by the DB `sensor_readings.metric` enum values.
 *  - Absent OPTIONAL metadata (captured_at) never blocks; only bad shape does.
 */

import {
  AIR_TEMP_C_RANGE,
  HUMIDITY_RANGE,
  SUBSTRATE_TEMP_C_RANGE,
  VWC_RANGE,
} from "@/constants/csvValidationRanges";
import { VPD_REALISTIC_RANGE } from "@/lib/manualSensorSnapshotQualityRules";

export type SensorReadingMetric =
  | "temperature_c"
  | "humidity_pct"
  | "vpd_kpa"
  | "co2_ppm"
  | "soil_moisture_pct"
  | "soil_temp_c"
  | "soil_ec_mscm"
  | "reservoir_ph"
  | "reservoir_ec_mscm"
  | "ppfd";

export const CO2_PPM_RANGE = { min: 0, max: 10000 } as const;
export const PPFD_RANGE = { min: 0, max: 3000 } as const;
export const RESERVOIR_PH_RANGE = { min: 0, max: 14 } as const;
export const EC_MSCM_RANGE = { min: 0, max: 100 } as const;

export interface SensorReadingRangeIssue {
  readonly severity: "block" | "warn";
  readonly code:
    | "value_not_finite"
    | "value_out_of_range"
    | "unknown_metric"
    | "captured_at_invalid"
    | "captured_at_in_future";
  readonly message: string;
}

export interface SensorReadingRangeInput {
  readonly metric: string;
  readonly value: unknown;
  /** ISO string / Date / epoch-ms. Optional. */
  readonly ts?: string | number | Date | null;
}

export interface SensorReadingRangeValidation {
  readonly ok: boolean;
  readonly issues: ReadonlyArray<SensorReadingRangeIssue>;
}

export interface RangeValidateOptions {
  readonly nowMs?: number;
  /** Max seconds a `ts` may lead `nowMs` before we treat it as a client-clock skew. */
  readonly futureSkewSeconds?: number;
}

const RANGES: Record<SensorReadingMetric, { min: number; max: number; label: string; unit: string }> = {
  temperature_c: { ...AIR_TEMP_C_RANGE, label: "Air temperature", unit: "°C" },
  humidity_pct: { ...HUMIDITY_RANGE, label: "Humidity", unit: "%" },
  vpd_kpa: { ...VPD_REALISTIC_RANGE, label: "VPD", unit: "kPa" },
  co2_ppm: { ...CO2_PPM_RANGE, label: "CO₂", unit: "ppm" },
  soil_moisture_pct: { ...VWC_RANGE, label: "Soil moisture", unit: "%" },
  soil_temp_c: { ...SUBSTRATE_TEMP_C_RANGE, label: "Soil temperature", unit: "°C" },
  soil_ec_mscm: { ...EC_MSCM_RANGE, label: "Soil EC", unit: "mS/cm" },
  reservoir_ph: { ...RESERVOIR_PH_RANGE, label: "Reservoir pH", unit: "" },
  reservoir_ec_mscm: { ...EC_MSCM_RANGE, label: "Reservoir EC", unit: "mS/cm" },
  ppfd: { ...PPFD_RANGE, label: "PPFD", unit: "µmol/m²/s" },
};

function toMs(v: SensorReadingRangeInput["ts"]): number | null {
  if (v == null) return null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : NaN;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const t = Date.parse(String(v));
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Validate a single sensor reading against physical ranges. Returns
 * `ok: false` with blocking issues when the value is not usable; warnings
 * do not block on their own.
 */
export function validateSensorReadingRange(
  input: SensorReadingRangeInput,
  options: RangeValidateOptions = {},
): SensorReadingRangeValidation {
  const issues: SensorReadingRangeIssue[] = [];
  const metric = input.metric as SensorReadingMetric;
  const spec = RANGES[metric];

  if (!spec) {
    issues.push({
      severity: "block",
      code: "unknown_metric",
      message: `Unknown sensor metric "${String(input.metric)}".`,
    });
    return { ok: false, issues: Object.freeze(issues) };
  }

  const v = typeof input.value === "number" ? input.value : Number(input.value);
  if (!Number.isFinite(v)) {
    issues.push({
      severity: "block",
      code: "value_not_finite",
      message: `${spec.label} value must be a finite number.`,
    });
  } else if (v < spec.min || v > spec.max) {
    issues.push({
      severity: "block",
      code: "value_out_of_range",
      message: `${spec.label} ${v}${spec.unit ? " " + spec.unit : ""} is outside the accepted range (${spec.min}–${spec.max}${spec.unit ? " " + spec.unit : ""}).`,
    });
  }

  if (input.ts !== undefined && input.ts !== null) {
    const ms = toMs(input.ts);
    if (ms === null || Number.isNaN(ms)) {
      issues.push({
        severity: "block",
        code: "captured_at_invalid",
        message: "Timestamp is not a valid date.",
      });
    } else {
      const now = options.nowMs ?? Date.now();
      const skew = (options.futureSkewSeconds ?? 300) * 1000;
      if (ms - now > skew) {
        issues.push({
          severity: "block",
          code: "captured_at_in_future",
          message: "Timestamp is in the future — check the device or system clock.",
        });
      }
    }
  }

  const ok = !issues.some((i) => i.severity === "block");
  return { ok, issues: Object.freeze(issues) };
}
