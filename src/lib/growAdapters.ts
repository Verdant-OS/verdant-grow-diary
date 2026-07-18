// Pure adapter functions: Supabase row -> app domain shape (matches @/mock types).
// No side effects. No I/O. Safe to unit-test in isolation.
import type { TentRow, PlantRow, SensorReadingRow } from "@/lib/db";
import type {
  Tent,
  Plant,
  SensorReading,
  SensorReadingSource,
  SensorReadingHealthStatus,
  Stage,
} from "@/mock";
import {
  classifySensorSnapshotStatus,
  type SensorSnapshotStatus,
} from "@/lib/sensorSnapshotStatusContract";
import { isSensorTestbenchRow } from "@/lib/sensorTestbenchIndicatorRules";
import { classifyFreshness, type SensorSnapshotFreshness } from "@/lib/latestSensorSnapshotRules";
import { evaluateCurrentLiveSensorTruth } from "@/lib/currentLiveSensorTruthRules";
import { assertCanonicalSensorSource } from "@/constants/sensorIngestProvenance";

/**
 * Coerce a free-text `sensor_readings.source` column to the canonical
 * SensorReadingSource union. Unknown / empty values fail closed as
 * "invalid". A database row proves storage, not physical sensor provenance.
 */
function coerceSource(v: string | null | undefined): SensorReadingSource {
  return assertCanonicalSensorSource(v) ?? "invalid";
}

/**
 * Resolve the presenter-facing source without exposing raw payload details.
 * Windows listener diagnostics are accepted into the canonical live storage
 * path, so their preserved lineage must win over the stored `source=live`.
 */
export function resolveSensorReadingSource(row: SensorReadingRow): SensorReadingSource {
  if (isSensorTestbenchRow(row)) return "demo";
  return coerceSource((row as { source?: string | null }).source);
}

/**
 * Derive a canonical SnapshotStatus for a single DB-backed reading. The
 * contract is the single source of truth — never inline classify in JSX.
 * A reading with no parseable capturedAt is "needs_review", never
 * defaulted to "usable".
 */
function deriveReadingStatus(
  capturedAt: string | null | undefined,
  source: SensorReadingSource,
  quality: unknown,
  now: Date = new Date(),
): SensorReadingHealthStatus {
  // Explicit non-live provenance can never become healthy merely because its
  // timestamp is fresh. This is the legacy adapter's final trust boundary.
  if (source === "demo") return "needs_review";
  if (source === "invalid") return "invalid";
  if (source === "stale") return "stale";
  if (quality === "invalid") return "invalid";
  if (quality === "stale") return "stale";
  if (quality !== "ok") return "needs_review";
  if (source === "live") {
    const freshness: SensorSnapshotFreshness = classifyFreshness(capturedAt, now).freshness;
    const truth = evaluateCurrentLiveSensorTruth({ source, quality, freshness });
    if (freshness === "invalid") return "invalid";
    if (freshness === "stale") return "stale";
    return truth.isCurrentLive ? "usable" : "needs_review";
  }
  const result = classifySensorSnapshotStatus({
    rowsReceived: 1,
    rowsAccepted: 1,
    capturedAt: capturedAt ?? null,
    source,
    now,
  });
  return result.status as SensorSnapshotStatus;
}

const VALID_STAGES: readonly Stage[] = ["seedling", "veg", "flower", "flush", "harvest", "cure"];
const VALID_HEALTH = ["healthy", "watch", "issue"] as const;
type Health = (typeof VALID_HEALTH)[number];

/**
 * Preserve the missing/unknown-stage signal so stage-aware UI (VPD badges,
 * stability summaries) can render the correct guidance. Returns null when the
 * source row's stage is missing or unmapped — never silently coerces to
 * "seedling".
 */
function coerceStage(v: string | null | undefined): Stage | null {
  return (VALID_STAGES as readonly string[]).includes(v ?? "") ? (v as Stage) : null;
}
function coerceHealth(v: string | null | undefined): Health {
  return (VALID_HEALTH as readonly string[]).includes(v ?? "") ? (v as Health) : "healthy";
}

export function mapTentRow(row: TentRow): Tent {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand ?? "",
    size: row.size ?? "",
    stage: coerceStage(row.stage),
    light: {
      on: !!row.light_on,
      schedule: row.light_schedule ?? "",
      wattage: row.light_wattage ?? 0,
    },
    alertCount: 0, // alerts are out of scope for Phase 1; default to 0.
    growId: (row as { grow_id?: string | null }).grow_id ?? null,
  };
}

function cleanPlantString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function mapPlantRow(row: PlantRow): Plant {
  return {
    id: row.id,
    name: row.name,
    strain: row.strain ?? "",
    tentId: row.tent_id ?? "",
    stage: coerceStage(row.stage),
    startedAt: row.started_at,
    health: coerceHealth(row.health),
    photo: row.photo_url ?? "",
    lastNote: row.last_note ?? "",
    growId: row.grow_id ?? null,
    isArchived: Boolean(row.is_archived ?? false),
    medium: cleanPlantString(row.medium),
    potSize: cleanPlantString(row.pot_size),
  };
}

