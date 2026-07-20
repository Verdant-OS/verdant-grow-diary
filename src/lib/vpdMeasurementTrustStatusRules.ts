/**
 * VPD measurement trust-status rules.
 *
 * This module separates a useful air-VPD estimate from a leaf-to-air VPD
 * measurement that is strong enough for a stage-target comparison. It is
 * pure, deterministic with injected time, and read-only. It never writes
 * alerts, Action Queue items, or device commands.
 */

import {
  AIR_TEMP_MAX_C,
  AIR_TEMP_MIN_C,
  calculateAirVpdKpa,
  calculateLeafVpdKpa,
  fahrenheitToCelsius,
} from "@/lib/vpdRules";

export const VPD_HUMIDITY_REFERENCE_MIN_PERCENT = 75;
export const VPD_CALIBRATION_MAX_AGE_DAYS = 365;
export const VPD_LEAF_MEASUREMENT_MAX_SKEW_MINUTES = 15;
export const VPD_MEASUREMENT_FUTURE_TOLERANCE_MINUTES = 5;

export type VpdSensorPlacement = "canopy" | "above_canopy" | "below_canopy" | "unknown";

export type VpdMeasurementBasis = "leaf" | "air_estimate" | "unavailable";
export type VpdMeasurementConfidence = "verified" | "reduced" | "unverified" | "invalid";

export type VpdMeasurementTrustIssue =
  | "air_temperature_missing_or_invalid"
  | "humidity_missing_or_invalid"
  | "humidity_stuck_extreme"
  | "leaf_temperature_missing"
  | "leaf_temperature_invalid"
  | "observation_time_missing"
  | "observation_time_in_future"
  | "leaf_measurement_time_missing"
  | "leaf_measurement_time_in_future"
  | "leaf_measurement_not_contemporaneous"
  | "temperature_verification_missing"
  | "temperature_verification_stale"
  | "temperature_verification_in_future"
  | "temperature_reference_missing"
  | "temperature_not_verified_at_operating_conditions"
  | "humidity_verification_missing"
  | "humidity_verification_stale"
  | "humidity_verification_in_future"
  | "humidity_reference_missing"
  | "humidity_reference_invalid"
  | "humidity_reference_below_minimum"
  | "placement_not_canopy"
  | "older_sensor_unverified"
  | "leaf_surface_condensation_risk";

type DateInput = string | number | Date | null | undefined;

export interface VpdMeasurementEvidence {
  observedAt?: DateInput;
  temperatureVerifiedAt?: DateInput;
  temperatureReference?: string | null;
  temperatureVerifiedAtOperatingConditions?: boolean | null;
  humidityVerifiedAt?: DateInput;
  humidityReferenceRhPercent?: number | null;
  leafTemperatureMeasuredAt?: DateInput;
  placement?: VpdSensorPlacement | null;
  sensorCommissionedAt?: DateInput;
}

export interface VpdMeasurementTrustInput {
  airTempC?: number | string | null;
  airTempF?: number | string | null;
  leafTempC?: number | string | null;
  leafTempF?: number | string | null;
  humidityPct?: number | string | null;
  evidence?: VpdMeasurementEvidence | null;
  nowMs?: number;
  calibrationMaxAgeDays?: number;
  leafMeasurementMaxSkewMinutes?: number;
  measurementFutureToleranceMinutes?: number;
}

