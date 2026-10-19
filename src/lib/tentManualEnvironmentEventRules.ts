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
  metric: "temperature_c" | "humidity_pct" | "vpd_kpa" | "reservoir_ph" | "reservoir_ec_ms_cm";
  value: number;
  source: typeof TENT_MANUAL_ENV_EVENT_SOURCE;
  tent_id: string;
  /**
   * The grow_events id (or diary_entries id for a diary snapshot), so
   * same-instant saves are not merged into one snapshot.
   */
  snapshot_id: string;
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
        snapshot_id: ev.id,
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

/**
 * The grow_events id a Quick Log diary companion mirrors, read from
 * `details.linked_grow_event_id` or `details.grow_event_id` (the same two
 * keys quicklog_save_manual matches). Null for any other diary row.
 */
export function diaryRowMirroredGrowEventId(details: unknown): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) return null;
  const d = details as Record<string, unknown>;
  for (const k of ["linked_grow_event_id", "grow_event_id"]) {
    const v = d[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
  }
  return null;
}

/** Fields of a fetched diary row the mirror match reads. */
export interface TentManualMirrorDiaryRow {
  details: unknown;
  tent_id: string | null;
  plant_id: string | null;
  entry_at: string;
}

function siblingKey(tentId: unknown, plantId: unknown, iso: unknown): string | null {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const t = typeof tentId === "string" ? tentId : "";
  const p = typeof plantId === "string" ? plantId : "";
  return `${t}|${p}|${ms}`;
}

function hasManualSensorSnapshot(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  const snap = (details as { manual_sensor_snapshot?: unknown }).manual_sensor_snapshot;
  return !!snap && typeof snap === "object" && (snap as { source?: unknown }).source === "manual";
}

function snapshotNumber(details: unknown, key: string): number | null {
  const snap = (details as { manual_sensor_snapshot?: Record<string, unknown> })
    .manual_sensor_snapshot;
  const v = snap?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** 0.01 °C storage rounding is 0.018 °F; humidity is stored as typed. */
const MIRROR_TEMP_F_TOLERANCE = 0.15;
const MIRROR_RH_TOLERANCE = 0.05;

/**
 * True when the event carries exactly the readings the mirror recorded: the
 * mirror and the event have the same temperature and humidity metrics
 * present (the save adapter parses both from one input, so a real sibling
 * always does), every present metric agrees (°C converted to °F), and at
 * least one metric is comparable. A partial overlap is a different save.
 */
function eventMatchesMirrorValues(ev: TentManualEnvironmentEvent, details: unknown): boolean {
  // The Plant Quick Log adapter always sends an empty VPD and the RPC stores
  // it as passed, so a real sibling never carries VPD.
  if (ev.vpdKpa !== null) return false;
  let compared = 0;
  const tempF = snapshotNumber(details, "temp_f");
  if ((tempF === null) !== (ev.temperatureC === null)) return false;
  if (tempF !== null && ev.temperatureC !== null) {
    compared += 1;
    if (Math.abs((ev.temperatureC * 9) / 5 + 32 - tempF) > MIRROR_TEMP_F_TOLERANCE) return false;
  }
  const rh = snapshotNumber(details, "humidity_percent");
  if ((rh === null) !== (ev.humidityPct === null)) return false;
  if (rh !== null && ev.humidityPct !== null) {
    compared += 1;
    if (Math.abs(ev.humidityPct - rh) > MIRROR_RH_TOLERANCE) return false;
  }
  return compared > 0;
}

/**
 * A sensor-bearing Plant Quick Log save writes a parent action grow_event, a
 * sibling `environment` grow_event, and a diary mirror that keeps
 * `details.manual_sensor_snapshot` and links the PARENT id
 * (`linked_grow_event_id`), never the environment id. quicklog_save_manual
 * writes all three with the same tent_id, plant_id and occurred_at /
 * entry_at, and the repo already treats that exact (tent, plant, instant)
 * triple as the environment-sibling identity (connectedOneTentActivationRules).
 *
 * So a fetched, linked Quick Log mirror carrying a manual snapshot claims the
 * one environment event that shares its (tent_id, plant_id, instant) and its
 * readings. The mirror card is kept, with its note and pH/EC, exactly as the timeline
 * showed it before grow_events were read. An event whose id the mirror links
 * directly is also dropped. Input order is preserved.
 */
export function dropEventsMirroredByDiaryRows<E extends TentManualEnvironmentEvent>(
  events: ReadonlyArray<E>,
  diaryRows: ReadonlyArray<TentManualMirrorDiaryRow | null | undefined>,
): E[] {
  // Each mirror claims at most ONE environment event: the one it links by
  // id, else the one same-(tent, plant, instant) event whose readings match
  // its snapshot (lowest id on an exact tie). Another manual save at the
  // same instant is never dropped, and a mismatch drops nothing.
  const claimed = new Set<string>();
  const byId = [...events].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const row of diaryRows) {
    if (!row) continue;
    const linked = diaryRowMirroredGrowEventId(row.details);
    if (!linked || !hasManualSensorSnapshot(row.details)) continue;
    const direct = byId.find((ev) => ev.id === linked && !claimed.has(ev.id));
    if (direct) {
      claimed.add(direct.id);
      continue;
    }
    const key = siblingKey(row.tent_id, row.plant_id, row.entry_at);
    if (!key) continue;
    const sibling = byId.find(
      (ev) =>
        !claimed.has(ev.id) &&
        siblingKey(ev.tentId, ev.plantId, ev.occurredAt) === key &&
        eventMatchesMirrorValues(ev, row.details),
    );
    if (sibling) claimed.add(sibling.id);
  }
  if (claimed.size === 0) return [...events];
  return events.filter((ev) => !claimed.has(ev.id));
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
  /** Quick Log diary snapshots; a pH/EC-only save exists only here. */
  diary?: TentHistorySourceRead<TentManualHistoryDiaryRow>;
}): TentManualHistoryReadView<S> {
  const { sensor, manual, diary } = input;
  const reads = diary ? [sensor, manual, diary] : [sensor, manual];
  const readStatus = reads.some((r) => r.status === "error")
    ? "error"
    : reads.some((r) => r.status === "pending")
      ? "pending"
      : "success";
  const diaryRows = diary?.data ?? [];
  return {
    readings: [
      ...(sensor.data ?? []),
      ...manualEnvironmentEventsToChangeContextRows(
        dropEventsMirroredByDiaryRows(manual.data ?? [], diaryRows),
      ),
      ...diarySnapshotsToChangeContextRows(diaryRows),
    ],
    readStatus,
    isFetching: reads.some((r) => r.isFetching),
    onRetry: () => {
      for (const r of reads) void r.refetch();
    },
  };
}

