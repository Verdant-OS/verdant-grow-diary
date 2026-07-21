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
  /** Extra context for the row (e.g. which temperature band applies). */
  context?: string;
}

/**
 * Metrics the unlocked overlay cannot currently SCORE, so the teaser must not
 * advertise them — previewing a band would promise per-reading scoring the paid
 * product can't yet deliver (an overclaim on a conversion surface). DLI is
 * hardcoded `dli: null` in the overlay input (PlantBlueprintOverlaySection)
 * because it needs PPFD samples + a stored timezone the schema does not carry.
 * Re-enable it here the moment DLI scoring is wired.
 */
const TEASER_UNSCOREABLE_METRICS: ReadonlySet<BlueprintMetricKey> = new Set(["dli"]);

/** Short day/night label for the temperature row, mirroring the overlay. */
function tempContext(isDay: boolean | null | undefined): string {
  if (isDay === true) return "Day";
  if (isDay === false) return "Night";
  return "Day + night";
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
      if (TEASER_UNSCOREABLE_METRICS.has(meta.key)) continue; // don't advertise what Craft can't score
      const band = resolveBlueprintBand(stage, meta.key, {
        isDay: input.isDay,
        bands: input.bands,
      });
      if (!band) continue; // metric not targeted at this stage → omit
      const row: BlueprintTeaserRow = {
        metricKey: meta.key,
        label: meta.label,
        unit: meta.unit,
        band,
      };
      if (meta.key === "tempC") row.context = tempContext(input.isDay);
      rows.push(row);
    }
  }

  return { stageLabel, stageKnown, rows, targetCount: rows.length };
}
