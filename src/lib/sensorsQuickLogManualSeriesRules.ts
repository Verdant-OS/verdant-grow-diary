/**
 * sensorsQuickLogManualSeriesRules — project Quick Log manuals into the
 * Sensors page series (wide SensorReading snapshots).
 *
 * Quick Log persist (`quicklog_save_manual`) writes grow_events +
 * environment_events and/or diary_entries.details.manual_sensor_snapshot.
 * It does not insert sensor_readings. Sensors historically charted only
 * sensor_readings, so a grower-logged tent snapshot could lag on an older
 * live/csv row. This module is the read-side join: no writes, no Timeline
 * membership changes, no Action Queue / device control.
 *
 * Pure: no I/O, no React, no Supabase. Time is injectable.
 */
import type { SensorReading, SensorReadingHealthStatus, SensorReadingMetricKey } from "@/mock";
import { isDiaryRowInTentScope } from "@/lib/diaryEvidenceTentScopeRules";
import {
  rawRowToQuickLogEnvironmentRow,
  type RawGrowEventRow,
} from "@/lib/quickLogGroupedTimelineRowAdapter";
import type { QuickLogV2EnvironmentRow } from "@/lib/quickLogV2ManualSnapshotAdapter";
import {
  classifySensorSnapshotStatus,
  type SensorSnapshotStatus,
} from "@/lib/sensorSnapshotStatusContract";
import { snapshotFromManualSensorSnapshot, type SensorSnapshot } from "@/lib/sensorSnapshot";
import {
  isHumidityValid,
  isTemperatureValid,
  isVpdValid,
} from "@/lib/sensorReadingNormalizationRules";
import { sortSensorReadingsNewestFirst } from "@/lib/sensorReadingSelectionRules";

export const SENSORS_QL_MANUAL_SERIES_SOURCE = "manual" as const;

export type SensorsQuickLogDiaryRow = {
  id?: string | null;
  tent_id?: string | null;
  entry_at?: string | null;
  details?: unknown;
};

