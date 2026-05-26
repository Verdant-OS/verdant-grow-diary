/**
 * Pure helpers for the Plant Detail "Assigned Tent Environment" panel.
 *
 * No I/O, no React. Deterministic mapping from raw sensor_readings rows
 * (already scoped to a single tent by the caller) into a labeled,
 * display-ready view model. Missing values stay null — never invented.
 *
 * Read-only. Not used for alerts, actions, AI Doctor, or device control.
 */
import {
  snapshotFromReadings,
  isStale,
  formatValue,
  type SensorReadingLike,
  type SensorSnapshot,
} from "@/lib/sensorSnapshot";
import { formatSensorSourceLabel } from "@/lib/manualSensorSourceLabel";
import { tempFFromC } from "@/lib/temperatureUnits";

export interface PlantTentEnvironmentMetric {
  key: string;
  label: string;
  display: string;
  hasValue: boolean;
}

export interface PlantTentEnvironmentView {
  hasReadings: boolean;
  capturedAt: string | null;
  sourceLabel: string | null;
  stale: boolean;
  metrics: PlantTentEnvironmentMetric[];
}

const EMPTY_VIEW: PlantTentEnvironmentView = {
  hasReadings: false,
  capturedAt: null,
  sourceLabel: null,
  stale: false,
  metrics: [],
};

function metric(
  key: string,
  label: string,
  value: number | null,
  unit: string,
  digits = 1,
): PlantTentEnvironmentMetric {
  return {
    key,
    label,
    display: value === null ? "Unknown" : formatValue(value, unit, digits),
    hasValue: value !== null,
  };
}

export function buildPlantTentEnvironmentView(
  rows: SensorReadingLike[] | null | undefined,
  now: number = Date.now(),
): PlantTentEnvironmentView {
  if (!rows || rows.length === 0) return EMPTY_VIEW;
  const snap: SensorSnapshot | null = snapshotFromReadings(rows);
  if (!snap) return EMPTY_VIEW;
  return {
    hasReadings: true,
    capturedAt: snap.ts,
    sourceLabel: formatSensorSourceLabel({
      source: snap.source,
      deviceId: snap.device_id ?? null,
    }),
    stale: isStale(snap.ts, now),
    metrics: [
      // Stored as Celsius; displayed as Fahrenheit per Verdant convention.
      metric("temp", "Temperature", tempFFromC(snap.temp), "°F"),
      metric("rh", "Humidity", snap.rh, "%"),
      metric("vpd", "VPD", snap.vpd, " kPa", 2),
      metric("soil", "Soil moisture", snap.soil, "%"),
      metric("soil_ec", "Soil EC", snap.soil_ec, " mS/cm", 2),
      metric("soil_temp", "Soil temp", tempFFromC(snap.soil_temp), "°F"),
      metric("ppfd", "PPFD", snap.ppfd, " µmol", 0),
      metric("co2", "CO₂", snap.co2, " ppm", 0),
    ],
  };
}
