/**
 * environmentStageTargetRules — pure helpers for stage-aware Temperature and
 * Relative Humidity target bands shown on the Dashboard environment strip.
 *
 * Mirrors the contract of `vpdStageTargetRules`:
 *   - No I/O, no React, no Supabase, no fetch.
 *   - No automation, no device control.
 *   - No alert persistence writes.
 *   - No Action Queue writes.
 *   - No AI Doctor calls.
 *   - Stale readings never map to ok/healthy (mapped to warn).
 *   - Raw values are NEVER clamped; the caller's actual value is echoed.
 *
 * Stage normalization is delegated to `normalizeVpdStage` so all
 * stage-aware environment surfaces agree on stage keys.
 */
import { normalizeVpdStage, type VpdStage } from "./vpdStageTargetRules";

export type EnvStage = VpdStage;

export type EnvClassification =
  | "below_target"
  | "in_target"
  | "above_target"
  | "unavailable"
  | "stage_unknown"
  | "context_only";

export interface EnvTargetBand {
  stage: EnvStage;
  /** Lower bound. null = no active target for this stage. */
  min: number | null;
  /** Upper bound. null = no active target for this stage. */
  max: number | null;
  /** True when stage has no active target (harvest/drying). */
  contextOnly: boolean;
  helper: string;
}

export interface EnvClassificationResult {
  band: EnvTargetBand;
  /** Raw input value, never clamped. null when unavailable. */
  value: number | null;
  stale: boolean;
  classification: EnvClassification;
  label: string;
  historical: boolean;
}

/**
 * Small deadbands so boundary values fall inside `in_target` and the chip
 * does not flicker between in/below/above when a sensor jitters.
 */
export const TEMP_DEADBAND_C = 0.3;
export const RH_DEADBAND_PCT = 1.5;

export const ENV_STAGE_HELPER_TEXT =
  "Temperature and humidity targets depend on plant stage. Stale readings are historical and should not be treated as live conditions.";

const STAGE_LABEL: Record<EnvStage, string> = {
  seedling: "Seedling",
  veg: "Veg",
  preflower: "Pre-flower",
  flower: "Flower",
  late_flower: "Late flower",
  harvest: "Harvest",
  unknown: "Stage unknown",
};

const TEMP_BANDS: Record<EnvStage, { min: number | null; max: number | null; contextOnly: boolean }> = {
  seedling: { min: 22, max: 26, contextOnly: false },
  veg: { min: 22, max: 28, contextOnly: false },
  preflower: { min: 21, max: 27, contextOnly: false },
  flower: { min: 20, max: 26, contextOnly: false },
  late_flower: { min: 19, max: 25, contextOnly: false },
  harvest: { min: null, max: null, contextOnly: true },
  unknown: { min: null, max: null, contextOnly: false },
};

const RH_BANDS: Record<EnvStage, { min: number | null; max: number | null; contextOnly: boolean }> = {
  seedling: { min: 65, max: 75, contextOnly: false },
  veg: { min: 55, max: 70, contextOnly: false },
  preflower: { min: 50, max: 65, contextOnly: false },
  flower: { min: 40, max: 55, contextOnly: false },
  late_flower: { min: 35, max: 50, contextOnly: false },
  harvest: { min: null, max: null, contextOnly: true },
  unknown: { min: null, max: null, contextOnly: false },
};

export function getTempTargetBand(stage: string | null | undefined | EnvStage): EnvTargetBand {
  const key = normalizeVpdStage(stage);
  const b = TEMP_BANDS[key];
  return {
    stage: key,
    min: b.min,
    max: b.max,
    contextOnly: b.contextOnly,
    helper:
      key === "harvest"
        ? `Harvest stage has no active temperature target; shown as context only. ${ENV_STAGE_HELPER_TEXT}`
        : key === "unknown"
          ? `Stage unknown — set the grow stage for stage-aware guidance. ${ENV_STAGE_HELPER_TEXT}`
          : `${STAGE_LABEL[key]} prefers ${b.min}–${b.max}°C. ${ENV_STAGE_HELPER_TEXT}`,
  };
}

