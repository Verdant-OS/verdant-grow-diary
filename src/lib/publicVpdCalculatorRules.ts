import { AIR_TEMP_MAX_C, AIR_TEMP_MIN_C, fahrenheitToCelsius, type TempUnit } from "@/lib/vpdRules";
import {
  evaluateVpdMeasurementTrust,
  type VpdMeasurementBasis,
  type VpdMeasurementConfidence,
  type VpdMeasurementEvidence,
  type VpdMeasurementTrustIssue,
} from "@/lib/vpdMeasurementTrustStatusRules";
import {
  classifyVpdAgainstStage,
  getVpdTargetBand,
  type VpdClassification,
  type VpdStage,
} from "@/lib/vpdStageTargetRules";

export const PUBLIC_VPD_CALCULATOR_PATH = "/tools/vpd-calculator" as const;
export const PUBLIC_VPD_GUIDE_PATH = "/guides/grow-room-vpd-tracker" as const;
export const PUBLIC_VPD_CALCULATOR_URL =
  "https://verdantgrowdiary.com/tools/vpd-calculator" as const;

export const PUBLIC_VPD_SOURCE_NOTE =
  "Manual inputs · calculated locally · not live telemetry. Nothing is uploaded or saved.";
export const PUBLIC_VPD_SAFETY_NOTE =
  "Air VPD is an estimate. Verdant unlocks a stage-target claim only for calibrated temperature and RH evidence plus a contemporaneous canopy-level leaf-temperature measurement. VPD is context, not a plant-health diagnosis or device command.";

export type PublicVpdCalculatorState = "needs_inputs" | "invalid" | "derived";
export type PublicVpdCalculatorInvalidReason = "invalid_temperature" | "invalid_humidity";

export interface PublicVpdCalculatorInput {
  temperature: number | null | undefined;
  leafTemperature?: number | null | undefined;
  temperatureUnit: TempUnit;
  humidity: number | null | undefined;
  stage: VpdStage;
  measurementEvidence?: VpdMeasurementEvidence | null;
  nowMs?: number;
}

export interface PublicVpdCalculatorResult {
  state: PublicVpdCalculatorState;
  invalidReason: PublicVpdCalculatorInvalidReason | null;
  vpdKpa: number | null;
  airVpdKpa: number | null;
  leafVpdKpa: number | null;
  temperatureC: number | null;
  humidity: number | null;
  stage: VpdStage;
  classification: VpdClassification | null;
  basis: VpdMeasurementBasis;
  confidence: VpdMeasurementConfidence;
  canCompareToStageTarget: boolean;
  trustIssues: ReadonlyArray<VpdMeasurementTrustIssue>;
  classificationLabel: string;
  targetLabel: string;
  interpretation: string;
  sourceNote: string;
  safetyNote: string;
}

export interface PublicVpdStageOption {
  value: VpdStage;
  label: string;
}

export const PUBLIC_VPD_STAGE_OPTIONS: readonly PublicVpdStageOption[] = Object.freeze([
  Object.freeze({ value: "unknown", label: "Stage not selected" }),
  Object.freeze({ value: "seedling", label: "Seedling" }),
  Object.freeze({ value: "veg", label: "Vegetative" }),
  Object.freeze({ value: "preflower", label: "Pre-flower / transition" }),
  Object.freeze({ value: "flower", label: "Flower" }),
  Object.freeze({ value: "late_flower", label: "Late flower" }),
  Object.freeze({ value: "harvest", label: "Harvest / drying / cure" }),
]);

