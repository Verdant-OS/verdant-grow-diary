/**
 * plantAiDoctorContextAdapter — pure mapping from RLS-safe Plant Detail
 * row sources into the row inputs expected by
 * `compileAiDoctorContextFromRows`.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no fetch, no Action Queue writes.
 *  - Never fabricates sensor data.
 *  - Manual sensor logs are tagged `manual` so demo/live confusion is impossible.
 *  - Temperature conversion uses simple deterministic math (°F → °C).
 */

import {
  compilePlantContextFromRows,
  type PlantContextPayload,
  type GrowEventRowLike,
  type SensorReadingRowLike,
  type PlantRowLike,
} from "@/lib/aiDoctorContextCompiler";
import { resolveCanonicalDiaryEventType } from "@/lib/diaryTimelineViewModel";
import type { ManualSensorLog } from "@/lib/manualSensorChronologyDeltaRules";
import { isSensorTestbenchRow } from "@/lib/sensorTestbenchIndicatorRules";

/** Permissive shape covering the diary_entries fields we read. */
export interface DiaryEntryRowLike {
  id?: string | null;
  entry_at?: string | null;
  entry_type?: string | null;
  note?: string | null;
  details?: unknown;
  source?: string | null;
}

/** Subset of ManualSensorLog used as a sensor-reading source. */
export interface ManualSensorLogLike {
  id?: string | null;
  capturedAt: string;
  source: string;
  metrics: {
    temp_f?: number | null;
    humidity_percent?: number | null;
    ph?: number | null;
    ec?: number | null;
  };
}

/** Tent-scoped `sensor_readings` row used as plant Doctor context. */
export interface TentManualSensorRowLike {
  tent_id?: unknown;
  source?: unknown;
  quality?: unknown;
  metric?: unknown;
  value?: unknown;
  captured_at?: unknown;
  ts?: unknown;
  created_at?: unknown;
  raw_payload?: unknown;
}

export interface PlantAiDoctorAdapterInput {
  plant: PlantRowLike | null;
  diaryEntries: readonly DiaryEntryRowLike[];
  manualSensorLogs: readonly ManualSensorLogLike[];
  /**
   * Assigned-tent manual `sensor_readings`. Used when the grower saved at
   * tent scope and no plant-level diary snapshot exists yet.
   */
  tentSensorRows?: readonly TentManualSensorRowLike[] | null;
  tentId?: string | null;
  now?: Date;
}

/** °F → °C, rounded to 2 decimals; null-safe. */
export function fahrenheitToCelsius(f: number | null | undefined): number | null {
  if (f === null || f === undefined || !Number.isFinite(f)) return null;
  return Math.round((f - 32) * (5 / 9) * 100) / 100;
}

export function diaryEntriesToGrowEventRows(
  rows: readonly DiaryEntryRowLike[],
): GrowEventRowLike[] {
  const out: GrowEventRowLike[] = [];
  for (const r of rows) {
    if (!r?.entry_at) continue;
    out.push({
      occurred_at: r.entry_at,
      event_type: resolveCanonicalDiaryEventType({
        entryType: r.entry_type,
        details: r.details,
      }),
      source: r.source ?? "manual",
      note: r.note ?? null,
    });
  }
  return out;
}

export function manualSensorLogsToReadingRows(
  logs: readonly ManualSensorLogLike[],
): SensorReadingRowLike[] {
  const out: SensorReadingRowLike[] = [];
  for (const log of logs) {
    if (!log?.capturedAt) continue;
    const tagSource = "manual";
    const tempC = fahrenheitToCelsius(log.metrics?.temp_f ?? null);
    if (tempC !== null) {
      out.push({
        metric: "temperature_c",
        value: tempC,
        unit: "C",
        captured_at: log.capturedAt,
        source: tagSource,
      });
    }
    if (
      typeof log.metrics?.humidity_percent === "number" &&
      Number.isFinite(log.metrics.humidity_percent)
    ) {
      out.push({
        metric: "humidity_pct",
        value: log.metrics.humidity_percent,
        unit: "%",
        captured_at: log.capturedAt,
        source: tagSource,
      });
    }
    if (typeof log.metrics?.ph === "number" && Number.isFinite(log.metrics.ph)) {
      out.push({
        metric: "ph",
        value: log.metrics.ph,
        unit: "pH",
        captured_at: log.capturedAt,
        source: tagSource,
      });
    }
    if (typeof log.metrics?.ec === "number" && Number.isFinite(log.metrics.ec)) {
      out.push({
        metric: "ec",
        value: log.metrics.ec,
        unit: "mS/cm",
        captured_at: log.capturedAt,
        source: tagSource,
      });
    }
  }
  return out;
}

function tentRowTimestamp(row: TentManualSensorRowLike): string | null {
  const raw = row.captured_at ?? row.ts ?? row.created_at;
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  return Number.isFinite(Date.parse(raw)) ? raw : null;
}

function tentRowHasUsableQuality(row: TentManualSensorRowLike): boolean {
  if (row.quality === null || row.quality === undefined) return true;
  return typeof row.quality === "string" && row.quality.trim().toLowerCase() === "ok";
}

function tentMetricKey(row: TentManualSensorRowLike): string {
  return typeof row.metric === "string" ? row.metric.trim().toLowerCase() : "";
}

