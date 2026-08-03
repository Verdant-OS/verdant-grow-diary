/**
 * sensorMetricSafetyRules — pure suspicious-reading detector.
 *
 * Flags telemetry that looks broken, mislabeled, or stuck. Never mutates
 * the values. Never silently treats suspicious data as healthy.
 */
import { EC_MSCM_SUSPICIOUS_MAX, PH_PRESENTATION_REALISTIC } from "@/constants/sensorTruthRanges";
import type { SensorMetrics } from "./sensorSnapshotFreshnessRules";

export type MetricFlagCode =
  | "temp_f_looks_celsius"
  | "humidity_stuck_0"
  | "humidity_stuck_100"
  | "humidity_out_of_range"
  | "soil_stuck_0"
  | "soil_stuck_100"
  | "soil_out_of_range"
  | "ph_out_of_range"
  | "ec_likely_microsiemens"
  | "ec_out_of_range"
  | "non_finite_value"
  | "missing_value";

export interface MetricFlag {
  code: MetricFlagCode;
  metric: string;
  message: string;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** Detect suspicious patterns in a metrics object. Pure, deterministic. */
export function detectSuspiciousMetrics(metrics: SensorMetrics): MetricFlag[] {
  const flags: MetricFlag[] = [];

  const push = (code: MetricFlagCode, metric: string, message: string) =>
    flags.push({ code, metric, message });

  // Temperature: tempF that looks like Celsius (e.g. 20–35 reported as F is
  // implausibly cold for a tent and likely a unit confusion).
  if (metrics.temp_f !== undefined) {
    if (metrics.temp_f === null) {
      push("missing_value", "temp_f", "Missing temperature (°F).");
    } else if (!isFiniteNumber(metrics.temp_f)) {
      push("non_finite_value", "temp_f", "Temperature is not a finite number.");
    } else if (metrics.temp_f >= 10 && metrics.temp_f <= 45) {
      push(
        "temp_f_looks_celsius",
        "temp_f",
        "Temperature reported in °F but value looks like °C. Check unit.",
      );
    }
  }

  // Humidity: 0/100 stuck, or out of [0,100].
  if (metrics.rh !== undefined) {
    if (metrics.rh === null) {
      push("missing_value", "rh", "Missing humidity.");
    } else if (!isFiniteNumber(metrics.rh)) {
      push("non_finite_value", "rh", "Humidity is not a finite number.");
    } else if (metrics.rh === 0) {
      push("humidity_stuck_0", "rh", "Humidity stuck at 0% — likely sensor fault.");
    } else if (metrics.rh === 100) {
      push("humidity_stuck_100", "rh", "Humidity stuck at 100% — likely sensor fault.");
    } else if (metrics.rh < 0 || metrics.rh > 100) {
      push("humidity_out_of_range", "rh", "Humidity outside 0–100%.");
    }
  }

  // Soil moisture: same stuck pattern.
  if (metrics.soil_moisture !== undefined) {
    const sm = metrics.soil_moisture;
    if (sm === null) {
      push("missing_value", "soil_moisture", "Missing soil moisture.");
    } else if (!isFiniteNumber(sm)) {
      push("non_finite_value", "soil_moisture", "Soil moisture is not a finite number.");
    } else if (sm === 0) {
      push("soil_stuck_0", "soil_moisture", "Soil moisture stuck at 0% — likely sensor fault.");
    } else if (sm === 100) {
      push("soil_stuck_100", "soil_moisture", "Soil moisture stuck at 100% — likely sensor fault.");
    } else if (sm < 0 || sm > 100) {
      push("soil_out_of_range", "soil_moisture", "Soil moisture outside 0–100%.");
    }
  }

  // pH: presentation realistic range from sensorTruthRanges.
  if (metrics.ph !== undefined) {
    if (metrics.ph === null) {
      push("missing_value", "ph", "Missing pH.");
    } else if (!isFiniteNumber(metrics.ph)) {
      push("non_finite_value", "ph", "pH is not a finite number.");
    } else if (
      metrics.ph < PH_PRESENTATION_REALISTIC.min ||
      metrics.ph > PH_PRESENTATION_REALISTIC.max
    ) {
      push(
        "ph_out_of_range",
        "ph",
        `pH outside realistic ${PH_PRESENTATION_REALISTIC.min}–${PH_PRESENTATION_REALISTIC.max} range.`,
      );
    }
  }

  // EC: expected in mS/cm. Soft tier (≥ EC_MSCM_SUSPICIOUS_MAX) looks like µS.
  if (metrics.ec !== undefined) {
    if (metrics.ec === null) {
      push("missing_value", "ec", "Missing EC.");
    } else if (!isFiniteNumber(metrics.ec)) {
      push("non_finite_value", "ec", "EC is not a finite number.");
    } else if (metrics.ec > EC_MSCM_SUSPICIOUS_MAX) {
      push(
        "ec_likely_microsiemens",
        "ec",
        "EC value looks like µS/cm but expected mS/cm. Check unit.",
      );
    } else if (metrics.ec < 0) {
      push("ec_out_of_range", "ec", "EC cannot be negative.");
    }
  }

  return flags;
}

export function hasBlockingMetricFlag(flags: MetricFlag[]): boolean {
  return flags.length > 0;
}
