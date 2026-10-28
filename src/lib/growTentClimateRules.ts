/**
 * growTentClimateRules — pure logic for /guides/grow-tent-temperature-humidity-chart.
 *
 * Stage bands and the SVP/VPD formula are imported from the /vpd-chart rules
 * (`publicVpdChartRules`); this module never restates a band number. No React,
 * no I/O, no clock: callers pass `nowMs` into `shouldEmitThrottled`.
 */
import {
  PUBLIC_VPD_CHART_STAGES,
  calculatePublicVpdChartFromFahrenheit,
  publicVpdChartFahrenheitToCelsius,
  publicVpdChartOffsetFahrenheitToCelsius,
  publicVpdChartSaturationVaporPressureKpa,
  type PublicVpdChartStage,
  type PublicVpdChartStageId,
} from "@/lib/publicVpdChartRules";

export const GROW_TENT_CLIMATE_STAGES = PUBLIC_VPD_CHART_STAGES;
export const GROW_TENT_CLIMATE_DEFAULT_STAGE_ID: PublicVpdChartStageId = "veg";

export const GROW_TENT_CLIMATE_AIR_F_MIN = 50;
export const GROW_TENT_CLIMATE_AIR_F_MAX = 100;
export const GROW_TENT_CLIMATE_RH_MIN = 0;
export const GROW_TENT_CLIMATE_RH_MAX = 100;
export const GROW_TENT_CLIMATE_OFFSET_F_MIN = -10;
export const GROW_TENT_CLIMATE_OFFSET_F_MAX = 5;
export const GROW_TENT_CLIMATE_DEFAULT_OFFSET_F = -2;

/** climate_tool_checked fires at most once per this window. */
export const GROW_TENT_CLIMATE_CHECKED_THROTTLE_MS = 2000;

export function growTentClimateStageById(stageId: string | null | undefined): PublicVpdChartStage {
  const found = GROW_TENT_CLIMATE_STAGES.find((stage) => stage.id === stageId);
  return (
    found ?? GROW_TENT_CLIMATE_STAGES.find((s) => s.id === GROW_TENT_CLIMATE_DEFAULT_STAGE_ID)!
  );
}

/** Leaf VPD in kPa, rounded to 2 decimals, via the shared /vpd-chart formula. */
export function calculateGrowTentVpd(airF: number, rhPercent: number, leafOffsetF: number): number {
  return calculatePublicVpdChartFromFahrenheit(airF, rhPercent, leafOffsetF).vpdRounded;
}

export type GrowTentBandStatusCode = "below" | "in_band" | "above";

export interface GrowTentBandStatus {
  readonly code: GrowTentBandStatusCode;
  readonly shortLabel: "Below" | "Within" | "Above";
  readonly fullText: string;
}

export function evaluateGrowTentBandStatus(
  vpdRounded: number,
  stageId: string,
): GrowTentBandStatus {
  const band = growTentClimateStageById(stageId);
  const v = Number(vpdRounded.toFixed(2));
  if (v < band.min) {
    return {
      code: "below",
      shortLabel: "Below",
      fullText: `Below your ${band.name} band: air is on the humid side`,
    };
  }
  if (v > band.max) {
    return {
      code: "above",
      shortLabel: "Above",
      fullText: `Above your ${band.name} band: air is on the dry side`,
    };
  }
  return { code: "in_band", shortLabel: "Within", fullText: `Within your ${band.name} band` };
}

export interface GrowTentNudge {
  readonly rhWhole: number;
  readonly rawRh: number;
  readonly midpoint: number;
}

/** RH (clamped 0–100, whole %) that centres VPD on the stage band midpoint. */
export function calculateGrowTentNudgeRh(
  airF: number,
  leafOffsetF: number,
  stageId: string,
): GrowTentNudge {
  const band = growTentClimateStageById(stageId);
  const midpoint = (band.min + band.max) / 2;
  const airC = publicVpdChartFahrenheitToCelsius(airF);
  const leafC = airC + publicVpdChartOffsetFahrenheitToCelsius(leafOffsetF);
  const svpLeaf = publicVpdChartSaturationVaporPressureKpa(leafC);
  const svpAir = publicVpdChartSaturationVaporPressureKpa(airC);
  const solvedRh = ((svpLeaf - midpoint) / svpAir) * 100;
  const clamped = Math.max(0, Math.min(100, solvedRh));
  return { rhWhole: Math.round(clamped), rawRh: clamped, midpoint: Number(midpoint.toFixed(2)) };
}

export interface GrowTentClimateInputs {
  readonly valid: boolean;
  readonly airF: number;
  readonly rh: number;
  readonly offsetF: number;
  readonly stageId: PublicVpdChartStageId;
}

function parseFieldNumber(raw: string | null | undefined): number {
  const trimmed = (raw ?? "").trim();
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

function inRange(value: number, min: number, max: number): boolean {
  return Number.isFinite(value) && value >= min && value <= max;
}

/** Mirrors the source: every field required; air 50–100 °F, RH 0–100 %, offset −10…+5 °F. */
export function parseGrowTentClimateInputs(
  airRaw: string | null | undefined,
  rhRaw: string | null | undefined,
  offsetRaw: string | null | undefined,
  stageRaw: string | null | undefined,
): GrowTentClimateInputs {
  const airF = parseFieldNumber(airRaw);
  const rh = parseFieldNumber(rhRaw);
  const offsetF = parseFieldNumber(offsetRaw);
  const valid =
    inRange(airF, GROW_TENT_CLIMATE_AIR_F_MIN, GROW_TENT_CLIMATE_AIR_F_MAX) &&
    inRange(rh, GROW_TENT_CLIMATE_RH_MIN, GROW_TENT_CLIMATE_RH_MAX) &&
    inRange(offsetF, GROW_TENT_CLIMATE_OFFSET_F_MIN, GROW_TENT_CLIMATE_OFFSET_F_MAX);
  return { valid, airF, rh, offsetF, stageId: growTentClimateStageById(stageRaw).id };
}

/** True when an event may fire: never emitted, or at least `windowMs` since the last one. */
export function shouldEmitThrottled(
  lastEmittedAtMs: number | null,
  nowMs: number,
  windowMs: number = GROW_TENT_CLIMATE_CHECKED_THROTTLE_MS,
): boolean {
  if (lastEmittedAtMs === null) return true;
  return nowMs - lastEmittedAtMs >= windowMs;
}
