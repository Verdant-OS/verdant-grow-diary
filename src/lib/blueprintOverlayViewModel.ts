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
 *
 * Missing metrics are surfaced as `provenance: "missing"` with a `nudge`
 * describing how to supply the reading — each a monetization/engagement hook,
 * never an implication that an absent metric is healthy.
 */

import {
  SOP_BLUEPRINT_TARGETS,
  type BlueprintStageBands,
  type MetricBand,
} from "@/constants/blueprintTargets";
import {
  evaluateBlueprintMetric,
  type BlueprintMetricKey,
  type BlueprintMetricResult,
} from "@/lib/blueprintMetricRules";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import {
  normalizeToCanonicalVpdTargetStage,
  type CanonicalVpdTargetStage,
} from "@/lib/vpdStageNormalizationRules";

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
  bands?: Record<CanonicalVpdTargetStage, BlueprintStageBands>;
  warnMargin?: number;
}

interface MetricMeta {
  key: BlueprintMetricKey;
  label: string;
  unit: string;
  missingNudge: string;
}

/**
 * Display order + labels/units. Live-capable environment first, then light,
 * then root zone — so the metrics most growers actually have score at the top.
 */
const METRIC_META: readonly MetricMeta[] = [
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

const STAGE_LABELS: Record<CanonicalVpdTargetStage, string> = {
  seedling: "Seedling",
  early_veg: "Early veg",
  late_veg: "Late veg",
  early_flower: "Early flower",
  mid_late_flower: "Mid–late flower",
  ripening: "Ripening",
};

const STAGE_UNKNOWN_LABEL = "Stage not set";

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

export function buildBlueprintOverlayViewModel(
  input: BuildBlueprintOverlayInput,
): BlueprintOverlayViewModel {
  const normalized = normalizeToCanonicalVpdTargetStage(input.stage);
  const stageKnown = normalized.known;
  const stageLabel = stageKnown ? STAGE_LABELS[normalized.canonical] : STAGE_UNKNOWN_LABEL;
  const bands = input.bands ?? SOP_BLUEPRINT_TARGETS;

  const summary: BlueprintOverlaySummary = { green: 0, amber: 0, red: 0, missing: 0 };

  const rows: BlueprintOverlayRow[] = METRIC_META.map((meta) => {
    const value = readValue(meta.key, input);
    const result = evaluateBlueprintMetric({
      stage: input.stage,
      metricKey: meta.key,
      value,
      bands,
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
    return row;
  });

  return { stageLabel, stageKnown, rows, summary };
}
