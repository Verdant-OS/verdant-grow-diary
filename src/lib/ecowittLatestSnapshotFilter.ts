/**
 * ecowittLatestSnapshotFilter — pure helper that turns persisted
 * `sensor_readings` rows into per-tent/plant EcoWitt snapshot candidates.
 *
 * Hard constraints:
 *  - Pure, deterministic, no I/O.
 *  - Read-only. Never writes to alerts, action_queue, or device control.
 *  - Honors tent/plant scoping: a newer reading from a different tent
 *    must NEVER bleed into the selected tent's snapshot.
 *  - Never fabricates a "live" reading and never relabels demo data as live.
 *  - Does not call source label rules — that stays in
 *    `ecowittReadingViewModel` so labeling lives in one place.
 */
import {
  buildEcowittSnapshotViewModel,
  type BuildEcowittSnapshotOptions,
  type EcowittCandidate,
  type EcowittSnapshotViewModel,
} from "@/lib/ecowittReadingViewModel";
import type { SensorReadingSource } from "@/mock";

/** Minimal shape we need from a `sensor_readings` row. */
export interface EcowittSensorReadingRow {
  id?: string | null;
  tent_id?: string | null;
  plant_id?: string | null;
  source?: string | null;
  captured_at?: string | null;
  ts?: string | null;
  raw_payload?: unknown;
}

export interface EcowittLatestSnapshotFilter {
  tentId: string;
  /** Optional plant filter. When set, only rows tagged with this plant
   *  are considered. */
  plantId?: string | null;
}

/** Sources we trust as EcoWitt-derived. Vendor lineage may also live in
 *  `raw_payload.vendor`. */
const ECOWITT_SOURCES = new Set<string>(["ecowitt", "live", "manual"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function readFiniteMetric(
  metrics: Record<string, unknown>,
  key: string,
): number | null {
  const raw = metrics[key];
  const value = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(value) ? value : null;
}

function celsiusToFahrenheit(celsius: number): number {
  return celsius * (9 / 5) + 32;
}

function isEcowittLineageValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  // Accept canonical "ecowitt" and vendor lineage starting with ecowitt
  // (e.g. "ecowitt_windows_testbench").
  return normalized === "ecowitt" || normalized.startsWith("ecowitt");
}

function isEcowittRow(row: EcowittSensorReadingRow): boolean {
  const src = (row.source ?? "").trim().toLowerCase();
  if (src === "ecowitt") return true;
  const raw = row.raw_payload;
  if (isRecord(raw)) {
    const metadata = isRecord(raw.metadata) ? raw.metadata : null;
    const lineageFields: unknown[] = [
      raw.vendor,
      raw.source,
      raw.transport_source,
      metadata?.vendor,
      metadata?.source,
      metadata?.transport,
      metadata?.transport_source,
    ];
    if (lineageFields.some(isEcowittLineageValue)) return true;
  }
  // Canonical V0 "live" source rows are EcoWitt-derived only when their
  // raw_payload carries EcoWitt vendor lineage (handled above). We do NOT
  // accept bare source="live" without lineage to avoid bleeding unrelated
  // live ingest paths into this card.
  return false;
}

function resolveCandidateSource(
  row: EcowittSensorReadingRow,
): SensorReadingSource {
  const src = (row.source ?? "").trim().toLowerCase();
  if (src === "manual") return "manual";
  if (src === "demo") return "demo";
  // Treat all listener-tagged EcoWitt rows as "live" candidates; the
  // view-model will demote stale ones to "stale" via freshness.
  return "live";
}

function buildCandidatePayload(
  row: EcowittSensorReadingRow,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const metrics = isRecord(raw.metrics) ? raw.metrics : null;
  if (!metrics) return raw;

  const next: Record<string, unknown> = { ...raw };
  let mappedAnyMetric = false;

  const tempF = readFiniteMetric(metrics, "temp_f");
  if (tempF !== null) {
    next.temp1f = tempF;
    mappedAnyMetric = true;
  } else {
    const tempC = readFiniteMetric(metrics, "temperature_c");
    if (tempC !== null) {
      next.temp1f = celsiusToFahrenheit(tempC);
      mappedAnyMetric = true;
    }
  }

  const humidityPct = readFiniteMetric(metrics, "humidity_pct");
  if (humidityPct !== null) {
    next.humidity1 = humidityPct;
    mappedAnyMetric = true;
  }

  const soilMoisturePct = readFiniteMetric(metrics, "soil_moisture_pct");
  if (soilMoisturePct !== null) {
    next.soilmoisture1 = soilMoisturePct;
    mappedAnyMetric = true;
  }

  const co2Ppm = readFiniteMetric(metrics, "co2_ppm");
  if (co2Ppm !== null) {
    next.co2 = co2Ppm;
    mappedAnyMetric = true;
  }

  if (!mappedAnyMetric) return raw;

  const metadata = isRecord(raw.metadata) ? raw.metadata : null;
  const capturedAt =
    readString(raw.captured_at) ??
    readString(row.captured_at) ??
    readString(row.ts);
  if (capturedAt) next.dateutc = capturedAt;

  const transport =
    readString(raw.transport) ??
    readString(metadata?.transport) ??
    readString(metadata?.transport_source);
  if (transport) next.transport = transport;

  if (raw.test_sender === true || metadata?.test_sender === true) {
    next.test_sender = true;
  }

  return next;
}

/**
 * Filter persisted sensor_readings rows by tent (and optional plant),
 * keeping only EcoWitt-tagged rows that carry a usable raw_payload, then
 * convert them to EcoWitt candidates ready for `buildEcowittSnapshotViewModel`.
 */
export function selectEcowittCandidates(
  rows: readonly EcowittSensorReadingRow[] | null | undefined,
  filter: EcowittLatestSnapshotFilter,
): EcowittCandidate[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  if (!filter || !filter.tentId) return [];

  const out: EcowittCandidate[] = [];
  for (const row of rows) {
    if ((row.tent_id ?? null) !== filter.tentId) continue;
    if (filter.plantId != null && (row.plant_id ?? null) !== filter.plantId) {
      continue;
    }
    if (!isEcowittRow(row)) continue;

    const raw = row.raw_payload;
    if (!isRecord(raw)) continue;

    out.push({
      payload: buildCandidatePayload(row, raw),
      source: resolveCandidateSource(row),
      receivedAt:
        (typeof row.captured_at === "string" && row.captured_at) ||
        (typeof row.ts === "string" && row.ts) ||
        undefined,
    });
  }

  return out;
}

/**
 * One-call convenience: filter + build snapshot view-model for the
 * selected grow/tent/plant.
 */
export function buildEcowittLatestSnapshot(
  rows: readonly EcowittSensorReadingRow[] | null | undefined,
  filter: EcowittLatestSnapshotFilter,
  options: BuildEcowittSnapshotOptions = {},
): EcowittSnapshotViewModel {
  const candidates = selectEcowittCandidates(rows, filter);
  return buildEcowittSnapshotViewModel(candidates, options);
}
