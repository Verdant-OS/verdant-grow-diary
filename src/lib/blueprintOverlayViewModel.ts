/**
 * blueprintOverlayViewModel — pure view-model that assembles the Pro Blueprint
 * overlay rows from the three real data sources, scoring each metric against
 * its per-stage SOP target band.
 *
 * Contract:
 *   - Pure. No I/O, no React, no Supabase, no fetch.
 *   - No automation, no device control, no alert/Action Queue writes.
 *   - Read-only derivation over injected inputs; fully unit-testable.
 *
 * Data sources (see docs/spec-pro-blueprint-overlay.md §2, metric provenance):
 *   - temp / rh / vpd / ppfd ← `SensorSnapshot` (temp/rh live via ECOWITT,
 *     vpd derived, ppfd manual/CSV).
 *   - ec / ph              ← latest `feeding_events` values (manually logged).
 *   - dli                  ← `aggregateDli()` result (derived; often absent).
 *   - isDay                ← the tent's `light.on` flag (`tents.light_on`),
 *     used to pick day vs night temperature bands.
 *
 * Stage is normalized with the live `normalizeVpdStage`, so real `plants.stage`
 * values (seedling | veg | flower | flush | harvest | cure) score correctly and
 * drying/curing plants (harvest) get real dry-room targets rather than
 * `stage_unknown`.
 *
 * Missing metrics are surfaced as `provenance: "missing"` with a `nudge`
 * describing how to supply the reading — a monetization/engagement hook, never
 * an implication that an absent metric is healthy.
 */

import type {
  BlueprintStageBands,
  BlueprintTargetStage,
  MetricBand,
} from "@/constants/blueprintTargets";
import {
  evaluateBlueprintMetric,
  type BlueprintMetricKey,
  type BlueprintMetricResult,
} from "@/lib/blueprintMetricRules";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import { normalizeVpdStage, type VpdStage } from "@/lib/vpdStageTargetRules";

export type BlueprintMetricProvenance = "live" | "manual" | "derived" | "missing";

export interface BlueprintOverlayRow {
  metricKey: BlueprintMetricKey;
  label: string;
  unit: string;
  value: number | null;
  band: MetricBand | null;
  result: BlueprintMetricResult;
  provenance: BlueprintMetricProvenance;
  /** Present only when the metric has no value yet — how to supply it. */
  nudge?: string;
  /** Extra context for the row (e.g. which temp band applied). */
  context?: string;
}

export interface BlueprintOverlaySummary {
  green: number;
  amber: number;
  red: number;
  /** Metrics that could not be scored (no value, no band, or unknown stage). */
  missing: number;
}

export interface BlueprintOverlayViewModel {
  stageLabel: string;
  stageKnown: boolean;
  /** Resolved day/night context: true = day, false = night, null = unknown. */
  isDay: boolean | null;
  rows: BlueprintOverlayRow[];
  summary: BlueprintOverlaySummary;
}

/** The subset of a full `SensorSnapshot` the overlay reads. */
export type BlueprintSnapshotInput = Pick<
  SensorSnapshot,
  "source" | "temp" | "rh" | "vpd" | "ppfd"
>;

export interface BuildBlueprintOverlayInput {
  stage: string | null | undefined;
  snapshot: BlueprintSnapshotInput | null | undefined;
  /** Latest logged feed values (from `feeding_events`). */
  latestFeeding: { ec: number | null; ph: number | null } | null | undefined;
  /** Computed daily light integral (`aggregateDli`), or null when unavailable. */
  dli: number | null | undefined;
  /** Tent light state (`tents.light_on`): true = day, false = night, null = unknown. */
  isDay?: boolean | null;
  bands?: Record<BlueprintTargetStage, BlueprintStageBands>;
  warnMargin?: number;
}

export interface MetricMeta {
  key: BlueprintMetricKey;
  label: string;
  unit: string;
  missingNudge: string;
}

/**
 * Display order + labels/units. Live-capable environment first, then light,
 * then root zone — so the metrics most growers actually have score at the top.
 *
 * Exported so the locked-state Blueprint teaser (blueprintTeaserViewModel)
 * renders the same metrics in the same order/labels as the unlocked overlay —
 * the teaser must preview EXACTLY what Craft scores against, never a divergent
 * list.
 */
