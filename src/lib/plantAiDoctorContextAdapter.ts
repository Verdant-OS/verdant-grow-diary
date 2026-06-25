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

export interface PlantAiDoctorAdapterInput {
  plant: PlantRowLike | null;
  diaryEntries: readonly DiaryEntryRowLike[];
  manualSensorLogs: readonly ManualSensorLogLike[];
  now?: Date;
}

/** °F → °C, rounded to 2 decimals; null-safe. */
export function fahrenheitToCelsius(f: number | null | undefined): number | null {
  if (f === null || f === undefined || !Number.isFinite(f)) return null;
  return Math.round(((f - 32) * (5 / 9)) * 100) / 100;
}

export function diaryEntriesToGrowEventRows(
  rows: readonly DiaryEntryRowLike[],
): GrowEventRowLike[] {
  const out: GrowEventRowLike[] = [];
  for (const r of rows) {
    if (!r?.entry_at) continue;
    out.push({
      occurred_at: r.entry_at,
      event_type: r.entry_type ?? "diary_entry",
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
    if (
      typeof log.metrics?.ph === "number" &&
      Number.isFinite(log.metrics.ph)
    ) {
      out.push({
        metric: "ph",
        value: log.metrics.ph,
        unit: "pH",
        captured_at: log.capturedAt,
        source: tagSource,
      });
    }
    if (
      typeof log.metrics?.ec === "number" &&
      Number.isFinite(log.metrics.ec)
    ) {
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

/**
 * Build an AI Doctor context payload from RLS-safe Plant Detail sources.
 * Pure and deterministic for a given input + `now`.
 */
export function buildPlantAiDoctorContext(
  input: PlantAiDoctorAdapterInput,
): PlantContextPayload {
  return compilePlantContextFromRows({
    plant: input.plant,
    growEvents: diaryEntriesToGrowEventRows(input.diaryEntries ?? []),
    sensorReadings: manualSensorLogsToReadingRows(input.manualSensorLogs ?? []),
    now: input.now,
  });
}
