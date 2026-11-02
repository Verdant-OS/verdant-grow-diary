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
import { isSnapshotStale, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { classifySnapshotTruth, type SensorTruthAssessment } from "@/lib/sensorTruthRules";
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
  /** True when at least one climate metric comes from a strictly newer manual value. */
  fromManual: boolean;
  /** Which climate metrics come from the manual value. */
  manualMetrics: { temp: boolean; rh: boolean };
  /** Source-aware staleness of the displayed manual values. False when only the sensor shows. */
  stale: boolean;
  /**
   * Manual-window staleness of each climate metric that the manual value won.
   * False when that metric still shows the sensor.
   */
  manualStale: { temp: boolean; rh: boolean };
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

/**
 * Tonight card rows for one tent. Temperature and humidity only: an
 * unobserved VPD stays absent so the card calculates it from the pair,
 * and a VPD-only manual does not invent climate or replace the existing
 * VPD fallback.
 */
export function tonightRowsFromQuickLogManualReadings(
  readings: readonly SensorReading[] | null | undefined,
  tentId: string | null | undefined,
  nowMs: number,
): TonightSensorRow[] {
  const scope = scopedTentId(tentId);
  if (!scope || !readings) return [];
  const rows: TonightSensorRow[] = [];
  for (const reading of readings) {
    if (!inTent(reading, scope)) continue;
    const at = captureIso(reading);
    if (!at) continue;
    // Source stays `manual` so the Dashboard evidence filter still admits the
    // row. Past the 24h manual window, Tonight labels it stale after that filter.
    const labelStale = isSnapshotStale({ ts: at, source: MANUAL_SOURCE }, nowMs);
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
        ...(labelStale ? { labelStale: true as const } : {}),
      });
    }
  }
  return rows;
}

/**
 * Newest in-tent manual value per climate metric. A reading only competes
 * for a metric it actually observed with a finite, valid value, so a
 * temperature-only log never blanks humidity (and vice versa). Shared by
 * the tent Environment block; the Tonight card applies the same per-metric
 * newest-wins choice over `tonightRowsFromQuickLogManualReadings` rows.
 */
export function latestQuickLogManualClimateByMetric(
  manuals: readonly SensorReading[] | null | undefined,
  tentId: string | null | undefined,
): Partial<Record<"temp" | "rh", { value: number; ts: string; ms: number }>> {
  const scope = scopedTentId(tentId);
  const out: Partial<Record<"temp" | "rh", { value: number; ts: string; ms: number }>> = {};
  if (!scope || !manuals) return out;
  for (const reading of manuals) {
    if (!inTent(reading, scope)) continue;
    const at = captureIso(reading);
    if (!at) continue;
    const ms = Date.parse(at);
    for (const metric of CLIMATE_METRICS) {
      const value = climateValue(reading, metric);
      if (value === null) continue;
      const prev = out[metric.key];
      if (!prev || ms > prev.ms) out[metric.key] = { value, ts: at, ms };
    }
  }
  return out;
}

/**
 * The tent Environment block's climate snapshot, merged per metric.
 * For temperature and humidity separately, the manual value wins only when
 * it is strictly newer than the sensor snapshot (a tie keeps the sensor).
 * Every other field (CO₂, VPD, soil, PPFD, refs) stays on the sensor
 * snapshot. A null, unavailable, or untimed sensor snapshot loses to the
 * manual values. A foreign tent never contributes.
 */