export function getRhTargetBand(stage: string | null | undefined | EnvStage): EnvTargetBand {
  const key = normalizeVpdStage(stage);
  const b = RH_BANDS[key];
  return {
    stage: key,
    min: b.min,
    max: b.max,
    contextOnly: b.contextOnly,
    helper:
      key === "harvest"
        ? `Harvest stage has no active RH target; shown as context only. ${ENV_STAGE_HELPER_TEXT}`
        : key === "unknown"
          ? `Stage unknown — set the grow stage for stage-aware guidance. ${ENV_STAGE_HELPER_TEXT}`
          : `${STAGE_LABEL[key]} prefers ${b.min}–${b.max}% RH. ${ENV_STAGE_HELPER_TEXT}`,
  };
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function classify(
  band: EnvTargetBand,
  value: number | null | undefined,
  stale: boolean,
  unit: "°C" | "%",
  deadband: number,
): EnvClassificationResult {
  const v = isFiniteNumber(value) ? value : null;

  if (v === null) {
    return {
      band,
      value: null,
      stale,
      classification: "unavailable",
      label: unit === "°C" ? "Temperature unavailable" : "Humidity unavailable",
      historical: false,
    };
  }

  if (band.stage === "unknown") {
    return {
      band,
      value: v,
      stale,
      classification: "stage_unknown",
      label: `${STAGE_LABEL.unknown} — set stage for ${unit === "°C" ? "temperature" : "humidity"} guidance`,
      historical: stale,
    };
  }

  if (band.contextOnly || band.min === null || band.max === null) {
    return {
      band,
      value: v,
      stale,
      classification: "context_only",
      label: `${STAGE_LABEL[band.stage]} — ${unit === "°C" ? "temperature" : "humidity"} shown as context only`,
      historical: stale,
    };
  }

  const lo = band.min - deadband;
  const hi = band.max + deadband;
  let classification: EnvClassification;
  if (v < lo) classification = "below_target";
  else if (v > hi) classification = "above_target";
  else classification = "in_target";

  const stageLabel = STAGE_LABEL[band.stage];
  const metricLabel = unit === "°C" ? "temperature" : "RH";
  const base =
    classification === "in_target"
      ? `In ${stageLabel} ${metricLabel} range`
      : classification === "below_target"
        ? `Below ${stageLabel} ${metricLabel} range`
        : `Above ${stageLabel} ${metricLabel} range`;

  return {
    band,
    value: v,
    stale,
    classification,
    label: stale ? `${base} (historical, stale reading)` : base,
    historical: stale,
  };
}

export function classifyTempAgainstStage(
  tempC: number | null | undefined,
  opts: { stage: string | null | undefined | EnvStage; stale?: boolean },
): EnvClassificationResult {
  return classify(getTempTargetBand(opts.stage), tempC, !!opts.stale, "°C", TEMP_DEADBAND_C);
}

export function classifyRhAgainstStage(
  rhPercent: number | null | undefined,
  opts: { stage: string | null | undefined | EnvStage; stale?: boolean },
): EnvClassificationResult {
  return classify(getRhTargetBand(opts.stage), rhPercent, !!opts.stale, "%", RH_DEADBAND_PCT);
}

/** MetricChip-compatible status mapping. Stale -> warn (never "ok"). */
export function environmentMetricChipStatus(
  result: EnvClassificationResult,
): "ok" | "warn" | "bad" {
  if (result.stale) return "warn";
  switch (result.classification) {
    case "in_target":
      return "ok";
    case "below_target":
    case "above_target":
      return "warn";
    case "unavailable":
    case "stage_unknown":
    case "context_only":
    default:
      return "warn";
  }
}
