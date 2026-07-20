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
 *   - Stage is normalized to the canonical six-stage vocabulary via
 *     `normalizeToCanonicalVpdTargetStage`. The legacy → canonical mapping
 *     table is NOT duplicated here.
 *
 * Design:
 *   - Generalizes `evaluateVpdAgainstStageTarget` (which is binary in/out)
 *     to any metric, adding an AMBER band: a reading just outside the target
 *     (within `warnMargin` of the edge, as a fraction of band width) is
 *     `warn_low` / `warn_high` (amber); further out is `out_low` / `out_high`
 *     (red); inside the band is `in_band` (green, the only healthy state).
 *   - VPD is single-sourced from `VPD_STAGE_TARGETS` (see `resolveBlueprintBand`)
 *     so it is never forked into a second band set. The other six metrics come
 *     from `SOP_BLUEPRINT_TARGETS`.
 *
 * See: docs/spec-pro-blueprint-overlay.md
 */

import {
  SOP_BLUEPRINT_TARGETS,
  type BlueprintStageBands,
  type MetricBand,
} from "@/constants/blueprintTargets";
import { VPD_STAGE_TARGETS } from "@/constants/vpdTargets";
import {
  normalizeToCanonicalVpdTargetStage,
  type CanonicalVpdTargetStage,
} from "@/lib/vpdStageNormalizationRules";

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

const NEUTRAL_TONE_BY_CLASSIFICATION: Partial<Record<BlueprintClassification, BlueprintTone>> = {
  stage_unknown: "neutral",
  no_target: "neutral",
  unavailable: "neutral",
};

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
    return {
      classification: "no_target",
      band: null,
      tone: NEUTRAL_TONE_BY_CLASSIFICATION.no_target ?? "neutral",
      healthy: false,
    };
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      classification: "unavailable",
      band,
      tone: "neutral",
      healthy: false,
    };
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

/**
 * Resolve the target band for a metric at a canonical stage.
 * VPD comes from `VPD_STAGE_TARGETS` (single source of truth); the other six
 * come from the provided Blueprint band table (defaults to `SOP_BLUEPRINT_TARGETS`).
 * Returns null when no band is defined for that metric/stage.
 */
export function resolveBlueprintBand(
  stage: CanonicalVpdTargetStage,
  metricKey: BlueprintMetricKey,
  bands: Record<CanonicalVpdTargetStage, BlueprintStageBands> = SOP_BLUEPRINT_TARGETS,
): MetricBand | null {
  if (metricKey === "vpdKpa") {
    const target = VPD_STAGE_TARGETS[stage];
    return target ? { min: target.minKpa, max: target.maxKpa } : null;
  }
  return bands[stage]?.[metricKey] ?? null;
}

export interface EvaluateBlueprintMetricInput {
  stage: string | null | undefined;
  metricKey: BlueprintMetricKey;
  value: number | null | undefined;
  /** Override band table (defaults to `SOP_BLUEPRINT_TARGETS`). */
  bands?: Record<CanonicalVpdTargetStage, BlueprintStageBands>;
  warnMargin?: number;
}

/**
 * Stage-aware entry point: normalize the stage, resolve the band for the
 * metric, and classify the reading. Unknown stage → `stage_unknown`.
 */
export function evaluateBlueprintMetric(
  input: EvaluateBlueprintMetricInput,
): BlueprintMetricResult {
  const normalized = normalizeToCanonicalVpdTargetStage(input.stage);
  if (!normalized.known) {
    return {
      classification: "stage_unknown",
      band: null,
      tone: "neutral",
      healthy: false,
    };
  }
  const band = resolveBlueprintBand(
    normalized.canonical,
    input.metricKey,
    input.bands ?? SOP_BLUEPRINT_TARGETS,
  );
  return classifyReadingAgainstBand(input.value, band, input.warnMargin);
}