export const PUBLIC_VPD_CALCULATOR_FAQ = Object.freeze([
  Object.freeze({
    question: "What does this VPD calculator calculate?",
    answer:
      "It always shows an air VPD estimate from manual temperature and RH. Add measured leaf temperature and verification evidence to calculate leaf-to-air VPD and unlock a stage comparison. It does not read a live sensor.",
  }),
  Object.freeze({
    question: "Does an in-range VPD mean my plant is healthy?",
    answer:
      "No. VPD is one piece of environmental context. Plant stage, medium, watering, root-zone conditions, sensor quality, and plant response still matter.",
  }),
  Object.freeze({
    question: "Will Verdant change my fan or humidifier?",
    answer:
      "No. This calculator is read-only. Verdant does not issue device commands, and any future suggested action remains grower-reviewed and approval-required.",
  }),
]);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function verifiedTargetLabel(stage: VpdStage): string {
  const band = getVpdTargetBand(stage);
  if (stage === "unknown") return "Select a stage for a stage-aware range.";
  if (band.contextOnly || band.min === null || band.max === null) {
    return "No active VPD target for this stage; shown as context only.";
  }
  return `${band.min.toFixed(1)}–${band.max.toFixed(1)} kPa target band`;
}

function interpretationFor(classification: VpdClassification): string {
  switch (classification) {
    case "in_target":
      return "This derived value is within the selected stage band. Treat it as context and keep watching the plant, medium, watering, and source freshness.";
    case "below_target":
      return "This derived value is below the selected stage band. Recheck temperature, humidity, stage, sensor placement, and timestamp before considering a gradual change.";
    case "above_target":
      return "This derived value is above the selected stage band. Recheck temperature, humidity, stage, sensor placement, and timestamp before considering a gradual change.";
    case "stage_unknown":
      return "The air VPD is calculated, but no stage-specific interpretation is applied until you select the plant stage.";
    case "context_only":
      return "The air VPD is calculated as historical or process context; this stage has no active target band.";
    case "unavailable":
    default:
      return "Enter a valid temperature and relative humidity to calculate air VPD.";
  }
}

function baseResult(
  input: PublicVpdCalculatorInput,
): Omit<
  PublicVpdCalculatorResult,
  | "state"
  | "invalidReason"
  | "vpdKpa"
  | "temperatureC"
  | "humidity"
  | "classification"
  | "classificationLabel"
  | "interpretation"
> {
  return {
    stage: input.stage,
    targetLabel: "Verify the measurement before selecting a stage target.",
    sourceNote: PUBLIC_VPD_SOURCE_NOTE,
    safetyNote: PUBLIC_VPD_SAFETY_NOTE,
    basis: "unavailable",
    confidence: "unverified",
    canCompareToStageTarget: false,
    airVpdKpa: null,
    leafVpdKpa: null,
    trustIssues: Object.freeze([]),
  };
}

/**
 * Read-only public air-VPD evaluator. Inputs are never persisted, classified
 * as live telemetry, or converted into device or Action Queue commands.
 */
