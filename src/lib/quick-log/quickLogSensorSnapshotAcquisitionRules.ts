/**
 * Pure acquisition rules for the Quick Log sensor snapshot.
 *
 * `get_latest_tent_sensor_snapshot` is a legacy flat JSONB projection. It
 * does not preserve per-row raw provenance and can combine metrics from
 * different sources under the newest row's source label. These rules consume
 * the corresponding long-format rows, remove diagnostic-only provenance,
 * and select one coherent source cohort before Quick Log persists anything.
 */
import {
  isDiagnosticSensorProvenanceRow,
  withoutDiagnosticSensorRows,
} from "../sensorProvenanceFenceRules";

export interface QuickLogSensorAcquisitionRow {
  id?: string | null;
  metric?: string | null;
  value?: number | string | null;
  quality?: string | null;
  source?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  created_at?: string | null;
  raw_payload?: unknown;
}

export interface AcquiredQuickLogSensorSnapshot {
  source: string;
  captured_at: string;
  metrics: Record<string, number>;
}

export interface QuickLogSensorAcquisitionResult {
  snapshot: AcquiredQuickLogSensorSnapshot | null;
  diagnosticRowsOmitted: number;
}

/**
 * Metrics outside this window are not one sensor snapshot. Keeping the
 * bound aligned with AI Doctor prevents a four-hour-old value from being
 * persisted under a fresh anchor timestamp merely because it shares a
 * source label.
 */
export const QUICK_LOG_SENSOR_COHERENCE_MS = 5 * 60 * 1000;

const METRIC_MAP: Readonly<Record<string, string>> = {
  temperature_c: "temperature",
  humidity_pct: "humidity",
  vpd_kpa: "vpd",
  soil_moisture_pct: "soil_moisture",
  soil_temp_c: "soil_temp",
  ec: "soil_ec",
  ppfd: "ppfd",
  co2_ppm: "co2",
};

const AI_METRIC_MAP: Readonly<Record<string, string>> = {
  temperature: "temperature_c",
  humidity: "humidity",
  vpd: "vpd_kpa",
  soil_moisture: "soil_moisture",
  soil_temp: "soil_temp_c",
  soil_ec: "soil_ec",
  ppfd: "ppfd",
  co2: "co2_ppm",
};

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function normalizedSource(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function effectiveTimestamp(row: QuickLogSensorAcquisitionRow): {
  raw: string;
  ms: number;
} | null {
  const candidates = [row.captured_at, row.ts, row.created_at];
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || candidate.trim() === "") continue;
    const ms = Date.parse(candidate);
    if (Number.isFinite(ms)) return { raw: candidate, ms };
  }
  return null;
}

function compareNewest(a: QuickLogSensorAcquisitionRow, b: QuickLogSensorAcquisitionRow): number {
  const at = effectiveTimestamp(a)?.ms ?? -Infinity;
  const bt = effectiveTimestamp(b)?.ms ?? -Infinity;
  if (at !== bt) return bt - at;
  const aCreated = Date.parse(a.created_at ?? "") || -Infinity;
  const bCreated = Date.parse(b.created_at ?? "") || -Infinity;
  if (aCreated !== bCreated) return bCreated - aCreated;
  return String(b.id ?? "").localeCompare(String(a.id ?? ""));
}

/**
 * Build one source-coherent snapshot from long-format rows.
 *
 * Diagnostic rows are removed before the anchor source is chosen. Metrics
 * from manual/csv/other source cohorts therefore cannot be folded underneath
 * a physical `live` source (or vice versa).
 */
export function acquireQuickLogSensorSnapshot(
  rows: readonly QuickLogSensorAcquisitionRow[] | null | undefined,
): QuickLogSensorAcquisitionResult {
  const input = Array.isArray(rows) ? rows : [];
  const diagnosticRowsOmitted = input.filter(isDiagnosticSensorProvenanceRow).length;
  const safeRows = withoutDiagnosticSensorRows(input)
    .filter((row) => {
      const metric = typeof row.metric === "string" ? row.metric.trim().toLowerCase() : "";
      return (
        METRIC_MAP[metric] !== undefined &&
        finiteNumber(row.value) !== null &&
        normalizedSource(row.source) !== "" &&
        effectiveTimestamp(row) !== null
      );
    })
    .sort(compareNewest);

  const anchor = safeRows[0];
  const anchorTimestamp = anchor ? effectiveTimestamp(anchor) : null;
  const anchorSource = normalizedSource(anchor?.source);
  if (!anchor || !anchorTimestamp || !anchorSource) {
    return { snapshot: null, diagnosticRowsOmitted };
  }

  const metrics: Record<string, number> = {};
  for (const row of safeRows) {
    if (normalizedSource(row.source) !== anchorSource) continue;
    const timestamp = effectiveTimestamp(row);
    if (!timestamp || anchorTimestamp.ms - timestamp.ms > QUICK_LOG_SENSOR_COHERENCE_MS) {
      continue;
    }
    const rawMetric = typeof row.metric === "string" ? row.metric.trim().toLowerCase() : "";
    const metric = METRIC_MAP[rawMetric];
    if (!metric || Object.prototype.hasOwnProperty.call(metrics, metric)) continue;
    const value = finiteNumber(row.value);
    if (value !== null) metrics[metric] = value;
  }

  if (Object.keys(metrics).length === 0) {
    return { snapshot: null, diagnosticRowsOmitted };
  }

  return {
    snapshot: {
      source: typeof anchor.source === "string" ? anchor.source : anchorSource,
      captured_at: anchorTimestamp.raw,
      metrics,
    },
    diagnosticRowsOmitted,
  };
}

function flattenSnapshotForAi(snapshot: Record<string, unknown>): Record<string, unknown> {
  const metrics = asObject(snapshot.metrics) ?? {};
  const out: Record<string, unknown> = {
    source: snapshot.source,
    captured_at: snapshot.captured_at,
  };
  for (const [rawKey, rawValue] of Object.entries(metrics)) {
    const key = AI_METRIC_MAP[rawKey] ?? rawKey;
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      out[key] = rawValue;
    }
  }
  return out;
}

/**
 * Resolve a diary `details.sensor_snapshot` into the model-safe flat shape.
 *
 * Nested Quick Log snapshots declaring `source=live` must be corroborated by
 * provenance-bearing sensor rows. Older live snapshots that discarded raw
 * lineage fail closed to `unknown`; diagnostic-only matches become `demo`.
 */
export function resolveQuickLogSensorSnapshotForAi(
  snapshot: unknown,
  provenanceRows?: readonly QuickLogSensorAcquisitionRow[] | null,
): unknown {
  const object = asObject(snapshot);
  if (!object) return snapshot;

  if (isDiagnosticSensorProvenanceRow(object)) {
    return { source: "demo", captured_at: object.captured_at ?? null };
  }

  const metrics = asObject(object.metrics);
  if (!metrics) return object;

  const source = normalizedSource(object.source);
  if (source !== "live") return flattenSnapshotForAi(object);

  const acquired = acquireQuickLogSensorSnapshot(provenanceRows ?? []);
  if (acquired.snapshot && normalizedSource(acquired.snapshot.source) === "live") {
    return flattenSnapshotForAi({ ...acquired.snapshot });
  }

  if (acquired.diagnosticRowsOmitted > 0) {
    return { source: "demo", captured_at: object.captured_at ?? null };
  }

  return { source: "unknown", captured_at: object.captured_at ?? null };
}