function tentFiniteValue(row: TentManualSensorRowLike): number | null {
  if (row.value === null || row.value === undefined) return null;
  if (typeof row.value === "string" && row.value.trim().length === 0) return null;
  const n = typeof row.value === "number" ? row.value : Number(row.value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Project assigned-tent manual `sensor_readings` into compiler rows.
 * Never relabels them as live. Ignores other tents, testbench packets,
 * and explicit non-ok quality.
 */
export function tentManualSensorRowsToReadingRows(
  rows: readonly TentManualSensorRowLike[] | null | undefined,
  tentId: string | null | undefined,
): SensorReadingRowLike[] {
  const expectedTent = typeof tentId === "string" ? tentId.trim() : "";
  if (!expectedTent) return [];
  const out: SensorReadingRowLike[] = [];
  for (const row of rows ?? []) {
    if (!row || isSensorTestbenchRow(row)) continue;
    if (row.tent_id !== expectedTent) continue;
    if (row.source !== "manual") continue;
    if (!tentRowHasUsableQuality(row)) continue;
    const captured_at = tentRowTimestamp(row);
    const value = tentFiniteValue(row);
    if (!captured_at || value === null) continue;
    const metric = tentMetricKey(row);
    if (metric === "temperature_c") {
      out.push({ metric: "temperature_c", value, unit: "C", captured_at, source: "manual" });
    } else if (metric === "temp_f" || metric === "temperature_f") {
      const tempC = fahrenheitToCelsius(value);
      if (tempC !== null) {
        out.push({
          metric: "temperature_c",
          value: tempC,
          unit: "C",
          captured_at,
          source: "manual",
        });
      }
    } else if (metric === "humidity_pct" || metric === "humidity") {
      out.push({ metric: "humidity_pct", value, unit: "%", captured_at, source: "manual" });
    } else if (metric === "vpd_kpa" || metric === "vpd") {
      out.push({ metric: "vpd_kpa", value, unit: "kPa", captured_at, source: "manual" });
    } else if (metric === "ph") {
      out.push({ metric: "ph", value, unit: "pH", captured_at, source: "manual" });
    } else if (metric === "ec") {
      out.push({ metric: "ec", value, unit: "mS/cm", captured_at, source: "manual" });
    }
  }
  return out;
}

/**
 * Group tent-scoped manual rows into plant-audit logs so a just-saved
 * tent snapshot is visible as sensor context for the assigned plant.
 */
export function tentManualSensorRowsToPlantSensorLogs(
  rows: readonly TentManualSensorRowLike[] | null | undefined,
  tentId: string | null | undefined,
): ManualSensorLog[] {
  const expectedTent = typeof tentId === "string" ? tentId.trim() : "";
  if (!expectedTent) return [];
  const groups = new Map<string, ManualSensorLog["metrics"]>();
  for (const row of rows ?? []) {
    if (!row || isSensorTestbenchRow(row)) continue;
    if (row.tent_id !== expectedTent) continue;
    if (row.source !== "manual") continue;
    if (!tentRowHasUsableQuality(row)) continue;
    const capturedAt = tentRowTimestamp(row);
    const value = tentFiniteValue(row);
    if (!capturedAt || value === null) continue;
    const metric = tentMetricKey(row);
    let metrics = groups.get(capturedAt);
    if (!metrics) {
      metrics = {};
      groups.set(capturedAt, metrics);
    }
    if (metric === "temperature_c") {
      metrics.temp_f = Math.round((value * 9) / 5 + 32);
    } else if (metric === "temp_f" || metric === "temperature_f") {
      metrics.temp_f = value;
    } else if (metric === "humidity_pct" || metric === "humidity") {
      metrics.humidity_percent = value;
    } else if (metric === "ph") {
      metrics.ph = value;
    } else if (metric === "ec") {
      metrics.ec = value;
    }
  }
  return [...groups.entries()].map(([capturedAt, metrics]) => ({
    capturedAt,
    source: "manual",
    metrics,
  }));
}

export function mergePlantAndTentManualSensorLogs(
  plantLogs: readonly ManualSensorLog[] | null | undefined,
  tentLogs: readonly ManualSensorLog[] | null | undefined,
): ManualSensorLog[] {
  return [...(tentLogs ?? []), ...(plantLogs ?? [])];
}

function mergeCompilerSensorReadings(
  plantRows: readonly SensorReadingRowLike[],
  tentRows: readonly SensorReadingRowLike[],
): SensorReadingRowLike[] {
  const seen = new Set<string>();
  const out: SensorReadingRowLike[] = [];
  for (const row of [...plantRows, ...tentRows]) {
    const key = `${String(row.captured_at ?? "")}\0${String(row.metric ?? "")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/**
 * Build an AI Doctor context payload from RLS-safe Plant Detail sources.
 * Pure and deterministic for a given input + `now`.
 */
export function buildPlantAiDoctorContext(input: PlantAiDoctorAdapterInput): PlantContextPayload {
  const tentId = input.tentId ?? input.plant?.tent_id ?? null;
  return compilePlantContextFromRows({
    plant: input.plant,
    growEvents: diaryEntriesToGrowEventRows(input.diaryEntries ?? []),
    sensorReadings: mergeCompilerSensorReadings(
      manualSensorLogsToReadingRows(input.manualSensorLogs ?? []),
      tentManualSensorRowsToReadingRows(input.tentSensorRows, tentId),
    ),
    now: input.now,
  });
}
