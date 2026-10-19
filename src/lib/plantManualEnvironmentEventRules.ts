/**
 * plantManualEnvironmentEventRules — pure mapping of Quick Log V2 manual
 * environment readings for the Plant Detail readers.
 *
 * Quick Log V2 stores a manual temp/RH/VPD reading only as a `grow_events`
 * row (event_type "environment", source "manual") with an embedded
 * `environment_events` child (temperature_c, humidity_pct, vpd_kpa). The Plant
 * page readers historically looked only at `sensor_readings_effective` and
 * `diary_entries.details.manual_sensor_snapshot`, so these readings never
 * appeared there. This module maps those rows into the shapes those readers
 * already produce. One stored copy; readers adapt, the writer does not change.
 *
 * Contract:
 *  - Pure: no React, no Supabase, no clock.
 *  - Output is always labelled source "manual", never "live".
 *  - Observation time is `occurred_at`.
 *  - Rows with no finite value are skipped; missing metrics stay null and are
 *    never invented.
 *  - Celsius is the stored unit. The only conversion is °C → °F for the
 *    manual-sensor-memory shape, which is keyed `temp_f`.
 *  - Deterministic: newest first, `id` ascending as the tie-breaker.
 */
import type { LatestManualReading, ManualSensorMetric } from "@/lib/manualSensorFreshnessRules";
import { celsiusToFahrenheit } from "@/lib/temperatureUnits";
import {
  isHumidityValid,
  isTemperatureValid,
  isVpdValid,
} from "@/lib/sensorReadingNormalizationRules";

/** Keep a finite value only when the canonical sensor validity guard accepts it. */
function validOrNull(v: number | null, isValid: (n: number | null) => boolean): number | null {
  return v !== null && isValid(v) ? v : null;
}

export const PLANT_MANUAL_ENV_EVENT_SOURCE = "manual" as const;

/** Columns the plant readers select from `grow_events`. */
export const PLANT_MANUAL_ENV_EVENT_SELECT =
  "id, plant_id, tent_id, occurred_at, event_type, source, is_deleted, environment_events ( temperature_c, humidity_pct, vpd_kpa )";

/** Max manual environment events either plant reader loads. */
export const PLANT_MANUAL_ENV_EVENT_LIMIT = 50;

type NumericLike = number | string | null | undefined;

interface EnvironmentChild {
  temperature_c?: NumericLike;
  humidity_pct?: NumericLike;
  vpd_kpa?: NumericLike;
}

/** Loose shape of a `grow_events` row as returned by the select above. */
export interface PlantManualEnvEventRow {
  id?: string | null;
  plant_id?: string | null;
  tent_id?: string | null;
  occurred_at?: string | null;
  event_type?: string | null;
  source?: string | null;
  is_deleted?: boolean | null;
  environment_events?: EnvironmentChild | EnvironmentChild[] | null;
}

export interface PlantManualEnvironmentEvent {
  id: string;
  plantId: string | null;
  tentId: string | null;
  occurredAt: string;
  temperatureC: number | null;
  humidityPct: number | null;
  vpdKpa: number | null;
}

/** Same fields as `PlantTentReadingRow` in usePlantTentLatestReadings. */
export interface PlantManualEnvReadingRow {
  ts: string;
  captured_at?: string | null;
  metric: string;
  value: number | string | null;
  source: string | null;
  device_id?: string | null;
}

export type PlantManualLatestReadings = Record<ManualSensorMetric, LatestManualReading | null>;

function finiteOrNull(raw: NumericLike): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function firstChild(env: PlantManualEnvEventRow["environment_events"]): EnvironmentChild | null {
  if (!env) return null;
  if (Array.isArray(env))
    return env.length > 0 && env[0] && typeof env[0] === "object" ? env[0] : null;
  return typeof env === "object" ? env : null;
}

