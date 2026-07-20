/**
 * blueprintMetricRules — pure evaluation of a single live/logged reading
 * against its per-stage "Pro Blueprint" target band, producing a
 * green / amber / red traffic-light classification.
 *
 * Contract:
 *   - Pure. No I/O, no React, no Supabase, no fetch.
 *   - No automation, no device control, no alert writes, no Action Queue.
 *   - Stage MUST be known. Unknown / unsupported stage returns
 *     `stage_unknown` and is NEVER healthy.
 *   - Missing/invalid value returns `unavailable`; a metric with no band for
 *     the stage returns `no_target`. Neither is ever healthy.
 *
 * Stage handling (aligned with the LIVE app stack):
 *   - Stage is normalized with `normalizeVpdStage` (src/lib/vpdStageTargetRules.ts),
 *     the same normalizer the per-plant/tent VPD panel uses, so the real
 *     `plants.stage` values (seedling | veg | flower | flush | harvest | cure)
 *     map correctly (flush → late_flower, harvest & cure → harvest). The dead
 *     `normalizeToCanonicalVpdTargetStage` path is intentionally NOT used — it
 *     rejects flush/harvest/cure.
 *   - VPD is single-sourced from `getVpdTargetBand`; the other six metrics come
 *     from `SOP_BLUEPRINT_TARGETS`.
 *   - Temperature is day/night aware: pass `isDay` (from the tent's `light.on`).
 *     When `isDay` is unknown, the day and night bands are merged into the
 *     widest permissive range so an unknown light state never false-alarms.
 *
 * Amber zone: a reading just outside the band (within `warnMargin` of the edge,
 * as a fraction of band width) is `warn_low` / `warn_high` (amber); further out
 * is `out_low` / `out_high` (red); inside is `in_band` (green, the only healthy
 * state).
 *
 * See: docs/spec-pro-blueprint-overlay.md
 */

import {
  SOP_BLUEPRINT_TARGETS,
  type BlueprintStageBands,
  type BlueprintTargetStage,
  type DayNightBand,
  type MetricBand,
} from "@/constants/blueprintTargets";
import { getVpdTargetBand, normalizeVpdStage, type VpdStage } from "@/lib/vpdStageTargetRules";

/** The seven metrics the Blueprint overlay scores. */
export type BlueprintMetricKey = "tempC" | "rh" | "vpdKpa" | "ec" | "ph" | "ppfd" | "dli";

export type BlueprintClassification =
  | "in_band"
  | "warn_low"
  | "warn_high"
  | "out_low"
  | "out_high"
  | "stage_unknown"
  | "no_target"
  | "unavailable";

/** Presentation tone; derived from the classification. */
export type BlueprintTone = "green" | "amber" | "red" | "neutral";

export interface BlueprintMetricResult {
  classification: BlueprintClassification;
  /** The band the value was scored against, or null when none applied. */
  band: MetricBand | null;
  tone: BlueprintTone;
  /** True only when classification === "in_band". */
  healthy: boolean;
}

/**
 * Fraction of a band's width, on each edge, treated as the amber "warn" zone
 * once a reading crosses outside the band. e.g. 0.15 → a reading up to 15% of
 * the band width past an edge is amber; beyond that is red.
 */
export const DEFAULT_WARN_MARGIN = 0.15;

/**
 * Classify a single numeric reading against one band. Band edges are
 * inclusive (a value equal to min or max is `in_band`).
 */
export function classifyReadingAgainstBand(
  value: number | null | undefined,
  band: MetricBand | null | undefined,
  warnMargin: number = DEFAULT_WARN_MARGIN,
): BlueprintMetricResult {
  if (!band) {
    return { classification: "no_target", band: null, tone: "neutral", healthy: false };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { classification: "unavailable", band, tone: "neutral", healthy: false };
  }

  const width = band.max - band.min;
  const margin = width > 0 ? width * Math.max(0, warnMargin) : 0;

  if (value < band.min) {
    return band.min - value <= margin
      ? { classification: "warn_low", band, tone: "amber", healthy: false }
      : { classification: "out_low", band, tone: "red", healthy: false };
  }
  if (value > band.max) {
    return value - band.max <= margin
      ? { classification: "warn_high", band, tone: "amber", healthy: false }
      : { classification: "out_high", band, tone: "red", healthy: false };
  }
  return { classification: "in_band", band, tone: "green", healthy: true };
}

/** Pick the day or night temp band; merge to the widest range when unknown. */
export function resolveDayNightBand(
  band: DayNightBand,
  isDay: boolean | null | undefined,
): MetricBand {
  if (isDay === true) return band.day;
  if (isDay === false) return band.night;
  // Unknown light state → widest permissive range so we never false-alarm.
  return {
    min: Math.min(band.day.min, band.night.min),
    max: Math.max(band.day.max, band.night.max),
  };
}

export interface ResolveBlueprintBandOptions {
  isDay?: boolean | null;
  bands?: Record<BlueprintTargetStage, BlueprintStageBands>;
}

/**
 * Resolve the target band for a metric at a normalized stage.
 * VPD comes from `getVpdTargetBand` (single source of truth; null when the
 * stage is context-only, e.g. harvest). Temperature is day/night aware. The
 * other metrics come from the Blueprint band table. Returns null when no band
 * applies (metric not targeted for that stage, or stage is "unknown").
 */
export function resolveBlueprintBand(
  stage: VpdStage,
  metricKey: BlueprintMetricKey,
  options: ResolveBlueprintBandOptions = {},
): MetricBand | null {
  if (stage === "unknown") return null;
  const bands = options.bands ?? SOP_BLUEPRINT_TARGETS;

  if (metricKey === "vpdKpa") {
    const target = getVpdTargetBand(stage);
    if (target.contextOnly || target.min === null || target.max === null) return null;
    return { min: target.min, max: target.max };
  }

  const stageBands = bands[stage];
  if (!stageBands) return null;

  if (metricKey === "tempC") {
    return stageBands.tempC ? resolveDayNightBand(stageBands.tempC, options.isDay) : null;
  }
  return stageBands[metricKey] ?? null;
}

export interface EvaluateBlueprintMetricInput {
  stage: string | null | undefined;
  metricKey: BlueprintMetricKey;
  value: number | null | undefined;
  /** Tent light state (from `tents.light_on`) for day/night temp bands. */
  isDay?: boolean | null;
  /** Override band table (defaults to `SOP_BLUEPRINT_TARGETS`). */
  bands?: Record<BlueprintTargetStage, BlueprintStageBands>;
  warnMargin?: number;
}

/**
 * Stage-aware entry point: normalize the stage (via the live `normalizeVpdStage`),
 * resolve the band for the metric, and classify the reading. Unknown stage →
 * `stage_unknown`.
 */
export function evaluateBlueprintMetric(
  input: EvaluateBlueprintMetricInput,
): BlueprintMetricResult {
  const stage = normalizeVpdStage(input.stage);
  if (stage === "unknown") {
    return { classification: "stage_unknown", band: null, tone: "neutral", healthy: false };
  }
  const band = resolveBlueprintBand(stage, input.metricKey, {
    isDay: input.isDay,
    bands: input.bands,
  });
  return classifyReadingAgainstBand(input.value, band, input.warnMargin);
}