function finiteOrNull(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function captureKey(reading: SensorReading): string {
  const captured = Date.parse(reading.capturedAt);
  const ts = Date.parse(reading.ts);
  const ms = Number.isFinite(captured) ? captured : ts;
  const stamp = Number.isFinite(ms) ? String(ms) : `${reading.capturedAt}|${reading.ts}`;
  return `${reading.tentId}|${stamp}`;
}

function deriveManualStatus(capturedAt: string, now: Date): SensorReadingHealthStatus {
  const result = classifySensorSnapshotStatus({
    rowsReceived: 1,
    rowsAccepted: 1,
    capturedAt,
    source: SENSORS_QL_MANUAL_SERIES_SOURCE,
    now,
  });
  return result.status as SensorSnapshotStatus;
}

function buildManualReading(input: {
  tentId: string;
  capturedAt: string;
  tempC: number | null;
  rh: number | null;
  vpd: number | null;
  now: Date;
}): SensorReading | null {
  const tentId = input.tentId.trim();
  if (!tentId) return null;
  if (!Number.isFinite(Date.parse(input.capturedAt))) return null;

  const observedMetrics: SensorReadingMetricKey[] = [];
  const reading: SensorReading = {
    ts: input.capturedAt,
    tentId,
    temp: 0,
    rh: 0,
    vpd: 0,
    co2: 0,
    soil: 0,
    observedMetrics,
    source: SENSORS_QL_MANUAL_SERIES_SOURCE,
    status: deriveManualStatus(input.capturedAt, input.now),
    capturedAt: input.capturedAt,
  };

  if (input.tempC !== null && isTemperatureValid(input.tempC)) {
    reading.temp = input.tempC;
    observedMetrics.push("temp");
  }
  if (input.rh !== null && isHumidityValid(input.rh)) {
    reading.rh = input.rh;
    observedMetrics.push("rh");
  }
  if (input.vpd !== null && isVpdValid(input.vpd)) {
    reading.vpd = input.vpd;
    observedMetrics.push("vpd");
  }
  if (observedMetrics.length === 0) return null;
  return reading;
}

function readingFromSnapshot(
  tentId: string,
  snap: SensorSnapshot,
  now: Date,
): SensorReading | null {
  if (snap.source !== "manual") return null;
  if (typeof snap.ts !== "string" || !snap.ts) return null;
  return buildManualReading({
    tentId,
    capturedAt: snap.ts,
    tempC: snap.temp,
    rh: snap.rh,
    vpd: snap.vpd,
    now,
  });
}

export function sensorReadingFromQuickLogEnvironmentRow(
  row: QuickLogV2EnvironmentRow | null | undefined,
  now: Date = new Date(),
): SensorReading | null {
  if (!row) return null;
  if (row.event_type !== "environment") return null;
  if (row.source !== SENSORS_QL_MANUAL_SERIES_SOURCE) return null;
  const tentId = typeof row.tent_id === "string" ? row.tent_id : "";
  return buildManualReading({
    tentId,
    capturedAt: row.occurred_at,
    tempC: finiteOrNull(row.environment?.temperature_c),
    rh: finiteOrNull(row.environment?.humidity_pct),
    vpd: finiteOrNull(row.environment?.vpd_kpa),
    now,
  });
}

export function sensorReadingFromQuickLogDiaryManual(
  row: SensorsQuickLogDiaryRow | null | undefined,
  tentId: string,
  now: Date = new Date(),
): SensorReading | null {
  if (!row) return null;
  if (!isDiaryRowInTentScope(row.tent_id, [tentId])) return null;
  const details = row.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const snap = snapshotFromManualSensorSnapshot(
    row.entry_at ?? null,
    (details as { manual_sensor_snapshot?: Record<string, unknown> }).manual_sensor_snapshot,
    { diaryEntryId: typeof row.id === "string" ? row.id : null },
  );
  if (!snap) return null;
  return readingFromSnapshot(tentId, snap, now);
}

export function collectSensorsQuickLogManualReadings(input: {
  tentId: string | null | undefined;
  growEvents?: ReadonlyArray<RawGrowEventRow | null | undefined> | null;
  diaryEntries?: ReadonlyArray<SensorsQuickLogDiaryRow | null | undefined> | null;
  now?: Date;
}): SensorReading[] {
  const tentId = typeof input.tentId === "string" ? input.tentId.trim() : "";
  if (!tentId) return [];
  const now = input.now ?? new Date();
  const out: SensorReading[] = [];

  for (const raw of input.growEvents ?? []) {
    if (!raw) continue;
    const env = rawRowToQuickLogEnvironmentRow(raw);
    const reading = sensorReadingFromQuickLogEnvironmentRow(env, now);
    if (reading && reading.tentId === tentId) out.push(reading);
  }

  for (const row of input.diaryEntries ?? []) {
    const reading = sensorReadingFromQuickLogDiaryManual(row, tentId, now);
    if (reading) out.push(reading);
  }

  return out;
}

function mergeCollidingManual(existing: SensorReading, incoming: SensorReading): SensorReading {
  const observed = new Set<SensorReadingMetricKey>(existing.observedMetrics ?? []);
  const next: SensorReading = { ...existing, observedMetrics: [...observed] };
  for (const metric of incoming.observedMetrics ?? []) {
    next[metric] = incoming[metric] as never;
    if (!observed.has(metric)) {
      observed.add(metric);
      next.observedMetrics = [...observed];
    }
  }
  next.source = SENSORS_QL_MANUAL_SERIES_SOURCE;
  next.status = incoming.status;
  return next;
}

/**
 * Union tent `sensor_readings` snapshots with Quick Log manuals.
 * Same tent + same capture millisecond: QL metrics win so the identity the
 * grower just logged is visible. Distinct older rows stay listed.
 */
export function mergeSensorsSeriesWithQuickLogManuals(
  tentReadings: readonly SensorReading[] | null | undefined,
  quickLogManuals: readonly SensorReading[] | null | undefined,
): SensorReading[] {
  const byKey = new Map<string, SensorReading>();
  for (const reading of tentReadings ?? []) {
    if (!reading) continue;
    byKey.set(captureKey(reading), { ...reading });
  }
  for (const reading of quickLogManuals ?? []) {
    if (!reading || reading.source !== SENSORS_QL_MANUAL_SERIES_SOURCE) continue;
    const key = captureKey(reading);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeCollidingManual(existing, reading) : { ...reading });
  }
  return sortSensorReadingsNewestFirst(Array.from(byKey.values()));
}
