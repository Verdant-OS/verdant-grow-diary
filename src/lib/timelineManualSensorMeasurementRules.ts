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

const NON_SENSOR_MEASUREMENT_DETAIL_KEYS: ReadonlySet<string> = new Set([
  "ph",
  "ec",
  "runoff",
  "watering",
]);

function asDetailRecord(
  details: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  return details;
}

function readDrawerSensorSnapshotObject(
  details: Record<string, unknown> | null,
): Record<string, unknown> | null {
  if (!details) return null;
  // Same keys as timelineEvidenceDetailViewModel.readSensor — that is
  // the object the drawer uses for the "Stale snapshot" badge.
  for (const key of ["sensor_snapshot", "sensor"] as const) {
    const raw = details[key];
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return raw as Record<string, unknown>;
    }
  }
  return null;
}

function readTimelineSensorSnapshotObject(
  details: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const drawerSnap = readDrawerSensorSnapshotObject(details);
  if (drawerSnap) return drawerSnap;
  if (!details) return null;
  const raw = details.manual_sensor_snapshot;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function snapshotCapturedAtIso(
  entry: { entry_at?: string | null },
  snap: Record<string, unknown> | null,
): string | null {
  for (const value of [snap?.ts, snap?.captured_at, entry.entry_at]) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function snapshotSourceKind(
  details: Record<string, unknown> | null,
  snap: Record<string, unknown> | null,
): string {
  const raw = snap?.source ?? details?.source;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

/**
 * Same age rule as Timeline list cards (`sensor_snapshot` / `sensor` /
 * `manual_sensor_snapshot`, then `ts` / `captured_at` / `entry_at`) and
 * the evidence drawer "Stale snapshot" badge (`LIVE_CURRENT_STATE_STALE_MS`).
 *
 * Quick Log persist shape is `details.manual_sensor_snapshot` with no
 * `ts` — the list ages those rows off `entry_at`. Membership must use that
 * same object, not only the drawer's `sensor_snapshot`/`sensor` keys.
 * Missing capture time is stale — never guessed fresh.
 */
export function timelineEntryWouldBadgeStaleSnapshot(
  entry: {
    entry_at?: string | null;
    details?: Record<string, unknown> | null;
  },
  now: Date,
): boolean {
  const details = asDetailRecord(entry.details ?? null);
  const snap = readTimelineSensorSnapshotObject(details);
  if (!snap) return false;
  const capturedAt = snapshotCapturedAtIso(entry, snap);
  if (!capturedAt) return true;
  return !isTimelineManualSensorReceiptFresh(capturedAt, now);
}

function hasNonSensorMeasurementDetails(details: Record<string, unknown> | null): boolean {
  if (!details) return false;
  return Object.keys(details).some((key) => NON_SENSOR_MEASUREMENT_DETAIL_KEYS.has(key));
}

/**
 * Manual sensor snapshot rows (projected receipts or diary-shaped copies).
 * Watering / pH / EC / runoff keys stay ordinary Measurements even when an
 * attached snapshot is stale.
 */
export function isTimelineManualSensorMeasurementRow(entry: {
  id?: string | null;
  details?: Record<string, unknown> | null;
}): boolean {
  if (isTimelineSensorDerivedDiaryId(entry.id)) return true;
  const details = asDetailRecord(entry.details ?? null);
  if (hasNonSensorMeasurementDetails(details)) return false;
  const snap = readTimelineSensorSnapshotObject(details);
  const source = snapshotSourceKind(details, snap);
  if (source === "live" || source === "csv" || source === "demo") return false;
  if (snap) return source === "" || source === "manual";
  const eventType =
    typeof details?.event_type === "string" ? details.event_type.toLowerCase().trim() : "";
  return MEASUREMENT_EVENT_TYPES.has(eventType);
}

/**
 * Grow Timeline Measurements membership. Evidence alone is not enough:
 * manuals the drawer would badge "Stale snapshot" must not appear there.
 */
export function diaryEntryBelongsInTimelineMeasurements(
  entry: {
    id?: string | null;
    details?: Record<string, unknown> | null;
    note?: string | null;
    entry_at?: string | null;
  },
  now: Date = new Date(),
): boolean {
  if (!diaryEntryHasMeasurementEvidence(entry)) return false;
  if (
    isTimelineManualSensorMeasurementRow(entry) &&
    timelineEntryWouldBadgeStaleSnapshot(entry, now)
  ) {
    return false;
  }
  return true;
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

    const receipt: TimelineManualSensorReceipt = {
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
    };
    // Re-check the built snapshot ts the drawer reads, not only grouped status.
    if (!diaryEntryBelongsInTimelineMeasurements(receipt, now)) continue;
    receipts.push(receipt);
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
