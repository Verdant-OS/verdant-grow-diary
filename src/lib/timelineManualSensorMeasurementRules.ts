/**
 * timelineManualSensorMeasurementRules — project tent `sensor_readings`
 * (source=manual) into Grow Timeline diary-shaped measurement receipts.
 *
 * Sensors Manual Snapshot persists only `sensor_readings`. Grow Timeline
 * Measurements historically read `diary_entries` only, so those rows never
 * appeared. This module is the read-side adapter: it does not insert diary
 * rows, grow_events, alerts, or Action Queue items.
 *
 * Pure: no I/O, no React, no Supabase.
 */
import { groupSensorReadingRows } from "@/lib/growAdapters";
import type { SensorReadingRow } from "@/lib/db";
import { hasManualHandheldReadings } from "@/lib/quickLogHistoryRules";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";
import { tempFFromC } from "@/lib/temperatureUnits";
import {
  MEASUREMENT_DETAIL_KEYS,
  MEASUREMENT_EVENT_TYPES,
} from "@/lib/timelineEntryClassification";

export const TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX = "sensor-reading:" as const;

export type TimelineManualSensorReceipt = {
  id: string;
  note: string;
  photo_url: null;
  stage: null;
  details: Record<string, unknown>;
  entry_at: string;
  plant_id: null;
  tent_id: string;
};

/** Narrow row shape Timeline may SELECT without `raw_payload` in page source. */
export type ManualSensorTimelineMetricRow = {
  tent_id: string;
  metric: string;
  value: number | string | null;
  source?: string | null;
  ts: string;
  captured_at?: string | null;
  quality?: string | null;
};

export function isTimelineSensorDerivedDiaryId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX);
}

/**
 * True when a diary-shaped row belongs in Grow Timeline Measurements.
 * Covers watering/pH keys, manual_sensor_snapshot envelopes, QL environment
 * event types, and handheld note blocks.
 */
export function diaryEntryHasMeasurementEvidence(entry: {
  details?: Record<string, unknown> | null;
  note?: string | null;
}): boolean {
  const details = entry?.details;
  if (details && typeof details === "object") {
    if (Object.keys(details).some((key) => MEASUREMENT_DETAIL_KEYS.has(key))) return true;
    const eventType =
      typeof details.event_type === "string" ? details.event_type.toLowerCase().trim() : "";
    if (MEASUREMENT_EVENT_TYPES.has(eventType)) return true;
  }
  return hasManualHandheldReadings(entry?.note ?? null);
}

/**
 * Persisted `sensor_readings.quality` allowed on a Timeline measurement
 * receipt. Missing / blank follows the #1328 default of `ok`.
 */
export function isTimelineManualSensorPersistedQualityUsable(
  quality: string | null | undefined,
): boolean {
  const normalized = (quality ?? "ok").trim().toLowerCase();
  return normalized === "ok" || normalized === "";
}

/**
 * Same current-state window Timeline cards and the evidence drawer use for
 * the "Stale snapshot" badge (`LIVE_CURRENT_STATE_STALE_MS`). A 4-hour-old
 * manual with quality=ok still trips that badge; Measurements must not list it.
 */
export function isTimelineManualSensorReceiptFresh(capturedAt: string, now: Date): boolean {
  const capturedMs = new Date(capturedAt).getTime();
  if (!Number.isFinite(capturedMs)) return false;
  return now.getTime() - capturedMs <= LIVE_CURRENT_STATE_STALE_MS;
}

function toSensorReadingRow(row: ManualSensorTimelineMetricRow): SensorReadingRow | null {
  const valueNum = typeof row.value === "number" ? row.value : Number(row.value);
  if (!Number.isFinite(valueNum) || !row.tent_id || !row.ts) return null;
  if (!isTimelineManualSensorPersistedQualityUsable(row.quality)) return null;
  return {
    id: "",
    tent_id: row.tent_id,
    metric: row.metric,
    value: valueNum,
    source: row.source ?? "manual",
    ts: row.ts,
    captured_at: row.captured_at ?? null,
    quality: row.quality ?? "ok",
    raw_payload: null,
    user_id: "",
    created_at: row.ts,
    device_id: null,
  };
}

