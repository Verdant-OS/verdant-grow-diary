/**
 * Pure helper that derives a stage-aware "Why this alert?" context from a
 * persisted environment alert row, reusing the canonical stage band helpers.
 *
 * Strict constraints:
 *   - No I/O. No Supabase. No React. No AI. No automation. No device control.
 *   - No alert writes. No Action Queue writes. No prescriptive copy.
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

export interface AlertWhyContextOnly {
  kind: "context_only";
  metric: AlertWhyMetric;
  stage: EnvStage;
  stageLabel: string;
  /** Compact display string, e.g. "Harvest stage — VPD shown as context only.". */
  text: string;
}

export type AlertWhyContext =
  | AlertWhyStageContext
  | AlertWhyContextOnly
  | AlertWhyUnavailable;

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

/**
 * Loose stage parser for legacy alerts whose title/reason pre-dates the
 * canonical "<stage> range" wording. Scans for any stage token with word
 * boundaries; "drying" maps to the harvest context-only stage. Returns null
 * when no stage token is detected so callers fall back to "unavailable".
 */
function parseStageLoose(text: string): EnvStage | null {
  // Order matters: longer / more specific needles first.
  const stages: { needle: RegExp; key: EnvStage }[] = [
    { needle: /\blate[\s_-]?flower(ing)?\b/, key: "late_flower" },
    { needle: /\bpre[\s_-]?flower(ing)?\b/, key: "preflower" },
    { needle: /\bseedling\b/, key: "seedling" },
    { needle: /\bflower(ing)?\b/, key: "flower" },
    { needle: /\bveg(etative|etation)?\b/, key: "veg" },
    { needle: /\b(harvest(ed)?|drying|cure|curing)\b/, key: "harvest" },
  ];
  const r = text.toLowerCase();
  for (const s of stages) if (s.needle.test(r)) return s.key;
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
  const metric = (alert.metric ?? "").toLowerCase();
  const isStageAware = /stage range/i.test(alert.title);

  // Stage source: canonical "<stage> range" tail first; for legacy VPD
  // alerts, fall back to a loose stage scan over title + reason so the
  // detailed view can still show the canonical VPD band.
  let stage = parseStageFromReason(alert.reason ?? "");
  if (!stage && metric === "vpd") {
    stage = parseStageLoose(`${alert.title} ${alert.reason ?? ""}`);
  } else if (!isStageAware) {
    // Non-VPD legacy alerts keep prior behavior — no stage band derivation.
    return UNAVAILABLE;
  }
  if (!stage || stage === "unknown") return UNAVAILABLE;
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
    if (band.contextOnly || band.min === null || band.max === null) {
      // Harvest / drying — no breach band; render context-only copy.
      return {
        kind: "context_only",
        metric: "vpd",
        stage,
        stageLabel,
        text: `${stageLabel} stage — VPD shown as context only.`,
      };
    }
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
