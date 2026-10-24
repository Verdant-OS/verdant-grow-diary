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
import type {
  CaptureEvidenceSnapshot,
  SensorSnapshotRejectedQualityRow,
} from "@/lib/sensorSnapshotCaptureEvidence";
import {
  resolveSensorObservationTime,
  type SensorObservationTimeLike,
} from "@/lib/sensorObservationTimeRules";
import { classifyCurrentStateSource, isCurrentStateStale } from "@/lib/sensorTruthCanon";
import type { SnapshotStatus } from "@/lib/sensorSnapshotStatusContract";

/** Historical chart acceptance does not establish current healthy evidence. */
export function resolveDashboardSensorBadgeStatus(
  reading: (SensorObservationTimeLike & { source?: unknown }) | null | undefined,
  now: number,
): SnapshotStatus {
  if (!reading) return "no_data";
  const capturedAt = resolveSensorObservationTime(reading);
  const capturedMs = capturedAt === null ? Number.NaN : Date.parse(capturedAt);
  if (!Number.isFinite(now) || !Number.isFinite(capturedMs) || capturedMs > now) {
    return "invalid";
  }
  const source = typeof reading.source === "string" ? reading.source : null;
  const kind = classifyCurrentStateSource(source);
  if (kind === "invalid") return "invalid";
  if (kind === "stale") return "stale";
  // CSV remains useful history, but neither it nor unverified/synthetic
  // provenance may support a green current-health cue on the Dashboard.
  if (kind !== "live" && kind !== "manual") return "needs_review";
  return isCurrentStateStale(capturedAt, { now, source }) ? "stale" : "usable";
}

export interface DashboardSensorEvidenceRow extends SensorProvenanceRowLike {
  tent_id: string;
  ts: string;
  metric: string;
  value: unknown;
  quality?: string | null;
  captured_at?: string | null;
  id?: string | null;
  device_id?: string | null;
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

/** Raw sources that are themselves a downgrade of the row they label. */
const REJECTED_SOURCES = new Set(["stale", "invalid"]);

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
 * Telemetry rows the evidence filter drops for their intake quality (a known
 * telemetry source, quality not ok) or their explicit stale/invalid source,
 * never for diagnostic provenance. A
 * snapshot built from the surviving rows carries these so a fallback
 * projection can reject their capture the way the raw-row path does (Codex
 * P1 on #2303 at 0994ea2a).
 */
export function selectRejectedQualityRows(
  rows: readonly DashboardSensorEvidenceRow[] | null | undefined,
): SensorSnapshotRejectedQualityRow[] {
  if (!Array.isArray(rows)) return [];
  const out: SensorSnapshotRejectedQualityRow[] = [];
  for (const row of rows) {
    if (!row || typeof row.source !== "string") continue;
    const source = row.source.trim().toLowerCase();
    // An explicit stale/invalid source is an authoritative downgrade on the
    // raw-row path, like a quality flag, so it is carried too (Codex P1 on
    // #2303 at b2606eca). Its quality names the downgrade when the row's own
    // quality does not.
    const explicitSource = REJECTED_SOURCES.has(source);
    if (!explicitSource && !DASHBOARD_TELEMETRY_SOURCES.has(source)) continue;
    const qualityRejected = !hasUsableDashboardQuality(row.quality);
    if (!explicitSource && (typeof row.quality !== "string" || !qualityRejected)) continue;
    if (withoutDiagnosticSensorRows([row]).length !== 1) continue;
    const value = row.value;
    out.push({
      metric: row.metric,
      value: typeof value === "number" || typeof value === "string" ? value : null,
      captured_at: row.captured_at ?? row.ts,
      source: row.source,
      quality: qualityRejected && typeof row.quality === "string" ? row.quality : source,
      ...(typeof row.device_id === "string" && row.device_id.trim()
        ? { device_id: row.device_id }
        : {}),
    });
  }
  return out;
}

/**
 * The snapshot with the `device_id` of the exact row behind each `metric_refs`
 * entry, so its capture refs carry the device (owner decision on #2442).
 */
export function withMetricDeviceIds<T extends SensorSnapshot>(
  snapshot: T,
  rows: readonly { id?: string | null; device_id?: string | null }[] | null | undefined,
): T & Pick<CaptureEvidenceSnapshot, "metric_device_ids"> {
  const deviceIds: Record<string, string> = {};
  for (const [key, ref] of Object.entries(snapshot.metric_refs ?? {})) {
    const device = (rows ?? []).find((row) => row.id === ref?.id)?.device_id;
    if (typeof device === "string" && device.trim()) deviceIds[key] = device;
  }
  return Object.keys(deviceIds).length > 0
    ? { ...snapshot, metric_device_ids: deviceIds }
    : snapshot;
}

/** The snapshot with `rows`' quality-rejected siblings attached, when there are any. */
export function withRejectedQualityRows(
  snapshot: SensorSnapshot | null,
  rows: readonly DashboardSensorEvidenceRow[] | null | undefined,
): CaptureEvidenceSnapshot | null {
  if (!snapshot) return snapshot;
  const rejected = selectRejectedQualityRows(rows);
  const withDevices = withMetricDeviceIds(snapshot, rows);
  return rejected.length > 0 ? { ...withDevices, rejected_quality_rows: rejected } : withDevices;
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
  return isDashboardSnapshotEligibleForHealthyCues(snapshot) ? (snapshot ?? null) : null;
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
    const capturedAt = resolveSensorObservationTime(row) ?? row.ts;
    const key = `${row.tent_id}|${capturedAt}`;
    const source = canonicalDashboardSource(row.source ?? "");
    if (!source) continue;
    let reading = byKey.get(key);
    if (!reading) {
      reading = {
        ts: capturedAt,
        tentId: row.tent_id,
        temp: null,
        rh: null,
        vpd: null,
        co2: null,
        soil: null,
        source,
        status: "usable",
        capturedAt,
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
        ts: resolveSensorObservationTime(row) ?? row.ts,
        vpd: Number(row.value),
        source,
        stale: sourceFlag === "stale" || qualityFlag === "stale",
      };
    });
}
