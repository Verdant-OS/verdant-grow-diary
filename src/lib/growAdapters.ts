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

const VALID_SOURCES: readonly SensorReadingSource[] = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
];

/**
 * Coerce a free-text `sensor_readings.source` column to the canonical
 * SensorReadingSource union. Unknown / empty values become "live" — the
 * row came from the DB ingest path, so the *provenance* is live; the
 * status field separately captures whether the value is usable.
 */
function coerceSource(v: string | null | undefined): SensorReadingSource {
  const s = (v ?? "").toLowerCase();
  return (VALID_SOURCES as readonly string[]).includes(s)
    ? (s as SensorReadingSource)
    : "live";
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
  now: Date = new Date(),
): SensorReadingHealthStatus {
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
    growId: (row as { grow_id?: string | null }).grow_id ?? null,
    isArchived: Boolean((row as { is_archived?: boolean | null }).is_archived ?? false),
  };
}

/**
 * Maps a single per-metric sensor_readings row into the legacy mock-shaped
 * SensorReading. Missing metrics default to 0. Prefer `groupSensorReadingRows`
 * for fetch results — a single row alone reports only one metric.
 */
export function mapSensorReadingRow(row: SensorReadingRow): SensorReading {
  const source = coerceSource((row as { source?: string | null }).source);
  const capturedAt =
    (row as { captured_at?: string | null }).captured_at ?? row.ts;
  const reading: SensorReading = {
    ts: row.ts,
    tentId: row.tent_id,
    temp: 0,
    rh: 0,
    vpd: 0,
    co2: 0,
    soil: 0,
    source,
    status: deriveReadingStatus(capturedAt, source),
    capturedAt,
  };
  applyMetric(reading, row.metric, row.value);
  return reading;
}

function applyMetric(reading: SensorReading, metric: string, rawValue: number | string | null): void {
  const v = Number(rawValue);
  if (!Number.isFinite(v)) return;
  switch (metric) {
    case "temperature_c": reading.temp = v; break;
    case "humidity_pct": reading.rh = v; break;
    case "vpd_kpa": reading.vpd = v; break;
    case "co2_ppm": reading.co2 = v; break;
    case "soil_moisture_pct": reading.soil = v; break;
  }
}

/**
 * Groups long-form sensor_readings rows by (tent_id, ts) into the legacy
 * mock-shaped SensorReading objects. Missing metrics default to 0. Sorted by
 * ts descending (newest first); rows with the same ts keep insertion order
 * across distinct tents.
 *
 * Provenance is inherited from the FIRST row encountered per (tent, ts)
 * group; in practice all per-metric rows from one ingest share source/
 * captured_at, so this matches grower expectations. Status is derived
 * once from the contract — never inline-classified.
 */
export function groupSensorReadingRows(rows: SensorReadingRow[]): SensorReading[] {
  const byKey = new Map<string, SensorReading>();
  for (const row of rows) {
    const key = `${row.tent_id}|${row.ts}`;
    let reading = byKey.get(key);
    if (!reading) {
      const source = coerceSource((row as { source?: string | null }).source);
      const capturedAt =
        (row as { captured_at?: string | null }).captured_at ?? row.ts;
      reading = {
        ts: row.ts,
        tentId: row.tent_id,
        temp: 0,
        rh: 0,
        vpd: 0,
        co2: 0,
        soil: 0,
        source,
        status: deriveReadingStatus(capturedAt, source),
        capturedAt,
      };
      byKey.set(key, reading);
    }
    applyMetric(reading, row.metric, row.value);
  }
  return Array.from(byKey.values()).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}
