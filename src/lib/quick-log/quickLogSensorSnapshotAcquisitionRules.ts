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

/**
 * Canonical source vocabulary the AI prompt may see. Anything else,
 * including a missing label or the legacy `unknown`, is unverifiable
 * provenance and resolves to `invalid`.
 */
export type QuickLogAiSensorSource = "live" | "manual" | "csv" | "demo" | "stale" | "invalid";

/** Model-safe snapshot: only allowlisted scalar fields, never raw input. */
export type QuickLogAiSensorSnapshot = {
  source: QuickLogAiSensorSource;
  captured_at: string | null;
} & Record<string, string | number | null>;

const AI_CANONICAL_SOURCES: ReadonlySet<string> = new Set([
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
]);

const AI_SOURCE_ALIASES: Readonly<Record<string, QuickLogAiSensorSource>> = {
  imported: "csv",
  import: "csv",
  mock: "demo",
  fixture: "demo",
};

/**
 * Flat reading keys the AI snapshot annotator understands. Kept in step with
 * `READING_KEYS` in `aiSensorSnapshotContextRules.ts`; a key missing here is
 * dropped, never forwarded.
 */
const AI_READING_KEYS: ReadonlySet<string> = new Set([
  "temperature_c",
  "temperature_f",
  "humidity",
  "vpd",
  "vpd_kpa",
  "co2",
  "co2_ppm",
  "ppfd",
  "soil_moisture",
  "soil_water_content",
  "soil_ec",
  "soil_temp_c",
  "soil_temp_f",
  "ph",
  "temp_c",
  "temp_f",
  "air_temp_c",
  "humidity_pct",
  "soil_moisture_pct",
  "soil_ec_mscm",
  "reservoir_ph",
  "reservoir_ec_mscm",
]);

function canonicalAiSource(object: Record<string, unknown>): QuickLogAiSensorSource {
  for (const key of ["source", "data_source", "sensor_source"]) {
    const source = normalizedSource(object[key]);
    if (source === "") continue;
    if (AI_CANONICAL_SOURCES.has(source)) return source as QuickLogAiSensorSource;
    return AI_SOURCE_ALIASES[source] ?? "invalid";
  }
  return "invalid";
}

type CapturedAtState =
  | { readonly kind: "missing" }
  | { readonly kind: "invalid" }
  | { readonly kind: "ok"; readonly iso: string };

/**
 * Read the first timestamp field as ISO-8601. The raw value is never echoed,
 * so a token-shaped or structured `captured_at` cannot reach the prompt. A
 * field that is present but unreadable is `invalid`, not `missing`.
 */
function capturedAtState(object: Record<string, unknown>): CapturedAtState {
  for (const key of ["captured_at", "capturedAt", "timestamp", "ts", "time"]) {
    const raw = object[key];
    if (raw === undefined || raw === null) continue;
    if (typeof raw === "string" && raw.trim() === "") continue;
    let ms: number | null = null;
    if (typeof raw === "number" && Number.isFinite(raw)) {
      ms = raw < 1e12 ? raw * 1000 : raw;
    } else if (typeof raw === "string") {
      const parsed = Date.parse(raw.trim());
      ms = Number.isFinite(parsed) ? parsed : null;
    }
    if (ms === null) return { kind: "invalid" };
    const date = new Date(ms);
    return Number.isNaN(date.getTime())
      ? { kind: "invalid" }
      : { kind: "ok", iso: date.toISOString() };
  }
  return { kind: "missing" };
}

function canonicalCapturedAt(object: Record<string, unknown>): string | null {
  const state = capturedAtState(object);
  return state.kind === "ok" ? state.iso : null;
}

/**
 * Source and timestamp header. An unreadable timestamp makes the whole
 * snapshot `invalid` (values omitted, trust low), so the AI context reports
 * it as invalid rather than as a missing timestamp.
 */
function aiSnapshotHeader(
  source: QuickLogAiSensorSource,
  object: Record<string, unknown>,
): QuickLogAiSensorSnapshot {
  const state = capturedAtState(object);
  if (state.kind === "invalid") return { source: "invalid", captured_at: null };
  return { source, captured_at: state.kind === "ok" ? state.iso : null };
}

function withAllowlistedReadings(
  target: QuickLogAiSensorSnapshot,
  readings: Record<string, unknown>,
  keyMap: Readonly<Record<string, string>>,
): QuickLogAiSensorSnapshot {
  for (const [rawKey, rawValue] of Object.entries(readings)) {
    const key = keyMap[rawKey] ?? rawKey;
    if (!AI_READING_KEYS.has(key)) continue;
    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      target[key] = rawValue;
    }
  }
  return target;
}

/**
 * Resolve a diary `details.sensor_snapshot` into the model-safe flat shape.
 *
 * Every path builds a fresh object from an allowlist: a canonical source,
 * an ISO `captured_at`, and finite numbers under known reading keys. Raw
 * payloads, tokens, hardware ids and every other input field are dropped.
 *
 * Any snapshot declaring `source=live`, flat or nested, must be corroborated
 * by provenance-bearing sensor rows. Live snapshots without that lineage fail
 * closed to `invalid` (unverified data is never presented as live);
 * diagnostic-only matches become `demo`. A present but unreadable timestamp
 * also resolves to `invalid`.
 */
export function resolveQuickLogSensorSnapshotForAi(
  snapshot: unknown,
  provenanceRows?: readonly QuickLogSensorAcquisitionRow[] | null,
): QuickLogAiSensorSnapshot | null {
  if (snapshot === null || snapshot === undefined) return null;
  const object = asObject(snapshot);
  if (!object) return { source: "invalid", captured_at: null };

  if (isDiagnosticSensorProvenanceRow(object)) {
    return aiSnapshotHeader("demo", object);
  }

  const source = canonicalAiSource(object);
  const metrics = asObject(object.metrics);
  if (source !== "live") {
    // An unreadable timestamp: invalid, and no values are forwarded.
    if (capturedAtState(object).kind === "invalid") return { source: "invalid", captured_at: null };
    const header = aiSnapshotHeader(source, object);
    return metrics
      ? withAllowlistedReadings(header, metrics, AI_METRIC_MAP)
      : withAllowlistedReadings(header, object, {});
  }

  const acquired = acquireQuickLogSensorSnapshot(provenanceRows ?? []);
  if (acquired.snapshot && normalizedSource(acquired.snapshot.source) === "live") {
    return withAllowlistedReadings(
      { source: "live", captured_at: canonicalCapturedAt({ ...acquired.snapshot }) },
      acquired.snapshot.metrics,
      AI_METRIC_MAP,
    );
  }

  if (acquired.diagnosticRowsOmitted > 0) {
    return aiSnapshotHeader("demo", object);
  }

  return aiSnapshotHeader("invalid", object);
}
