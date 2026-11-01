/**
 * Project a Quick Log environment sibling into the surfaces that still
 * read only `sensor_readings` and diary snapshot envelopes.
 *
 * Tent-page Quick Log stores temperature and humidity on the environment
 * event (`sensorReadingFromQuickLogEnvironmentRow`). It does not write
 * `sensor_readings` or `details.manual_sensor_snapshot`. These helpers
 * turn that already-loaded wide reading into Tonight rows and a display
 * snapshot. No I/O, no React, no clock of their own.
 */
import type { SensorReading, SensorReadingMetricKey } from "@/mock";
import { isHumidityValid, isTemperatureValid } from "@/lib/sensorReadingNormalizationRules";
import { isStale, type SensorSnapshot } from "@/lib/sensorSnapshot";
import type { TonightSensorRow } from "@/lib/tonightTentHomeViewModel";

const MANUAL_SOURCE = "manual" as const;

type ClimateMetric = {
  key: Extract<SensorReadingMetricKey, "temp" | "rh">;
  metric: "temperature_c" | "humidity_pct";
  read: (reading: SensorReading) => number;
  valid: (value: number) => boolean;
};

const CLIMATE_METRICS: readonly ClimateMetric[] = [
  {
    key: "temp",
    metric: "temperature_c",
    read: (reading) => reading.temp,
    valid: isTemperatureValid,
  },
  { key: "rh", metric: "humidity_pct", read: (reading) => reading.rh, valid: isHumidityValid },
];

export interface DisplayedTentClimateSnapshot {
  snapshot: SensorSnapshot | null;
  /** True only when the manual sibling is strictly newer than the sensor snapshot. */
  fromManual: boolean;
  /** Source-aware staleness of the manual sibling. False when the sensor snapshot remains. */
  stale: boolean;
}

function scopedTentId(tentId: string | null | undefined): string | null {
  if (typeof tentId !== "string") return null;
  const trimmed = tentId.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function observed(reading: SensorReading, key: SensorReadingMetricKey): boolean {
  return Array.isArray(reading.observedMetrics) && reading.observedMetrics.includes(key);
}

function captureIso(reading: SensorReading): string | null {
  const at = reading.capturedAt || reading.ts;
  if (typeof at !== "string" || !Number.isFinite(Date.parse(at))) return null;
  return at;
}

function inTent(
  reading: SensorReading | null | undefined,
  tentId: string,
): reading is SensorReading {
  if (!reading || reading.source !== MANUAL_SOURCE) return false;
  return typeof reading.tentId === "string" && reading.tentId.trim() === tentId;
}

function climateValue(reading: SensorReading, metric: ClimateMetric): number | null {
  if (!observed(reading, metric.key)) return null;
  const value = metric.read(reading);
  if (typeof value !== "number" || !Number.isFinite(value) || !metric.valid(value)) return null;
  return value;
}

function snapshotFromManualReading(reading: SensorReading, tentId: string): SensorSnapshot | null {
  const at = captureIso(reading);
  if (!at) return null;
  const temp = climateValue(reading, CLIMATE_METRICS[0]);
  const rh = climateValue(reading, CLIMATE_METRICS[1]);
  if (temp === null && rh === null) return null;
  return {
    source: MANUAL_SOURCE,
    ts: at,
    temp,
    rh,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    tent_id: tentId,
    alert_persistence_eligible: false,
  };
}

/**
 * Tonight card rows for one tent. Temperature and humidity only: an
 * unobserved VPD stays absent so the card calculates it from the pair,
 * and a VPD-only manual does not invent climate or replace the existing
 * VPD fallback.
 */
export function tonightRowsFromQuickLogManualReadings(
  readings: readonly SensorReading[] | null | undefined,
  tentId: string | null | undefined,
): TonightSensorRow[] {
  const scope = scopedTentId(tentId);
  if (!scope || !readings) return [];
  const rows: TonightSensorRow[] = [];
  for (const reading of readings) {
    if (!inTent(reading, scope)) continue;
    const at = captureIso(reading);
    if (!at) continue;
    for (const metric of CLIMATE_METRICS) {
      const value = climateValue(reading, metric);
      if (value === null) continue;
      rows.push({
        id: `ql-manual:${scope}:${Date.parse(at)}:${metric.metric}`,
        tent_id: scope,
        metric: metric.metric,
        value,
        source: MANUAL_SOURCE,
        quality: "ok",
        ts: at,
        captured_at: at,
        raw_payload: null,
      });
    }
  }
  return rows;
}

/**
 * The tent Environment block's climate snapshot. A manual sibling wins
 * only when it is strictly newer than the sensor snapshot. A null,
 * unavailable, or untimed sensor snapshot loses to the manual sibling.
 * A foreign tent never contributes.
 */
export function resolveDisplayedTentClimateSnapshot(input: {
  sensorSnapshot: SensorSnapshot | null | undefined;
  manuals: readonly SensorReading[] | null | undefined;
  tentId: string | null | undefined;
  nowMs: number;
}): DisplayedTentClimateSnapshot {
  const sensor = input.sensorSnapshot ?? null;
  const kept = { snapshot: sensor, fromManual: false, stale: false };
  const scope = scopedTentId(input.tentId);
  if (!scope || !input.manuals) return kept;

  let manual: SensorSnapshot | null = null;
  let manualMs = Number.NEGATIVE_INFINITY;
  for (const reading of input.manuals) {
    if (!inTent(reading, scope)) continue;
    const next = snapshotFromManualReading(reading, scope);
    if (!next?.ts) continue;
    const ms = Date.parse(next.ts);
    if (!Number.isFinite(ms) || ms <= manualMs) continue;
    manual = next;
    manualMs = ms;
  }
  if (!manual) return kept;

  const sensorMs = sensor?.ts ? Date.parse(sensor.ts) : Number.NaN;
  const sensorTimed =
    sensor != null && sensor.source !== "unavailable" && Number.isFinite(sensorMs);
  if (sensorTimed && manualMs <= sensorMs) return kept;

  return {
    snapshot: manual,
    fromManual: true,
    stale: isStale(manual.ts, input.nowMs, undefined, MANUAL_SOURCE),
  };
}

export type TentClimateChipMetric = "temp" | "rh" | "co2";

export interface TentClimateChipReading {
  value: number | null;
  /** Stale flag of the source that supplied `value`. */
  stale: boolean;
}

function finiteClimate(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Header chips. A newer manual sibling replaces only temperature or
 * humidity it actually observed. CO₂, and the climate metric a Quick Log
 * left unobserved, stay on the sensor snapshot.
 */
export function resolveTentClimateChipReading(input: {
  displayed: DisplayedTentClimateSnapshot;
  sensorSnapshot: SensorSnapshot | null | undefined;
  sensorStale: boolean;
  metric: TentClimateChipMetric;
}): TentClimateChipReading {
  const sensorReading: TentClimateChipReading = {
    value: finiteClimate(input.sensorSnapshot?.[input.metric]),
    stale: input.sensorStale,
  };
  if (input.metric === "co2" || !input.displayed.fromManual) return sensorReading;
  const manualValue = finiteClimate(input.displayed.snapshot?.[input.metric]);
  if (manualValue === null) return sensorReading;
  return { value: manualValue, stale: input.displayed.stale };
}
