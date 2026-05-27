/**
 * Pure helper that derives a stage-aware "Why this alert?" context from a
 * persisted environment alert row, reusing the canonical stage band helpers.
 *
 * Strict constraints:
 *   - No I/O. No Supabase. No React. No AI. No automation. No device control.
 *   - No alert writes. No Action Queue writes. No nutrient suggestions.
 *   - Read-only mapping from (metric, title, reason) → display context.
 *
 * Derivation rules:
 *   - Only stage-aware alerts (title contains "stage range") produce a
 *     stage band; everything else returns `{ kind: "unavailable" }`.
 *   - Stage name is parsed from the persisted `reason` text written by
 *     `defaultEnvironmentThresholds`, then the corresponding band is read
 *     directly from `environmentStageTargetRules` / `vpdStageTargetRules`
 *     so display copy stays in sync with the rules layer.
 */
import {
  getTempTargetBand,
  getRhTargetBand,
  type EnvStage,
} from "@/lib/environmentStageTargetRules";
import { getVpdTargetBand, normalizeVpdStage } from "@/lib/vpdStageTargetRules";

export type AlertWhyMetric = "temp" | "rh" | "vpd";

export interface AlertWhyStageContext {
  kind: "stage";
  metric: AlertWhyMetric;
  stage: EnvStage;
  stageLabel: string;
  min: number;
  max: number;
  unit: "°C" | "%" | "kPa";
  /** Compact display string, e.g. "Veg target: 22–28°C". */
  text: string;
}

export interface AlertWhyUnavailable {
  kind: "unavailable";
  text: "Target context unavailable for this alert.";
}

export type AlertWhyContext = AlertWhyStageContext | AlertWhyUnavailable;

const UNAVAILABLE: AlertWhyUnavailable = {
  kind: "unavailable",
  text: "Target context unavailable for this alert.",
};

const STAGE_DISPLAY: Record<EnvStage, string> = {
  seedling: "Seedling",
  veg: "Veg",
  preflower: "Pre-flower",
  flower: "Flower",
  late_flower: "Late flower",
  harvest: "Harvest",
  unknown: "Stage unknown",
};

/**
 * Parse the persisted reason text for the stage label, written by
 * defaultEnvironmentThresholds as "... (<stage> range ...)".
 * Returns null when no stage-aware reason pattern is detected.
 */
function parseStageFromReason(reason: string): EnvStage | null {
  // Order matters: "late flower" must beat "flower".
  const stages: { needle: string; key: EnvStage }[] = [
    { needle: "late flower", key: "late_flower" },
    { needle: "pre-flower", key: "preflower" },
    { needle: "preflower", key: "preflower" },
    { needle: "seedling", key: "seedling" },
    { needle: "flower", key: "flower" },
    { needle: "veg", key: "veg" },
    { needle: "harvest", key: "harvest" },
  ];
  const r = reason.toLowerCase();
  for (const s of stages) {
    // Require the canonical "<stage> range" tail produced by the rules layer.
    if (r.includes(`${s.needle} range`)) return s.key;
  }
  return null;
}

function fmtTemp(v: number): string {
  return Number.isInteger(v) ? `${v}` : `${v.toFixed(1)}`;
}
function fmtRh(v: number): string {
  return Number.isInteger(v) ? `${v}` : `${v.toFixed(0)}`;
}
function fmtVpd(v: number): string {
  return v.toFixed(1);
}

export interface AlertLike {
  metric: string | null;
  title: string;
  reason: string;
}

export function deriveAlertWhyContext(alert: AlertLike): AlertWhyContext {
  if (!alert || typeof alert.title !== "string") return UNAVAILABLE;
  // Only stage-aware alerts encode the stage band in their reason text.
  if (!/stage range/i.test(alert.title)) return UNAVAILABLE;
  const stage = parseStageFromReason(alert.reason ?? "");
  if (!stage || stage === "unknown") return UNAVAILABLE;
  const metric = (alert.metric ?? "").toLowerCase();
  const stageLabel = STAGE_DISPLAY[stage];

  if (metric === "temp") {
    const band = getTempTargetBand(stage);
    if (band.min === null || band.max === null) return UNAVAILABLE;
    return {
      kind: "stage",
      metric: "temp",
      stage,
      stageLabel,
      min: band.min,
      max: band.max,
      unit: "°C",
      text: `${stageLabel} target: ${fmtTemp(band.min)}–${fmtTemp(band.max)}°C`,
    };
  }
  if (metric === "rh") {
    const band = getRhTargetBand(stage);
    if (band.min === null || band.max === null) return UNAVAILABLE;
    return {
      kind: "stage",
      metric: "rh",
      stage,
      stageLabel,
      min: band.min,
      max: band.max,
      unit: "%",
      text: `${stageLabel} RH target: ${fmtRh(band.min)}–${fmtRh(band.max)}%`,
    };
  }
  if (metric === "vpd") {
    const vstage = normalizeVpdStage(stage);
    const band = getVpdTargetBand(vstage);
    if (band.min === null || band.max === null) return UNAVAILABLE;
    return {
      kind: "stage",
      metric: "vpd",
      stage,
      stageLabel,
      min: band.min,
      max: band.max,
      unit: "kPa",
      text: `${stageLabel} VPD target: ${fmtVpd(band.min)}–${fmtVpd(band.max)} kPa`,
    };
  }
  return UNAVAILABLE;
}

/** Convenience prefix; used by both the compact and fuller renderings. */
export const WHY_PREFIX = "Why this alert?";