function observedMs(iso: string | null | undefined): number | null {
  if (typeof iso !== "string") return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Validate and normalise manual environment grow_events. Skips anything that
 * is not a live (non-deleted) manual environment row with a parseable time
 * and at least one finite value that passes the canonical validity guards. Sorted newest first, id ascending on ties.
 */
export function parsePlantManualEnvironmentEvents(
  rows: ReadonlyArray<PlantManualEnvEventRow | null | undefined> | null | undefined,
): PlantManualEnvironmentEvent[] {
  const out: PlantManualEnvironmentEvent[] = [];
  for (const row of rows ?? []) {
    if (!row || typeof row !== "object") continue;
    if (row.event_type !== "environment") continue;
    if (row.source !== PLANT_MANUAL_ENV_EVENT_SOURCE) continue;
    if (row.is_deleted === true) continue;
    if (typeof row.id !== "string" || row.id === "") continue;
    if (observedMs(row.occurred_at) === null) continue;
    const env = firstChild(row.environment_events);
    if (!env) continue;
    // Same canonical guards the Sensors Quick Log series uses: an implausible
    // value (e.g. a pre-band-guard historical row) is dropped, never shown or
    // converted as a usable manual reading.
    const temperatureC = validOrNull(finiteOrNull(env.temperature_c), isTemperatureValid);
    const humidityPct = validOrNull(finiteOrNull(env.humidity_pct), isHumidityValid);
    const vpdKpa = validOrNull(finiteOrNull(env.vpd_kpa), isVpdValid);
    if (temperatureC === null && humidityPct === null && vpdKpa === null) continue;
    out.push({
      id: row.id,
      plantId: typeof row.plant_id === "string" ? row.plant_id : null,
      tentId: typeof row.tent_id === "string" ? row.tent_id : null,
      occurredAt: row.occurred_at as string,
      temperatureC,
      humidityPct,
      vpdKpa,
    });
  }
  return out.sort((a, b) => {
    const diff = (observedMs(b.occurredAt) as number) - (observedMs(a.occurredAt) as number);
    if (diff !== 0) return diff;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Project manual environment events into per-metric reading rows matching the
 * `sensor_readings` vocabulary (temperature_c / humidity_pct / vpd_kpa).
 * Only metrics with a value produce a row.
 */
export function manualEnvironmentEventsToTentReadingRows(
  rows: ReadonlyArray<PlantManualEnvEventRow | null | undefined> | null | undefined,
): PlantManualEnvReadingRow[] {
  const out: PlantManualEnvReadingRow[] = [];
  for (const ev of parsePlantManualEnvironmentEvents(rows)) {
    const metrics: Array<[string, number | null]> = [
      ["temperature_c", ev.temperatureC],
      ["humidity_pct", ev.humidityPct],
      ["vpd_kpa", ev.vpdKpa],
    ];
    for (const [metric, value] of metrics) {
      if (value === null) continue;
      out.push({
        ts: ev.occurredAt,
        captured_at: ev.occurredAt,
        metric,
        value,
        source: PLANT_MANUAL_ENV_EVENT_SOURCE,
        device_id: null,
      });
    }
  }
  return out;
}

function rowObservedMs(row: PlantManualEnvReadingRow): number | null {
  return observedMs(row.captured_at) ?? observedMs(row.ts);
}

/**
 * Merge manual event rows into already-ordered sensor rows, newest observation
 * first. Sensor rows keep their relative order (the query's tie-breakers are
 * preserved); a manual row goes ahead of the first sensor row it is newer
 * than or observed at the same time as. Equal-time rows therefore resolve
 * explicitly in favour of the Quick Log manual row (as the Sensors series
 * does): readers that take the first row per metric at the latest time show
 * the manual value under the manual label, never a live/CSV value beside a
 * manual source. When a manual sensor_readings row shares a metric and
 * observation time with a Quick Log row, the Quick Log row wins and the
 * sensor row is dropped (identical values collapse to one row; differing
 * values never show the older sensor value), matching
 * mergeSensorsSeriesWithQuickLogManuals on the Sensors page. With no manual
 * rows the input array is returned unchanged.
 */
export function mergePlantTentReadingsWithManualEvents<T extends PlantManualEnvReadingRow>(
  sensorRows: ReadonlyArray<T>,
  manualRows: ReadonlyArray<PlantManualEnvReadingRow>,
): T[] {
  if (manualRows.length === 0) return sensorRows as T[];
  const quickLogKeys = new Set(manualRows.map((r) => `${r.metric}|${rowObservedMs(r)}`));
  const pending = manualRows;
  const out: T[] = [];
  let i = 0;
  for (const sensor of sensorRows) {
    if (
      sensor.source === PLANT_MANUAL_ENV_EVENT_SOURCE &&
      quickLogKeys.has(`${sensor.metric}|${rowObservedMs(sensor)}`)
    ) {
      continue;
    }
    const sensorMs = rowObservedMs(sensor) ?? -Infinity;
    while (i < pending.length && (rowObservedMs(pending[i]) as number) >= sensorMs) {
      out.push(pending[i] as T);
      i += 1;
    }
    out.push(sensor);
  }
  while (i < pending.length) {
    out.push(pending[i] as T);
    i += 1;
  }
  return out;
}

/**
 * Latest manual-sensor-memory values from environment events. Temperature is
 * converted °C → °F and rounded to 0.1 °F (the stored °C carries 2 decimals,
 * so finer °F digits would be conversion noise). pH and EC are not part of
 * the environment event and stay null.
 */
export function latestManualReadingsFromEnvironmentEvents(
  rows: ReadonlyArray<PlantManualEnvEventRow | null | undefined> | null | undefined,
): PlantManualLatestReadings {
  const out: PlantManualLatestReadings = {
    temp_f: null,
    humidity_percent: null,
    ph: null,
    ec: null,
  };
  for (const ev of parsePlantManualEnvironmentEvents(rows)) {
    if (out.temp_f === null && ev.temperatureC !== null) {
      const f = Math.round(celsiusToFahrenheit(ev.temperatureC) * 10) / 10;
      out.temp_f = { value: f, loggedAt: ev.occurredAt };
    }
    if (out.humidity_percent === null && ev.humidityPct !== null) {
      out.humidity_percent = { value: ev.humidityPct, loggedAt: ev.occurredAt };
    }
    if (out.temp_f !== null && out.humidity_percent !== null) break;
  }
  return out;
}

/**
 * Per metric, keep the newer of two latest-reading maps. Ties (or an
 * unparseable time on the right) keep the left value.
 */
export function mergeLatestManualReadings(
  left: PlantManualLatestReadings,
  right: PlantManualLatestReadings,
): PlantManualLatestReadings {
  const out = { ...left };
  for (const key of Object.keys(out) as ManualSensorMetric[]) {
    const a = left[key];
    const b = right[key];
    if (!b) continue;
    const bMs = observedMs(b.loggedAt);
    if (bMs === null) continue;
    if (!a) {
      out[key] = b;
      continue;
    }
    const aMs = observedMs(a.loggedAt);
    if (aMs === null || bMs > aMs) out[key] = b;
  }
  return out;
}

/** The part of a React Query result the plant environment read state needs. */
export interface PlantEnvironmentSourceRead {
  isError?: boolean;
  isPending?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  fetchStatus?: string;
  refetch: () => unknown;
}

export interface CombinedPlantEnvironmentRead {
  isError: boolean;
  isPending: boolean;
  isLoading: boolean;
  isFetching: boolean;
  fetchStatus: "paused" | "fetching" | "idle";
  /** Refetches every enabled source. */
  refetch: () => void;
}

/**
 * The plant environment surfaces merge sensor rows with Quick Log manual
 * rows, so their read state must cover both reads: either failed read is an
 * error, either paused read is paused, either unsettled read is loading or
 * refreshing, and Retry refetches both. A disabled manual read (no plant id;
 * react-query reports it pending and idle forever) is ignored. Cached rows
 * from either source stay visible; the read view labels them as cached.
 */
export function combinePlantEnvironmentReads(input: {
  sensor: PlantEnvironmentSourceRead;
  manual: PlantEnvironmentSourceRead;
  manualEnabled: boolean;
}): CombinedPlantEnvironmentRead {
  const { sensor, manual } = input;
  const sources = input.manualEnabled ? [sensor, manual] : [sensor];
  const any = (pick: (s: PlantEnvironmentSourceRead) => boolean | undefined) =>
    sources.some((s) => pick(s) === true);
  return {
    isError: any((s) => s.isError),
    isPending: any((s) => s.isPending),
    isLoading: any((s) => s.isLoading),
    isFetching: any((s) => s.isFetching),
    fetchStatus: sources.some((s) => s.fetchStatus === "paused")
      ? "paused"
      : sources.some((s) => s.fetchStatus === "fetching")
        ? "fetching"
        : "idle",
    refetch: () => {
      for (const s of sources) void s.refetch();
    },
  };
}