function buildReceiptNote(input: {
  tempF: number | null;
  humidityPct: number | null;
  vpdKpa: number | null;
}): string {
  const parts: string[] = [];
  if (input.tempF !== null) parts.push(`${formatFinite(input.tempF)}°F`);
  if (input.humidityPct !== null) parts.push(`${formatFinite(input.humidityPct)}% RH`);
  if (input.vpdKpa !== null) parts.push(`${formatFinite(input.vpdKpa)} kPa VPD`);
  if (parts.length === 0) return "Manual sensor snapshot";
  return `Manual sensor snapshot: ${parts.join(", ")}`;
}

function formatFinite(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/**
 * Group per-metric manual `sensor_readings` into Timeline measurement receipts.
 * Live/csv/demo/stale/invalid sources are excluded. Groups with no observed
 * metrics are dropped. Never invents temperature or humidity.
 */
export function manualSensorReadingsToTimelineEntries(
  rows: readonly ManualSensorTimelineMetricRow[] | null | undefined,
  now: Date = new Date(),
): TimelineManualSensorReceipt[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const manualRows = rows.filter((row) => (row?.source ?? "").toLowerCase() === "manual");
  if (manualRows.length === 0) return [];

  const grouped = groupSensorReadingRows(
    manualRows.map(toSensorReadingRow).filter((row): row is SensorReadingRow => row !== null),
    now,
  );
  const receipts: TimelineManualSensorReceipt[] = [];

  for (const reading of grouped) {
    const observed = reading.observedMetrics ?? [];
    if (observed.length === 0) continue;
    if ((reading.source ?? "").toLowerCase() !== "manual") continue;

    const capturedAt = reading.capturedAt || reading.ts;
    if (!capturedAt || !reading.tentId) continue;
    if (reading.status !== "usable") continue;
    if (!isTimelineManualSensorReceiptFresh(capturedAt, now)) continue;

    const tempF = observed.includes("temp") ? tempFFromC(reading.temp) : null;
    const humidityPct = observed.includes("rh") ? reading.rh : null;
    const vpdKpa = observed.includes("vpd") ? reading.vpd : null;

    const snapshot: Record<string, unknown> = { source: "manual", ts: capturedAt };
    if (tempF !== null) snapshot.temp_f = tempF;
    if (humidityPct !== null) snapshot.humidity_percent = humidityPct;

    const sensorSnapshot: Record<string, unknown> = { source: "manual", ts: capturedAt };
    if (observed.includes("temp") && Number.isFinite(reading.temp)) {
      sensorSnapshot.temp_c = reading.temp;
    }
    if (humidityPct !== null) sensorSnapshot.rh = humidityPct;
    if (vpdKpa !== null) sensorSnapshot.vpd_kpa = vpdKpa;

    receipts.push({
      id: `${TIMELINE_MANUAL_SENSOR_RECEIPT_ID_PREFIX}${reading.tentId}:${capturedAt}`,
      note: buildReceiptNote({ tempF, humidityPct, vpdKpa }),
      photo_url: null,
      stage: null,
      details: {
        event_type: "measurement",
        source: "manual",
        tent_id: reading.tentId,
        manual_sensor_snapshot: snapshot,
        sensor_snapshot: sensorSnapshot,
      },
      entry_at: capturedAt,
      plant_id: null,
      tent_id: reading.tentId,
    });
  }

  return receipts.sort((a, b) => {
    const byTime = new Date(b.entry_at).getTime() - new Date(a.entry_at).getTime();
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}

/** Merge sensor-derived receipts with diary rows without duplicating ids. */
export function mergeTimelineMeasurementDisplayEntries<T extends { id: string; entry_at: string }>(
  diaryEntries: readonly T[],
  sensorReceipts: readonly T[],
): T[] {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const row of [...sensorReceipts, ...diaryEntries]) {
    if (!row?.id || seen.has(row.id)) continue;
    seen.add(row.id);
    merged.push(row);
  }
  return merged.sort((a, b) => {
    const byTime = new Date(b.entry_at).getTime() - new Date(a.entry_at).getTime();
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
}