export interface VpdMeasurementTrustResult {
  basis: VpdMeasurementBasis;
  confidence: VpdMeasurementConfidence;
  valueKpa: number | null;
  airVpdKpa: number | null;
  leafVpdKpa: number | null;
  airTempC: number | null;
  leafTempC: number | null;
  leafTempOffsetC: number | null;
  humidityPct: number | null;
  canCompareToStageTarget: boolean;
  issues: ReadonlyArray<VpdMeasurementTrustIssue>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

const UNVERIFIED_ISSUES = new Set<VpdMeasurementTrustIssue>([
  "leaf_temperature_missing",
  "observation_time_missing",
  "leaf_measurement_time_missing",
  "temperature_verification_missing",
  "temperature_reference_missing",
  "temperature_not_verified_at_operating_conditions",
  "humidity_verification_missing",
  "humidity_reference_missing",
  "placement_not_canopy",
]);

function toFinite(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function wasProvided(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  return typeof value !== "string" || value.trim() !== "";
}

function resolveTempC(celsius: unknown, fahrenheit: unknown): number | null {
  const c = toFinite(celsius);
  if (c !== null) return c;
  const f = toFinite(fahrenheit);
  return f === null ? null : fahrenheitToCelsius(f);
}

function toMs(value: DateInput): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function pushUnique(issues: VpdMeasurementTrustIssue[], issue: VpdMeasurementTrustIssue): void {
  if (!issues.includes(issue)) issues.push(issue);
}

function assessVerificationDate(args: {
  value: DateInput;
  nowMs: number;
  maxAgeMs: number;
  missing: VpdMeasurementTrustIssue;
  stale: VpdMeasurementTrustIssue;
  future: VpdMeasurementTrustIssue;
  issues: VpdMeasurementTrustIssue[];
}): "current" | "missing" | "stale" | "future" {
  const verifiedMs = toMs(args.value);
  if (verifiedMs === null) {
    pushUnique(args.issues, args.missing);
    return "missing";
  }
  if (verifiedMs > args.nowMs) {
    pushUnique(args.issues, args.future);
    return "future";
  }
  if (args.nowMs - verifiedMs > args.maxAgeMs) {
    pushUnique(args.issues, args.stale);
    return "stale";
  }
  return "current";
}

export function evaluateVpdMeasurementTrust(
  input: VpdMeasurementTrustInput,
): VpdMeasurementTrustResult {
  const issues: VpdMeasurementTrustIssue[] = [];
  const evidence = input.evidence ?? {};
  const nowMs = Number.isFinite(input.nowMs) ? (input.nowMs as number) : Date.now();
  const calibrationMaxAgeDays =
    toFinite(input.calibrationMaxAgeDays) ?? VPD_CALIBRATION_MAX_AGE_DAYS;
  const leafMeasurementMaxSkewMinutes =
    toFinite(input.leafMeasurementMaxSkewMinutes) ?? VPD_LEAF_MEASUREMENT_MAX_SKEW_MINUTES;
  const measurementFutureToleranceMinutes =
    toFinite(input.measurementFutureToleranceMinutes) ?? VPD_MEASUREMENT_FUTURE_TOLERANCE_MINUTES;
  const maxAgeMs = Math.max(0, calibrationMaxAgeDays) * DAY_MS;
  const maxLeafSkewMs = Math.max(0, leafMeasurementMaxSkewMinutes) * MINUTE_MS;
  const maxFutureToleranceMs = Math.max(0, measurementFutureToleranceMinutes) * MINUTE_MS;

  const airTempC = resolveTempC(input.airTempC, input.airTempF);
  const leafTempC = resolveTempC(input.leafTempC, input.leafTempF);
  const humidityPct = toFinite(input.humidityPct);
  const airTempValid =
    airTempC !== null && airTempC >= AIR_TEMP_MIN_C && airTempC <= AIR_TEMP_MAX_C;
  const humidityValid = humidityPct !== null && humidityPct >= 0 && humidityPct <= 100;
  const leafWasProvided = wasProvided(input.leafTempC) || wasProvided(input.leafTempF);
  const leafTempValid =
    leafTempC !== null && leafTempC >= AIR_TEMP_MIN_C && leafTempC <= AIR_TEMP_MAX_C;

  if (!airTempValid) pushUnique(issues, "air_temperature_missing_or_invalid");
  if (!humidityValid) pushUnique(issues, "humidity_missing_or_invalid");
  if (humidityPct === 0 || humidityPct === 100) {
    pushUnique(issues, "humidity_stuck_extreme");
  }
  if (!leafWasProvided) pushUnique(issues, "leaf_temperature_missing");
  else if (!leafTempValid) pushUnique(issues, "leaf_temperature_invalid");

  const airVpdKpa =
    airTempValid && humidityValid
      ? calculateAirVpdKpa({ tempC: airTempC, rhPercent: humidityPct })
      : null;
  const leafVpdKpa =
    airTempValid && humidityValid && leafTempValid
      ? calculateLeafVpdKpa({ airTempC, leafTempC, rhPercent: humidityPct })
      : null;

  if (!airTempValid || !humidityValid || (leafWasProvided && !leafTempValid)) {
    return {
      basis: airVpdKpa === null ? "unavailable" : "air_estimate",
      confidence: "invalid",
      valueKpa: airVpdKpa,
      airVpdKpa,
      leafVpdKpa: null,
      airTempC: airTempValid ? airTempC : null,
      leafTempC: leafTempValid ? leafTempC : null,
      leafTempOffsetC: null,
      humidityPct: humidityValid ? humidityPct : null,
      canCompareToStageTarget: false,
      issues: Object.freeze([...issues]),
    };
  }

  const temperatureVerification = assessVerificationDate({
    value: evidence.temperatureVerifiedAt,
    nowMs,
    maxAgeMs,
    missing: "temperature_verification_missing",
    stale: "temperature_verification_stale",
    future: "temperature_verification_in_future",
    issues,
  });
  const humidityVerification = assessVerificationDate({
    value: evidence.humidityVerifiedAt,
    nowMs,
    maxAgeMs,
    missing: "humidity_verification_missing",
    stale: "humidity_verification_stale",
    future: "humidity_verification_in_future",
    issues,
  });

  if (!evidence.temperatureReference?.trim()) {
    pushUnique(issues, "temperature_reference_missing");
  }
  if (evidence.temperatureVerifiedAtOperatingConditions !== true) {
    pushUnique(issues, "temperature_not_verified_at_operating_conditions");
  }

  const humidityReference = toFinite(evidence.humidityReferenceRhPercent);
  if (humidityReference === null) {
    pushUnique(issues, "humidity_reference_missing");
  } else if (humidityReference < 0 || humidityReference > 100) {
    pushUnique(issues, "humidity_reference_invalid");
  } else if (humidityReference < VPD_HUMIDITY_REFERENCE_MIN_PERCENT) {
    pushUnique(issues, "humidity_reference_below_minimum");
  }

  if (evidence.placement !== "canopy") {
    pushUnique(issues, "placement_not_canopy");
  }

  if (leafTempValid) {
    const observedMs = toMs(evidence.observedAt);
    const leafMeasuredMs = toMs(evidence.leafTemperatureMeasuredAt);
    if (observedMs === null) {
      pushUnique(issues, "observation_time_missing");
    } else if (observedMs > nowMs + maxFutureToleranceMs) {
      pushUnique(issues, "observation_time_in_future");
    }
    if (leafMeasuredMs === null) {
      pushUnique(issues, "leaf_measurement_time_missing");
    } else {
      if (leafMeasuredMs > nowMs + maxFutureToleranceMs) {
        pushUnique(issues, "leaf_measurement_time_in_future");
      }
      if (observedMs !== null && Math.abs(leafMeasuredMs - observedMs) > maxLeafSkewMs) {
        pushUnique(issues, "leaf_measurement_not_contemporaneous");
      }
    }
  }

  const commissionedMs = toMs(evidence.sensorCommissionedAt);
  const olderSensor =
    commissionedMs !== null && commissionedMs <= nowMs && nowMs - commissionedMs > maxAgeMs;
  if (
    olderSensor &&
    (temperatureVerification !== "current" || humidityVerification !== "current")
  ) {
    pushUnique(issues, "older_sensor_unverified");
  }

  if (leafVpdKpa !== null && leafVpdKpa < 0) {
    pushUnique(issues, "leaf_surface_condensation_risk");
  }

  const hasUnverifiedIssue = issues.some((issue) => UNVERIFIED_ISSUES.has(issue));
  const hasDowngradeIssue = issues.length > 0;
  const confidence: VpdMeasurementConfidence = hasUnverifiedIssue
    ? "unverified"
    : hasDowngradeIssue
      ? "reduced"
      : "verified";
  const canCompareToStageTarget = confidence === "verified" && leafVpdKpa !== null;

  return {
    basis: leafVpdKpa !== null ? "leaf" : "air_estimate",
    confidence,
    valueKpa: leafVpdKpa ?? airVpdKpa,
    airVpdKpa,
    leafVpdKpa,
    airTempC,
    leafTempC: leafTempValid ? leafTempC : null,
    leafTempOffsetC:
      leafTempValid && airTempC !== null ? Math.round((leafTempC - airTempC) * 100) / 100 : null,
    humidityPct,
    canCompareToStageTarget,
    issues: Object.freeze([...issues]),
  };
}