export function resolveDisplayedTentClimateSnapshot(input: {
  sensorSnapshot: SensorSnapshot | null | undefined;
  manuals: readonly SensorReading[] | null | undefined;
  tentId: string | null | undefined;
  nowMs: number;
}): DisplayedTentClimateSnapshot {
  const sensor = input.sensorSnapshot ?? null;
  const kept: DisplayedTentClimateSnapshot = {
    snapshot: sensor,
    fromManual: false,
    manualMetrics: { temp: false, rh: false },
    stale: false,
    manualStale: { temp: false, rh: false },
  };
  const scope = scopedTentId(input.tentId);
  if (!scope) return kept;
  const latest = latestQuickLogManualClimateByMetric(input.manuals, scope);

  const sensorMs = sensor?.ts ? Date.parse(sensor.ts) : Number.NaN;
  const sensorTimed =
    sensor != null && sensor.source !== "unavailable" && Number.isFinite(sensorMs);
  const wins = (key: "temp" | "rh") => {
    const m = latest[key];
    return m !== undefined && (!sensorTimed || m.ms > sensorMs);
  };
  const tempWins = wins("temp");
  const rhWins = wins("rh");
  if (!tempWins && !rhWins) return kept;

  const winners = [tempWins ? latest.temp! : null, rhWins ? latest.rh! : null].filter(
    (m): m is { value: number; ts: string; ms: number } => m !== null,
  );
  const newest = winners.reduce((a, b) => (b.ms > a.ms ? b : a));
  const oldest = winners.reduce((a, b) => (b.ms < a.ms ? b : a));
  const base: SensorSnapshot = sensorTimed
    ? sensor!
    : {
        source: MANUAL_SOURCE,
        ts: newest.ts,
        temp: null,
        rh: null,
        vpd: null,
        co2: null,
        soil: null,
        soil_ec: null,
        soil_temp: null,
        ppfd: null,
        tent_id: scope,
        alert_persistence_eligible: false,
      };
  const bothManual = tempWins && rhWins;
  const manualStale = {
    temp: tempWins && isSnapshotStale({ ts: latest.temp!.ts, source: MANUAL_SOURCE }, input.nowMs),
    rh: rhWins && isSnapshotStale({ ts: latest.rh!.ts, source: MANUAL_SOURCE }, input.nowMs),
  };
  const snapshot: SensorSnapshot = {
    ...base,
    // Both climate chips manual: label the climate manual and clock it at the
    // manual capture (the older of the two, so a split reading is not shown
    // younger than it is). Otherwise the sensor's own source and time stay.
    source: bothManual ? MANUAL_SOURCE : base.source,
    ts: bothManual ? oldest.ts : base.ts,
    temp: tempWins ? latest.temp!.value : sensorTimed ? base.temp : null,
    rh: rhWins ? latest.rh!.value : sensorTimed ? base.rh : null,
  };
  return {
    snapshot,
    fromManual: true,
    manualMetrics: { temp: tempWins, rh: rhWins },
    // The oldest displayed manual value decides the combined flag.
    stale: isSnapshotStale({ ts: oldest.ts, source: MANUAL_SOURCE }, input.nowMs),
    manualStale,
  };
}

/**
 * Each climate chip's own staleness. A manual metric uses the 24h manual
 * window; a metric still showing the sensor uses the sensor header's flag.
 * One stale chip does not mark the other.
 */
export function tentClimateChipStale(input: {
  manualMetrics: { temp: boolean; rh: boolean };
  manualStale: { temp: boolean; rh: boolean };
  sensorStale: boolean;
}): { temp: boolean; rh: boolean } {
  return {
    temp: input.manualMetrics.temp ? input.manualStale.temp : input.sensorStale,
    rh: input.manualMetrics.rh ? input.manualStale.rh : input.sensorStale,
  };
}

/**
 * Truth-strip input for the tent Environment block.
 * When both climate metrics are the manual reading, the strip clocks that
 * capture and ages it on the manual window. Sensor VPD, CO₂, and soil stay
 * off that manual snapshot so they are not presented as part of the log.
 * Any other mix keeps the sensor snapshot and its own truth.
 */
export function tentEnvironmentTruthStripInput(input: {
  displayed: DisplayedTentClimateSnapshot;
  sensorSnapshot: SensorSnapshot | null;
  sensorTruth: SensorTruthAssessment | null;
  nowMs: number;
}): {
  snapshot: SensorSnapshot | null;
  truth?: SensorTruthAssessment | null;
  now: number;
} {
  const climate = input.displayed.snapshot;
  const bothManual =
    input.displayed.manualMetrics.temp && input.displayed.manualMetrics.rh && climate != null;
  if (!bothManual || climate == null) {
    return {
      snapshot: input.sensorSnapshot,
      truth: input.sensorTruth,
      now: input.nowMs,
    };
  }
  const manualClimate: SensorSnapshot = {
    ...climate,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
  };
  return {
    snapshot: manualClimate,
    truth: classifySnapshotTruth(manualClimate, input.nowMs),
    now: input.nowMs,
  };
}
