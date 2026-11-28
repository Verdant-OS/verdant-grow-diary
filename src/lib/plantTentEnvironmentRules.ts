/**
 * Pure helpers for the Plant Detail "Assigned Tent Environment" panel.
 *
 * No I/O, no React. Deterministic mapping from raw sensor_readings rows
 * (already scoped to a single tent by the caller) into a labeled,
 * display-ready view model. Missing values stay null — never invented.
 * A current reading with temperature and RH but no stored VPD shows the VPD
 * calculated from that pair, labeled as calculated, as the Dashboard tent
 * panel does. A stale reading never gets a calculated VPD.
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
import { captureRefsMatch, rowCaptureRef } from "@/lib/sensorCaptureRefRules";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";
import { calculateVPD } from "@/lib/sensors/calculateVPD";
import { TENTS_LIST_VPD_ORIGIN_COPY } from "@/lib/tentsListVpdRules";
import {
  convertCelsiusForDisplay,
  getTemperatureUnitSymbol,
  loadTemperatureUnitPreference,
  type TemperatureUnitPreference,
} from "@/lib/temperatureUnitPreference";

export interface PlantTentEnvironmentMetric {
  key: string;
  label: string;
  display: string;
  hasValue: boolean;
  /** VPD only: set when the value is calculated from temperature and RH. */
  originLabel?: typeof TENTS_LIST_VPD_ORIGIN_COPY.calculated;
}

export interface PlantTentEnvironmentView {
  hasReadings: boolean;
  capturedAt: string | null;
  sourceLabel: string | null;
  stale: boolean;
  /** Provenance is strong enough for stage-aware health interpretation. */
  canAssessStage: boolean;
  metrics: PlantTentEnvironmentMetric[];
}

/** Query availability is separate from an observation's timestamp/source. */
export function buildPlantEnvironmentReadView(input: {
  enabled: boolean;
  hasCachedReadings: boolean;
  isError?: boolean;
  isPending?: boolean;
  isLoading?: boolean;
  isFetching?: boolean;
  fetchStatus?: string;
}) {
  const cached = input.hasCachedReadings;
  const kind = !input.enabled
    ? "unassigned"
    : input.fetchStatus === "paused"
      ? "paused"
      : input.isError
        ? "error"
        : input.isPending || input.isLoading || input.isFetching
          ? cached
            ? "refreshing"
            : "loading"
          : "ready";
  const message =
    kind === "paused"
      ? cached
        ? "Waiting for connection to refresh sensor readings. Showing cached readings."
        : "Waiting for connection to load sensor readings."
      : kind === "error"
        ? cached
          ? "Could not refresh sensor readings. Showing cached readings."
          : "Sensor readings unavailable."
        : kind === "refreshing"
          ? "Refreshing sensor readings. Showing cached readings."
          : kind === "loading"
            ? "Loading latest readings…"
            : null;
  const summaryLabel =
    kind === "unassigned"
      ? "No tent"
      : kind === "paused"
        ? cached
          ? "Waiting for connection · Cached"
          : "Waiting for connection"
        : kind === "error"
          ? cached
            ? "Unavailable · Cached"
            : "Unavailable"
          : kind === "refreshing"
            ? "Refreshing · Cached"
            : kind === "loading"
              ? "Loading…"
              : null;
  return {
    kind,
    message,
    summaryLabel,
    canAssessCurrent: kind === "ready",
    canRetry: kind === "error" && !input.isFetching,
  };
}

const EMPTY_VIEW: PlantTentEnvironmentView = {
  hasReadings: false,
  capturedAt: null,
  sourceLabel: null,
  stale: false,
  canAssessStage: false,
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

/**
 * True when the temperature and RH rows the snapshot picked at its latest
 * instant (first match, as `snapshotFromReadings` selects them) are one
 * capture. Two devices or sources reporting at one instant are not a pair, so
 * no VPD is calculated from them (Codex P2 on #3110 at f403ea8d).
 */
function tempAndRhShareCapture(rows: readonly SensorReadingLike[], ts: string): boolean {
  const latestMs = Date.parse(ts);
  const latest = rows.filter((row) => {
    const at = resolveSensorObservationTime(row);
    return at !== null && Date.parse(at) === latestMs;
  });
  const temp = latest.find((row) => row.metric === "temperature_c");
  const rh = latest.find((row) => row.metric === "humidity_pct");
  if (!temp || !rh) return false;
  return captureRefsMatch(rowCaptureRef(temp), rowCaptureRef(rh));
}

export function buildPlantTentEnvironmentView(
  rows: SensorReadingLike[] | null | undefined,
  now: number = Date.now(),
  tempUnit: TemperatureUnitPreference = loadTemperatureUnitPreference(),
): PlantTentEnvironmentView {
  if (!rows || rows.length === 0) return EMPTY_VIEW;
  const snap: SensorSnapshot | null = snapshotFromReadings(rows);
  if (!snap) return EMPTY_VIEW;
  const stale = isStale(snap.ts, now, undefined, snap.source);
  const tempSymbol = getTemperatureUnitSymbol(tempUnit);
  const calculatedVpd =
    snap.vpd === null && !stale && tempAndRhShareCapture(rows, snap.ts)
      ? calculateVPD(snap.temp, snap.rh)
      : null;
  const vpdMetric =
    calculatedVpd === null
      ? metric("vpd", "VPD", snap.vpd, " kPa", 2)
      : {
          ...metric("vpd", "VPD", calculatedVpd, " kPa", 2),
          originLabel: TENTS_LIST_VPD_ORIGIN_COPY.calculated,
        };
  return {
    hasReadings: true,
    capturedAt: snap.ts,
    sourceLabel: formatSensorSourceLabel({
      source: snap.source,
      deviceId: snap.device_id ?? null,
    }),
    stale,
    canAssessStage:
      !stale && (snap.source === "live" || snap.source === "manual" || snap.source === "csv"),
    metrics: [
      // Stored as canonical Celsius; displayed in the grower's preferred
      // unit (default Fahrenheit) — conversion happens exactly once, here.
      metric("temp", "Temperature", convertCelsiusForDisplay(snap.temp, tempUnit), tempSymbol),
      metric("rh", "Humidity", snap.rh, "%"),
      vpdMetric,
      metric("soil", "Soil moisture", snap.soil, "%"),
      metric("soil_ec", "Soil EC", snap.soil_ec, " mS/cm", 2),
      metric(
        "soil_temp",
        "Soil temp",
        convertCelsiusForDisplay(snap.soil_temp, tempUnit),
        tempSymbol,
      ),
      metric("ppfd", "PPFD", snap.ppfd, " µmol", 0),
      metric("co2", "CO₂", snap.co2, " ppm", 0),
    ],
  };
}
