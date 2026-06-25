/**
 * Manual Sensor Snapshot — recent history list rules.
 *
 * Pure helpers that turn a list of long-format `sensor_readings` rows into
 * a compact "recent manual snapshots" list for a single tent.
 *
 * Scope:
 *  - Pure. No React, no I/O, no DB client. Read-only derivation.
 *  - Only `source === "manual"` rows for the requested tent are considered.
 *    Demo, live, imported, and any ingestion-bridge sources are intentionally
 *    excluded — this surface is the manual entry history.
 *  - Each entry includes the change-context vs the immediately previous
 *    manual snapshot for the SAME tent (or `firstSnapshot=true` for the
 *    earliest entry shown).
 *  - Missing/invalid metrics are omitted, never guessed.
 *  - Deterministic ordering: list is newest-first, metric order is fixed
 *    by `HISTORY_METRIC_DISPLAY_ORDER`.
 */

import {
  buildManualSnapshotChangeContext,
  groupManualReadingsToSnapshots,
  type ChangeContextDelta,
  type ChangeContextMetric,
  type ChangeContextReading,
  type ChangeContextSnapshot,
  type ChangeContextSuppressedDelta,
} from "@/lib/manualSensorSnapshotChangeContextRules";
import { classifyManualMetric } from "@/lib/sensorTruthRules";
import { tempFFromC } from "@/lib/temperatureUnits";

/** Deterministic display order for the per-snapshot metric chips. */
export const HISTORY_METRIC_DISPLAY_ORDER: ChangeContextMetric[] = [
  "temperature_c",
  "humidity_pct",
  "vpd_kpa",
  "co2_ppm",
  "soil_moisture_pct",
  "soil_ec_ms_cm",
  "reservoir_ph",
];

export const DEFAULT_HISTORY_LIMIT = 5;
export const MIN_HISTORY_LIMIT = 3;
export const MAX_HISTORY_LIMIT = 5;

export interface HistoryMetricChip {
  key: ChangeContextMetric;
  label: string;
  formatted: string;
}

export interface HistoryInvalidChip {
  key: ChangeContextMetric;
  label: string;
  /** Short UI chip, e.g. "Invalid temp", "Unit mismatch suspected". */
  chip: string;
}

export interface ManualSnapshotHistoryEntry {
  ts: string;
  /** Valid (realism-passing) metric chips only. */
  metrics: HistoryMetricChip[];
  /** Per-snapshot invalid/suspicious chips. Empty when nothing flagged. */
  invalidChips: HistoryInvalidChip[];
  /** True when this entry has no comparable previous manual snapshot. */
  firstSnapshot: boolean;
  /** Deterministically ordered deltas vs previous manual snapshot. */
  deltas: ChangeContextDelta[];
  /** Deltas suppressed because either side failed realism guards. */
  suppressedDeltas: ChangeContextSuppressedDelta[];
}

function clampLimit(n: number | undefined): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.floor(n) : DEFAULT_HISTORY_LIMIT;
  if (v < MIN_HISTORY_LIMIT) return MIN_HISTORY_LIMIT;
  if (v > MAX_HISTORY_LIMIT) return MAX_HISTORY_LIMIT;
  return v;
}

const METRIC_LABEL: Record<ChangeContextMetric, string> = {
  temperature_c: "Temp",
  humidity_pct: "RH",
  vpd_kpa: "VPD",
  co2_ppm: "CO₂",
  soil_moisture_pct: "Soil",
  soil_ec_ms_cm: "Soil EC",
  reservoir_ph: "pH",
};

function formatMetricChip(
  key: ChangeContextMetric,
  value: number,
): HistoryMetricChip | null {
  if (!Number.isFinite(value)) return null;
  switch (key) {
    case "temperature_c": {
      const f = tempFFromC(value);
      if (f === null || !Number.isFinite(f)) return null;
      return { key, label: "Temp", formatted: `${f.toFixed(1)}°F` };
    }
    case "humidity_pct":
      return { key, label: "RH", formatted: `${Math.round(value)}%` };
    case "vpd_kpa":
      return { key, label: "VPD", formatted: `${value.toFixed(2)} kPa` };
    case "co2_ppm":
      return { key, label: "CO₂", formatted: `${Math.round(value)} ppm` };
    case "soil_moisture_pct":
      return { key, label: "Soil", formatted: `${Math.round(value)}%` };
    case "soil_ec_ms_cm":
      return { key, label: "Soil EC", formatted: `${value.toFixed(2)} mS/cm` };
    case "reservoir_ph":
      return { key, label: "pH", formatted: value.toFixed(2) };
  }
}

interface ChipsBreakdown {
  metrics: HistoryMetricChip[];
  invalidChips: HistoryInvalidChip[];
}

function chipsFromSnapshot(s: ChangeContextSnapshot): ChipsBreakdown {
  const metrics: HistoryMetricChip[] = [];
  const invalidChips: HistoryInvalidChip[] = [];
  const invalidKeys = new Set<ChangeContextMetric>();
  for (const key of HISTORY_METRIC_DISPLAY_ORDER) {
    const v = s.metrics[key];
    if (v === undefined) continue;
    const truth = classifyManualMetric(key, v);
    if (!truth.valid) {
      invalidKeys.add(key);
      invalidChips.push({
        key,
        label: METRIC_LABEL[key],
        chip: truth.chip ?? "Invalid value",
      });
      continue;
    }
    const chip = formatMetricChip(key, v);
    if (chip) metrics.push(chip);
  }
  // VPD depends on temp + rh; if either was invalid, also flag VPD as
  // invalid so we don't surface a derived "ghost" reading.
  if (
    (invalidKeys.has("temperature_c") || invalidKeys.has("humidity_pct")) &&
    s.metrics.vpd_kpa !== undefined &&
    !invalidKeys.has("vpd_kpa")
  ) {
    const idx = metrics.findIndex((m) => m.key === "vpd_kpa");
    if (idx !== -1) metrics.splice(idx, 1);
    invalidChips.push({ key: "vpd_kpa", label: "VPD", chip: "Invalid VPD" });
  }
  return { metrics, invalidChips };
}

/**
 * Build a newest-first list of recent manual snapshots for `tentId`, each
 * paired with its change context vs the previous manual snapshot for the
 * same tent. Returns at most `limit` (clamped to [3, 5]).
 */
export function buildManualSnapshotHistoryList(
  rows: ReadonlyArray<ChangeContextReading>,
  opts: { tentId: string | null | undefined; limit?: number },
): ManualSnapshotHistoryEntry[] {
  if (!opts.tentId) return [];
  const limit = clampLimit(opts.limit);
  const snapshots = groupManualReadingsToSnapshots(rows, { tentId: opts.tentId });
  if (snapshots.length === 0) return [];

  const sliced = snapshots.slice(0, limit);
  const out: ManualSnapshotHistoryEntry[] = [];
  for (let i = 0; i < sliced.length; i++) {
    const snap = sliced[i];
    const prev = snapshots[i + 1] ?? null;
    const ctx = buildManualSnapshotChangeContext({ latest: snap, previous: prev });
    const { metrics, invalidChips } = chipsFromSnapshot(snap);
    out.push({
      ts: snap.ts,
      metrics,
      invalidChips,
      firstSnapshot: ctx.firstSnapshot,
      deltas: ctx.deltas,
      suppressedDeltas: ctx.suppressedDeltas,
    });
  }
  return out;
}