/** A fetched diary row whose `details.manual_sensor_snapshot` may feed the history. */
export interface TentManualHistoryDiaryRow extends TentManualMirrorDiaryRow {
  id: string;
}

/**
 * Project Quick Log diary snapshots into history rows. The persisted shape is
 * `temp_f`, `humidity_percent`, `ph`, `ec`; `ec` is reservoir EC in mS/cm
 * (manualSnapshotDiaryAdapter), never soil EC. Values stay as entered so the
 * history list's realism check can flag a bad one.
 */
export function diarySnapshotsToChangeContextRows(
  rows: ReadonlyArray<TentManualHistoryDiaryRow | null | undefined>,
): TentManualEnvChangeContextRow[] {
  const out: TentManualEnvChangeContextRow[] = [];
  for (const row of rows) {
    if (!row || typeof row.id !== "string" || !row.id) continue;
    if (typeof row.tent_id !== "string" || !row.tent_id) continue;
    if (typeof row.entry_at !== "string" || !Number.isFinite(Date.parse(row.entry_at))) continue;
    if (!hasManualSensorSnapshot(row.details)) continue;
    const tempF = snapshotNumber(row.details, "temp_f");
    const metrics: Array<[TentManualEnvChangeContextRow["metric"], number | null]> = [
      ["temperature_c", tempF === null ? null : ((tempF - 32) * 5) / 9],
      ["humidity_pct", snapshotNumber(row.details, "humidity_percent")],
      ["reservoir_ph", snapshotNumber(row.details, "ph")],
      ["reservoir_ec_ms_cm", snapshotNumber(row.details, "ec")],
    ];
    for (const [metric, value] of metrics) {
      if (value === null) continue;
      out.push({
        ts: row.entry_at,
        metric,
        value,
        source: TENT_MANUAL_ENV_EVENT_SOURCE,
        tent_id: row.tent_id,
        snapshot_id: row.id,
      });
    }
  }
  return out;
}