/**
 * Maps a single per-metric sensor_readings row into the legacy mock-shaped
 * SensorReading. Missing metrics default to 0. Prefer `groupSensorReadingRows`
 * for fetch results — a single row alone reports only one metric.
 */
export function mapSensorReadingRow(row: SensorReadingRow, now: Date = new Date()): SensorReading {
  const source = resolveSensorReadingSource(row);
  const capturedAt = (row as { captured_at?: string | null }).captured_at ?? row.ts;
  const reading: SensorReading = {
    ts: row.ts,
    tentId: row.tent_id,
    temp: 0,
    rh: 0,
    vpd: 0,
    co2: 0,
    soil: 0,
    source,
    quality: row.quality,
    status: deriveReadingStatus(capturedAt, source, row.quality, now),
    capturedAt,
  };
  applyMetric(reading, row.metric, row.value);
  if (isSuspiciousExtreme(row.metric, row.value)) reading.status = "invalid";
  return reading;
}

function isSuspiciousExtreme(metric: string, rawValue: number | string | null): boolean {
  if (metric !== "humidity_pct" && metric !== "soil_moisture_pct") return false;
  const value = Number(rawValue);
  return Number.isFinite(value) && (value === 0 || value === 100);
}

function applyMetric(
  reading: SensorReading,
  metric: string,
  rawValue: number | string | null,
): void {
  const v = Number(rawValue);
  if (!Number.isFinite(v)) return;
  switch (metric) {
    case "temperature_c":
      reading.temp = v;
      break;
    case "humidity_pct":
      reading.rh = v;
      break;
    case "vpd_kpa":
      reading.vpd = v;
      break;
    case "co2_ppm":
      reading.co2 = v;
      break;
    case "soil_moisture_pct":
      reading.soil = v;
      break;
  }
}

/**
 * Groups long-form sensor_readings rows by (tent_id, ts) into the legacy
 * mock-shaped SensorReading objects. Missing metrics default to 0. Sorted by
 * ts descending (newest first); rows with the same ts keep insertion order
 * across distinct tents.
 *
 * Provenance starts from the first row encountered per (tent, ts) group; in
 * practice all per-metric rows from one ingest share source/captured_at. Any
 * invalid or diagnostic row in a mixed group downgrades the whole snapshot,
 * so ordering can never promote untrusted evidence. Status is derived from
 * the contract — never inline-classified.
 */
export function groupSensorReadingRows(
  rows: SensorReadingRow[],
  now: Date = new Date(),
): SensorReading[] {
  const byKey = new Map<string, SensorReading>();
  for (const row of rows) {
    const key = `${row.tent_id}|${row.ts}`;
    const rowSource = resolveSensorReadingSource(row);
    let reading = byKey.get(key);
    if (!reading) {
      const capturedAt = (row as { captured_at?: string | null }).captured_at ?? row.ts;
      reading = {
        ts: row.ts,
        tentId: row.tent_id,
        temp: 0,
        rh: 0,
        vpd: 0,
        co2: 0,
        soil: 0,
        source: rowSource,
        quality: row.quality,
        status: deriveReadingStatus(capturedAt, rowSource, row.quality, now),
        capturedAt,
      };
      byKey.set(key, reading);
    } else if (rowSource === "invalid" || (rowSource === "demo" && reading.source !== "invalid")) {
      // Mixed provenance at one timestamp fails closed. The normal ingest
      // emits the same lineage for every metric, but a malformed/mixed group
      // must never let its first physical-looking row promote diagnostics.
      reading.source = rowSource;
      reading.status = mergeReadingStatus(
        reading.status,
        deriveReadingStatus(reading.capturedAt, rowSource, row.quality, now),
      );
    }
    applyMetric(reading, row.metric, row.value);
    if (row.quality !== "ok" || isSuspiciousExtreme(row.metric, row.value)) {
      const rowStatus =
        row.quality === "stale" && !isSuspiciousExtreme(row.metric, row.value)
          ? "stale"
          : "invalid";
      reading.status = mergeReadingStatus(reading.status, rowStatus);
      reading.quality = mergeReadingQuality(reading.quality, row.quality);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}

const READING_STATUS_PRIORITY: Readonly<Record<SensorReadingHealthStatus, number>> = {
  usable: 0,
  no_data: 1,
  stale: 2,
  needs_review: 3,
  invalid: 4,
};

function mergeReadingStatus(
  current: SensorReadingHealthStatus,
  candidate: SensorReadingHealthStatus,
): SensorReadingHealthStatus {
  return READING_STATUS_PRIORITY[candidate] > READING_STATUS_PRIORITY[current]
    ? candidate
    : current;
}

function mergeReadingQuality(
  current: string | null | undefined,
  candidate: unknown,
): string | null {
  if (current !== "ok") return current ?? null;
  return typeof candidate === "string" ? candidate : null;
}