export const METRIC_META: readonly MetricMeta[] = [
  {
    key: "vpdKpa",
    label: "VPD",
    unit: "kPa",
    missingNudge: "VPD needs live temperature and humidity.",
  },
  {
    key: "tempC",
    label: "Temperature",
    unit: "°C",
    missingNudge: "Connect an ECOWITT sensor to score temperature.",
  },
  {
    key: "rh",
    label: "Humidity",
    unit: "%",
    missingNudge: "Connect an ECOWITT sensor to score humidity.",
  },
  {
    key: "ppfd",
    label: "PPFD",
    unit: "µmol/m²/s",
    missingNudge: "Log a PPFD reading to score light intensity.",
  },
  {
    key: "dli",
    label: "DLI",
    unit: "mol/m²/day",
    missingNudge: "DLI needs at least two PPFD readings.",
  },
  { key: "ec", label: "EC", unit: "mS/cm", missingNudge: "Log a feed in Quick Log to score EC." },
  { key: "ph", label: "pH", unit: "", missingNudge: "Log a feed in Quick Log to score pH." },
];

export const STAGE_LABELS: Record<VpdStage, string> = {
  seedling: "Seedling",
  veg: "Veg",
  preflower: "Pre-flower",
  flower: "Flower",
  late_flower: "Late flower / flush",
  harvest: "Dry & cure",
  unknown: "Stage not set",
};

function readValue(
  metricKey: BlueprintMetricKey,
  input: BuildBlueprintOverlayInput,
): number | null {
  switch (metricKey) {
    case "vpdKpa":
      return input.snapshot?.vpd ?? null;
    case "tempC":
      return input.snapshot?.temp ?? null;
    case "rh":
      return input.snapshot?.rh ?? null;
    case "ppfd":
      return input.snapshot?.ppfd ?? null;
    case "dli":
      return input.dli ?? null;
    case "ec":
      return input.latestFeeding?.ec ?? null;
    case "ph":
      return input.latestFeeding?.ph ?? null;
  }
}

function provenanceFor(
  metricKey: BlueprintMetricKey,
  value: number | null,
  snapshotSource: SensorSnapshot["source"] | undefined,
): BlueprintMetricProvenance {
  if (value === null || !Number.isFinite(value)) return "missing";
  switch (metricKey) {
    case "vpdKpa":
    case "dli":
      return "derived";
    case "ppfd":
    case "ec":
    case "ph":
      return "manual";
    case "tempC":
    case "rh":
      // temp/rh are the only genuinely live-capable metrics; "live" requires
      // the snapshot to literally be a live reading, else it was logged.
      return snapshotSource === "live" ? "live" : "manual";
  }
}

function tempContext(isDay: boolean | null | undefined): string {
  if (isDay === true) return "Day target (lights on)";
  if (isDay === false) return "Night target (lights off)";
  return "Day/night range (set tent light state to narrow)";
}

export function buildBlueprintOverlayViewModel(
  input: BuildBlueprintOverlayInput,
): BlueprintOverlayViewModel {
  const stage = normalizeVpdStage(input.stage);
  const stageKnown = stage !== "unknown";
  const stageLabel = STAGE_LABELS[stage];
  const isDay = input.isDay ?? null;

  const summary: BlueprintOverlaySummary = { green: 0, amber: 0, red: 0, missing: 0 };

  const rows: BlueprintOverlayRow[] = METRIC_META.map((meta) => {
    const value = readValue(meta.key, input);
    const result = evaluateBlueprintMetric({
      stage: input.stage,
      metricKey: meta.key,
      value,
      isDay,
      bands: input.bands,
      warnMargin: input.warnMargin,
    });
    const provenance = provenanceFor(meta.key, value, input.snapshot?.source);

    switch (result.tone) {
      case "green":
        summary.green += 1;
        break;
      case "amber":
        summary.amber += 1;
        break;
      case "red":
        summary.red += 1;
        break;
      default:
        summary.missing += 1;
        break;
    }

    const row: BlueprintOverlayRow = {
      metricKey: meta.key,
      label: meta.label,
      unit: meta.unit,
      value,
      band: result.band,
      result,
      provenance,
    };
    if (provenance === "missing") {
      row.nudge = meta.missingNudge;
    }
    if (meta.key === "tempC" && stageKnown && result.band) {
      row.context = tempContext(isDay);
    }
    return row;
  });

  return { stageLabel, stageKnown, isDay, rows, summary };
}
