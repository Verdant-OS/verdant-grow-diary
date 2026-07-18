/**
 * Pure Dashboard sensor-evidence selectors.
 *
 * `sensor_readings.source` can be canonicalized to `live` at the ingest
 * boundary even when the row came from Verdant's Windows diagnostic sender.
 * Keep `raw_payload` only long enough to run the shared provenance fence,
 * then project chart/stability inputs that cannot expose that payload.
 */
import {
  withoutDiagnosticSensorRows,
  type SensorProvenanceRowLike,
} from "@/lib/sensorProvenanceFenceRules";
import type { StabilityReadingInput } from "@/lib/environmentStabilityRules";
import {
  QUALITY_HEADLINE,
  evaluateSensorQuality,
  type SensorQualityResult,
} from "@/lib/sensorQuality";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";

export interface DashboardSensorEvidenceRow extends SensorProvenanceRowLike {
  tent_id: string;
  ts: string;
  metric: string;
  value: unknown;
  quality?: string | null;
}

export interface DashboardChartReading {
  ts: string;
  tentId: string;
  temp: number | null;
  rh: number | null;
  vpd: number | null;
  co2: number | null;
  soil: number | null;
  source: "live" | "manual" | "csv";
  status: "usable";
  capturedAt: string;
}

type DashboardNumericMetricKey = "temp" | "rh" | "vpd" | "co2" | "soil";

const METRIC_KEY: Record<string, DashboardNumericMetricKey> = {
  temperature_c: "temp",
  humidity_pct: "rh",
  vpd_kpa: "vpd",
  co2_ppm: "co2",
  soil_moisture_pct: "soil",
};

/**
 * Sources that may feed ordinary Dashboard telemetry after provenance has
 * been checked. `pi_bridge` is the established legacy live reservation;
 * physical Windows-listener EcoWitt rows arrive as canonical `live` and are
 * admitted only when the shared diagnostic fence proves they are physical.
 */
const DASHBOARD_TELEMETRY_SOURCES = new Set(["live", "pi_bridge", "manual", "csv"]);

function canonicalDashboardSource(source: string): DashboardChartReading["source"] | null {
  switch (source.trim().toLowerCase()) {
    case "live":
    case "pi_bridge":
      return "live";
    case "manual":
      return "manual";
    case "csv":
      return "csv";
    default:
      return null;
  }
}

/** Explicit quality flags other than `ok` cannot feed unlabeled telemetry. */
function hasUsableDashboardQuality(quality: unknown): boolean {
  if (quality == null) return true; // Preserve legacy rows created before quality was exposed.
  if (typeof quality !== "string") return false;
  const normalized = quality.trim().toLowerCase();
  return normalized === "" || normalized === "ok";
}

/**
 * Deny-by-default trust policy for raw Dashboard rows. Source labels are
 * normalized only for comparison; the stored value is never rewritten.
 */
export function isDashboardSensorEvidenceRow<T extends DashboardSensorEvidenceRow>(
  row: T | null | undefined,
): row is T {
  if (!row || typeof row.source !== "string") return false;
  const source = row.source.trim().toLowerCase();
  if (!DASHBOARD_TELEMETRY_SOURCES.has(source)) return false;
  if (!hasUsableDashboardQuality(row.quality)) return false;
  return withoutDiagnosticSensorRows([row]).length === 1;
}

/**
 * Preserve stable row order while removing diagnostic-only provenance.
 * Physical EcoWitt gateway rows remain eligible through the shared fence's
 * preserved-source + gateway-marker exception.
 */
export function selectDashboardSensorEvidenceRows<T extends DashboardSensorEvidenceRow>(
  rows: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(rows)) return [];
  return rows.filter((row) => isDashboardSensorEvidenceRow(row));
}

/**
 * Current-observation sources that may receive healthy/in-range semantic
 * cues. CSV and diary snapshots remain useful historical context, while
 * simulated, unavailable, and unverified sources remain diagnostic context;
 * none of those sources may turn a badge or stage target green.
 */
