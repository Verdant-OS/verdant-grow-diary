/**
 * blueprintTeaserViewModel — pure view-model for the LOCKED-state Blueprint
 * teaser shown to non-Craft growers.
 *
 * The teaser turns the Craft paywall into a live conversion demo: it previews
 * the REAL per-stage SOP target bands for this plant's current stage — the same
 * bands the unlocked overlay scores readings against — without any live value
 * or green/amber/red scoring. The message is "here is exactly what Craft would
 * score your readings against."
 *
 * Contract:
 *   - Pure. No I/O, no React, no Supabase, no fetch. No gating (the container
 *     decides locked vs unlocked). No automation, no writes.
 *   - Band resolution goes through the SAME `resolveBlueprintBand` the unlocked
 *     overlay uses, so the teaser can never advertise a target that differs
 *     from what Craft actually scores against.
 *   - Only metrics that HAVE a target band for the stage are shown (e.g. Dry &
 *     cure previews just temperature + humidity) — never a "no target" filler.
 *
 * See: docs/spec-pro-blueprint-overlay.md
 */

import type {
  BlueprintStageBands,
  BlueprintTargetStage,
  MetricBand,
} from "@/constants/blueprintTargets";
import { resolveBlueprintBand, type BlueprintMetricKey } from "@/lib/blueprintMetricRules";
import { METRIC_META, STAGE_LABELS } from "@/lib/blueprintOverlayViewModel";
import { normalizeVpdStage } from "@/lib/vpdStageTargetRules";

export interface BlueprintTeaserRow {
  metricKey: BlueprintMetricKey;
  label: string;
  unit: string;
  band: MetricBand;
}

export interface BlueprintTeaserViewModel {
  stageLabel: string;
  /** False when the plant has no scoreable stage — nothing to preview yet. */
  stageKnown: boolean;
  rows: BlueprintTeaserRow[];
  /** Number of metrics with a target band at this stage. */
  targetCount: number;
}

export interface BuildBlueprintTeaserInput {
  stage: string | null | undefined;
  /** Tent light state (`tents.light_on`): true = day, false = night, null = unknown. */
  isDay?: boolean | null;
  /** Override band table (defaults to `SOP_BLUEPRINT_TARGETS`). */
  bands?: Record<BlueprintTargetStage, BlueprintStageBands>;
}

/**
 * Build the locked-state teaser rows: for each Blueprint metric (in the same
 * order as the unlocked overlay), the target band at this plant's stage. When
 * the stage is unknown, there is nothing to preview (`stageKnown: false`,
 * empty rows).
 */
export function buildBlueprintTeaserViewModel(
  input: BuildBlueprintTeaserInput,
): BlueprintTeaserViewModel {
  const stage = normalizeVpdStage(input.stage);
  const stageKnown = stage !== "unknown";
  const stageLabel = STAGE_LABELS[stage];

  const rows: BlueprintTeaserRow[] = [];
  if (stageKnown) {
    for (const meta of METRIC_META) {
      const band = resolveBlueprintBand(stage, meta.key, {
        isDay: input.isDay,
        bands: input.bands,
      });
      if (!band) continue; // metric not targeted at this stage → omit
      rows.push({ metricKey: meta.key, label: meta.label, unit: meta.unit, band });
    }
  }

  return { stageLabel, stageKnown, rows, targetCount: rows.length };
}
