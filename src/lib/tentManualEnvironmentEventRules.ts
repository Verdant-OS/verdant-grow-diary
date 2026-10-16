/**
 * Tent-page readers for Quick Log V2 manual sensor snapshots.
 *
 * Quick Log V2 stores a manual snapshot only as a grow_events row
 * (event_type "environment", source "manual") plus its environment_events
 * child; nothing is written to sensor_readings or to
 * diary_entries.details.manual_sensor_snapshot. The tent page's manual
 * snapshot history list and timeline section read those older shapes, so a
 * snapshot saved seconds earlier counted as "none". These pure helpers
 * project the V2 rows into the shapes those readers already understand.
 */
import { validateManualSnapshot } from "@/lib/manualSensorSnapshotRules";
import type { ManualSnapshotRecord } from "@/lib/manualSensorSnapshotViewModel";

export const TENT_MANUAL_ENV_EVENT_SOURCE = "manual" as const;

/** Columns the tent readers select from `grow_events`. */
export const TENT_MANUAL_ENV_EVENT_SELECT =
  "id, plant_id, tent_id, occurred_at, event_type, source, is_deleted, environment_events ( temperature_c, humidity_pct, vpd_kpa )";

/** Max manual environment events either tent reader loads. */
export const TENT_MANUAL_ENV_EVENT_LIMIT = 50;

type NumericLike = number | string | null | undefined;

interface EnvironmentChild {
  temperature_c?: NumericLike;
  humidity_pct?: NumericLike;
  vpd_kpa?: NumericLike;
}

/** Loose shape of a `grow_events` row as returned by the select above. */
export interface TentManualEnvEventRow {
  id?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  occurred_at?: string | null;
  event_type?: string | null;
  source?: string | null;
  is_deleted?: boolean | null;
  environment_events?: EnvironmentChild | EnvironmentChild[] | null;
}

export interface TentManualEnvironmentEvent {
  id: string;
  tentId: string;
  plantId: string | null;
  occurredAt: string;
  temperatureC: number | null;
  humidityPct: number | null;
  vpdKpa: number | null;
}

/** Change-context row shape consumed by the manual snapshot history list. */
export interface TentManualEnvChangeContextRow {
  ts: string;
  metric: "temperature_c" | "humidity_pct" | "vpd_kpa";
  value: number;
  source: typeof TENT_MANUAL_ENV_EVENT_SOURCE;
  tent_id: string;
}

function finiteOrNull(v: NumericLike): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstChild(child: TentManualEnvEventRow["environment_events"]): EnvironmentChild | null {
  if (!child) return null;
  if (Array.isArray(child)) return child[0] ?? null;
  return child;
}

export function parseTentManualEnvironmentEvents(
  rows: ReadonlyArray<TentManualEnvEventRow | null | undefined> | null | undefined,
): TentManualEnvironmentEvent[] {
  const out: TentManualEnvironmentEvent[] = [];
  for (const row of rows ?? []) {
    if (!row || typeof row.id !== "string" || row.id === "") continue;
    if (row.is_deleted === true) continue;
    if (row.source !== TENT_MANUAL_ENV_EVENT_SOURCE || row.event_type !== "environment") continue;
    if (typeof row.tent_id !== "string" || row.tent_id === "") continue;
    if (typeof row.occurred_at !== "string" || Number.isNaN(Date.parse(row.occurred_at))) continue;
    const env = firstChild(row.environment_events);
    const temperatureC = finiteOrNull(env?.temperature_c);
    const humidityPct = finiteOrNull(env?.humidity_pct);
    const vpdKpa = finiteOrNull(env?.vpd_kpa);
    if (temperatureC === null && humidityPct === null && vpdKpa === null) continue;
    out.push({
      id: row.id,
      tentId: row.tent_id,
      plantId: typeof row.plant_id === "string" && row.plant_id !== "" ? row.plant_id : null,
      occurredAt: row.occurred_at,
      temperatureC,
      humidityPct,
      vpdKpa,
    });
  }
  return out;
}

export function manualEnvironmentEventsToChangeContextRows(
  events: ReadonlyArray<TentManualEnvironmentEvent>,
): TentManualEnvChangeContextRow[] {
  const out: TentManualEnvChangeContextRow[] = [];
  for (const ev of events) {
    const metrics: Array<[TentManualEnvChangeContextRow["metric"], number | null]> = [
      ["temperature_c", ev.temperatureC],
      ["humidity_pct", ev.humidityPct],
      ["vpd_kpa", ev.vpdKpa],
    ];
    for (const [metric, value] of metrics) {
      if (value === null) continue;
      out.push({
        ts: ev.occurredAt,
        metric,
        value,
        source: TENT_MANUAL_ENV_EVENT_SOURCE,
        tent_id: ev.tentId,
      });
    }
  }
  return out;
}

export function manualEnvironmentEventsToSnapshotRecords(
  events: ReadonlyArray<TentManualEnvironmentEvent>,
): ManualSnapshotRecord[] {
  const out: ManualSnapshotRecord[] = [];
  for (const ev of events) {
    const validation = validateManualSnapshot({
      airTemp: ev.temperatureC,
      airTempUnit: "C",
      humidityPct: ev.humidityPct,
      vpdKpa: ev.vpdKpa,
    });
    if (validation.metrics.length === 0 && validation.errors.length === 0) continue;
    out.push({
      id: ev.id,
      capturedAt: ev.occurredAt,
      tentId: ev.tentId,
      plantId: ev.plantId,
      notes: null,
      validation,
    });
  }
  return out;
}

/** The part of a React Query result the tent history read needs. */
export interface TentHistorySourceRead<T> {
  status: "pending" | "error" | "success";
  isFetching: boolean;
  data: ReadonlyArray<T> | undefined;
  refetch: () => unknown;
}

export interface TentManualHistoryReadView<S> {
  readings: Array<S | TentManualEnvChangeContextRow>;
  readStatus: "pending" | "error" | "success";
  isFetching: boolean;
  onRetry: () => void;
}

/**
 * The tent page's manual snapshot history merges sensor_readings rows with
 * Quick Log V2 grow_events rows, so its read state must cover both reads.
 * Either failed read is an error; otherwise either unsettled read (including a
 * paused first read) is pending; only two successful reads may establish an
 * empty or complete history. Retry refetches both sources.
 */
export function buildTentManualHistoryRead<S>(input: {
  sensor: TentHistorySourceRead<S>;
  manual: TentHistorySourceRead<TentManualEnvironmentEvent>;
}): TentManualHistoryReadView<S> {
  const { sensor, manual } = input;
  const readStatus =
    sensor.status === "error" || manual.status === "error"
      ? "error"
      : sensor.status === "pending" || manual.status === "pending"
        ? "pending"
        : "success";
  return {
    readings: [
      ...(sensor.data ?? []),
      ...manualEnvironmentEventsToChangeContextRows(manual.data ?? []),
    ],
    readStatus,
    isFetching: sensor.isFetching || manual.isFetching,
    onRetry: () => {
      void sensor.refetch();
      void manual.refetch();
    },
  };
}