export function isDashboardSnapshotEligibleForHealthyCues(
  snapshot: SensorSnapshot | null | undefined,
): boolean {
  return snapshot?.source === "live" || snapshot?.source === "manual";
}

/** Return null when a snapshot may be displayed but cannot support health cues. */
export function dashboardSnapshotForHealthyCues(
  snapshot: SensorSnapshot | null | undefined,
): SensorSnapshot | null {
  return isDashboardSnapshotEligibleForHealthyCues(snapshot) ? snapshot : null;
}

/**
 * Source-aware Dashboard quality. Plausible numbers alone never make an
 * unverified or simulated snapshot "good".
 */
export function evaluateDashboardSensorQuality(
  snapshot: SensorSnapshot | null | undefined,
  now: number = Date.now(),
): SensorQualityResult {
  const base = evaluateSensorQuality(snapshot, now);
  if (!snapshot || snapshot.source === "unavailable") return base;
  if (isDashboardSnapshotEligibleForHealthyCues(snapshot)) return base;

  const sourceReason =
    snapshot.source === "sim"
      ? "Simulated sensor data is context only and cannot support a healthy status."
      : snapshot.source === "csv"
        ? "CSV sensor history is context only and cannot support a current healthy status."
        : snapshot.source === "diary"
          ? "Diary snapshot data is historical context only and cannot support a healthy status."
          : "Sensor provenance is unverified and cannot support a healthy status.";
  return {
    quality: "watch",
    headline: QUALITY_HEADLINE.watch,
    reasons: [sourceReason, ...base.reasons.filter((reason) => reason !== sourceReason)],
    suspiciousFields: base.suspiciousFields,
  };
}

/**
 * Project eligible rows into chart-only values. `raw_payload` is deliberately
 * absent from the return type and runtime objects.
 */
export function groupDashboardSensorReadings(
  rows: readonly DashboardSensorEvidenceRow[] | null | undefined,
): DashboardChartReading[] {
  const eligible = selectDashboardSensorEvidenceRows(rows);
  const byKey = new Map<string, DashboardChartReading>();
  const mixedSourceKeys = new Set<string>();

  for (const row of eligible) {
    const key = `${row.tent_id}|${row.ts}`;
    const source = canonicalDashboardSource(row.source ?? "");
    if (!source) continue;
    let reading = byKey.get(key);
    if (!reading) {
      reading = {
        ts: row.ts,
        tentId: row.tent_id,
        temp: null,
        rh: null,
        vpd: null,
        co2: null,
        soil: null,
        source,
        status: "usable",
        capturedAt: row.ts,
      };
      byKey.set(key, reading);
    } else if (reading.source !== source) {
      // Never combine metrics from different source cohorts into one
      // apparently coherent chart point.
      mixedSourceKeys.add(key);
      continue;
    }

    const metricKey = METRIC_KEY[row.metric];
    const value = Number(row.value);
    if (metricKey && Number.isFinite(value)) reading[metricKey] = value;
  }

  return Array.from(byKey.entries())
    .filter(([key]) => !mixedSourceKeys.has(key))
    .map(([, reading]) => reading)
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
}

/**
 * Build VPD stability inputs directly from eligible VPD rows so explicit
 * source/quality downgrades survive projection into the stability engine.
 */
export function buildDashboardStabilityReadings(
  rows: readonly DashboardSensorEvidenceRow[] | null | undefined,
): StabilityReadingInput[] {
  return selectDashboardSensorEvidenceRows(rows)
    .filter((row) => row.metric === "vpd_kpa")
    .map((row) => {
      const source = typeof row.source === "string" ? row.source : null;
      const quality = typeof row.quality === "string" ? row.quality : null;
      const sourceFlag = source?.trim().toLowerCase();
      const qualityFlag = quality?.trim().toLowerCase();

      return {
        ts: row.ts,
        vpd: Number(row.value),
        source,
        stale: sourceFlag === "stale" || qualityFlag === "stale",
      };
    });
}