export function evaluatePublicVpdCalculator(
  input: PublicVpdCalculatorInput,
): PublicVpdCalculatorResult {
  const base = baseResult(input);
  if (input.temperature == null || input.humidity == null) {
    return {
      ...base,
      state: "needs_inputs",
      invalidReason: null,
      vpdKpa: null,
      temperatureC: null,
      humidity: null,
      classification: null,
      classificationLabel: "Temperature and humidity required",
      interpretation: interpretationFor("unavailable"),
    };
  }
  if (!isFiniteNumber(input.temperature)) {
    return {
      ...base,
      state: "invalid",
      invalidReason: "invalid_temperature",
      vpdKpa: null,
      temperatureC: null,
      humidity: isFiniteNumber(input.humidity) ? input.humidity : null,
      classification: null,
      classificationLabel: "Temperature is not a valid number",
      interpretation: "Enter a finite temperature value.",
    };
  }
  if (!isFiniteNumber(input.humidity)) {
    return {
      ...base,
      state: "invalid",
      invalidReason: "invalid_humidity",
      vpdKpa: null,
      temperatureC:
        input.temperatureUnit === "F" ? fahrenheitToCelsius(input.temperature) : input.temperature,
      humidity: null,
      classification: null,
      classificationLabel: "Relative humidity is not a valid number",
      interpretation: "Enter a finite relative humidity value.",
    };
  }

  const temperatureC =
    input.temperatureUnit === "F" ? fahrenheitToCelsius(input.temperature) : input.temperature;
  if (temperatureC < AIR_TEMP_MIN_C || temperatureC > AIR_TEMP_MAX_C) {
    return {
      ...base,
      state: "invalid",
      invalidReason: "invalid_temperature",
      vpdKpa: null,
      temperatureC,
      humidity: input.humidity,
      classification: null,
      classificationLabel: "Temperature outside supported range",
      interpretation: `Enter a temperature between ${AIR_TEMP_MIN_C}°C and ${AIR_TEMP_MAX_C}°C.`,
    };
  }
  if (input.humidity < 0 || input.humidity > 100) {
    return {
      ...base,
      state: "invalid",
      invalidReason: "invalid_humidity",
      vpdKpa: null,
      temperatureC,
      humidity: input.humidity,
      classification: null,
      classificationLabel: "Relative humidity outside supported range",
      interpretation: "Enter relative humidity between 0% and 100%.",
    };
  }

  const trust = evaluateVpdMeasurementTrust({
    airTempC: input.temperatureUnit === "C" ? input.temperature : undefined,
    airTempF: input.temperatureUnit === "F" ? input.temperature : undefined,
    leafTempC: input.temperatureUnit === "C" ? input.leafTemperature : undefined,
    leafTempF: input.temperatureUnit === "F" ? input.leafTemperature : undefined,
    humidityPct: input.humidity,
    evidence: input.measurementEvidence,
    nowMs: input.nowMs,
  });
  const vpdKpa = trust.valueKpa;
  if (vpdKpa === null) {
    return {
      ...base,
      state: "invalid",
      invalidReason: "invalid_temperature",
      vpdKpa: null,
      temperatureC,
      humidity: input.humidity,
      classification: null,
      classificationLabel: "Inputs could not be calculated",
      interpretation: "Recheck the temperature and humidity values.",
    };
  }

  const classified = trust.canCompareToStageTarget
    ? classifyVpdAgainstStage({ value: vpdKpa, stage: input.stage })
    : null;
  const classificationLabel = classified
    ? classified.label
    : trust.basis === "leaf"
      ? "Leaf VPD estimate — verification required"
      : "Air VPD estimate — no target claim";
  const interpretation = classified
    ? interpretationFor(classified.classification)
    : trust.basis === "leaf"
      ? "Leaf temperature is included, but calibration or placement evidence is incomplete or out of date. Review the evidence checklist before comparing this value with a stage target."
      : "This is air VPD only. Measure leaf temperature at the canopy and complete the calibration evidence before treating the number as a stage-target result.";
  return {
    ...base,
    state: "derived",
    invalidReason: null,
    vpdKpa,
    temperatureC: Math.round(temperatureC * 100) / 100,
    humidity: input.humidity,
    classification: classified?.classification ?? null,
    classificationLabel,
    interpretation,
    targetLabel: trust.canCompareToStageTarget
      ? verifiedTargetLabel(input.stage)
      : "Verify the measurement before selecting a stage target.",
    basis: trust.basis,
    confidence: trust.confidence,
    canCompareToStageTarget: trust.canCompareToStageTarget,
    airVpdKpa: trust.airVpdKpa,
    leafVpdKpa: trust.leafVpdKpa,
    trustIssues: trust.issues,
  };
}

export function buildPublicVpdShareData(): ShareData {
  const params = new URLSearchParams({
    utm_source: "vpd_calculator_share",
    utm_medium: "referral",
    utm_campaign: "vpd_calculator",
  });
  return {
    title: "Free stage-aware VPD calculator — Verdant",
    text: "Calculate an air VPD estimate or evidence-verified leaf VPD, with honest confidence labeling and no device control.",
    url: `${PUBLIC_VPD_CALCULATOR_URL}?${params.toString()}`,
  };
}
