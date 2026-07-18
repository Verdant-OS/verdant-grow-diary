// Pure adapter functions: Supabase row -> app domain shape (matches @/mock types).
// No side effects. No I/O. Safe to unit-test in isolation.
import type { TentRow, PlantRow, SensorReadingRow } from "@/lib/db";
import type {
  Tent,
  Plant,
  SensorReading,
  SensorReadingSource,
  SensorReadingHealthStatus,
  SensorReadingMetricKey,
  Stage,
} from "@/mock";
import {
  classifySensorSnapshotStatus,
  type SensorSnapshotStatus,
} from "@/lib/sensorSnapshotStatusContract";
import { isSensorTestbenchRow } from "@/lib/sensorTestbenchIndicatorRules";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";

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
 * SensorReadingSource union. Unknown / empty values fail closed as
 * "invalid". A database row proves storage, not physical sensor provenance.
 */
function coerceSource(v: string | null | undefined): SensorReadingSource {
  const s = (v ?? "").toLowerCase();
  return (VALID_SOURCES as readonly string[]).includes(s) ? (s as SensorReadingSource) : "invalid";
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
  quality: string | null | undefined,
  now: Date = new Date(),
): SensorReadingHealthStatus {
  const normalizedQuality = (quality ?? "").trim().toLowerCase();
  // Persisted source and quality are independent trust inputs. Their least
  // trusted result wins before freshness is considered.
  if (source === "invalid" || normalizedQuality === "invalid") return "invalid";
  if (source === "demo" || normalizedQuality === "degraded") return "needs_review";
  if (source === "stale" || normalizedQuality === "stale") return "stale";
  if (normalizedQuality && normalizedQuality !== "ok") return "needs_review";
  const result = classifySensorSnapshotStatus({
    rowsReceived: 1,
    rowsAccepted: 1,
    capturedAt: capturedAt ?? null,
    source,
    now,
  });
  return result.status as SensorSnapshotStatus;
}

const STATUS_TRUST_RANK: Record<SensorReadingHealthStatus, number> = {
  usable: 0,
  stale: 1,
  needs_review: 2,
  no_data: 3,
  invalid: 4,
};

/**
 * Provenance trust is independent from freshness/quality status. A grouped
 * snapshot must never retain `live` merely because that row happened to be
 * encountered first. This explicit rank makes mixed persisted rows fail
 * closed and keeps the result stable under input reordering.
 */
const SOURCE_TRUST_RANK: Record<SensorReadingSource, number> = {
  live: 0,
  manual: 1,
  csv: 2,
  stale: 3,
  demo: 4,
  invalid: 5,
};

function leastTrustedStatus(
  left: SensorReadingHealthStatus,
  right: SensorReadingHealthStatus,
): SensorReadingHealthStatus {
  return STATUS_TRUST_RANK[right] > STATUS_TRUST_RANK[left] ? right : left;
}

function leastTrustedSource(
  left: SensorReadingSource,
  right: SensorReadingSource,
): SensorReadingSource {
  return SOURCE_TRUST_RANK[right] > SOURCE_TRUST_RANK[left] ? right : left;
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
 * SensorReading. Legacy numeric fields retain zero defaults for compatibility,
 * while `observedMetrics` records the only values that are real evidence.
 * Prefer `groupSensorReadingRows` for fetch results.
 */
export function mapSensorReadingRow(row: SensorReadingRow, now: Date = new Date()): SensorReading {
  const source = resolveSensorReadingSource(row);
  const capturedAt = resolveSensorObservationTime(row) ?? row.ts;
  const reading: SensorReading = {
    ts: capturedAt,
    tentId: row.tent_id,
    temp: 0,
    rh: 0,
    vpd: 0,
    co2: 0,
    soil: 0,
    observedMetrics: [],
    source,
    status: deriveReadingStatus(capturedAt, source, row.quality, now),
    capturedAt,
  };
  const observedMetric = applyMetric(reading, row.metric, row.value);
  if (observedMetric) reading.observedMetrics?.push(observedMetric);
  return reading;
}

function applyMetric(
  reading: SensorReading,
  metric: string,
  rawValue: number | string | null | undefined,
): SensorReadingMetricKey | null {
  if (rawValue === null || rawValue === undefined) return null;
  if (typeof rawValue === "string" && rawValue.trim().length === 0) return null;
  const v = Number(rawValue);
  if (!Number.isFinite(v)) return null;
  switch (metric) {
    case "temperature_c":
      reading.temp = v;
      return "temp";
    case "humidity_pct":
      reading.rh = v;
      return "rh";
    case "vpd_kpa":
      reading.vpd = v;
      return "vpd";
    case "co2_ppm":
      reading.co2 = v;
      return "co2";
    case "soil_moisture_pct":
      reading.soil = v;
      return "soil";
    case "ppfd":
    case "ppfd_umol_m2_s":
      reading.ppfd = v;
      return "ppfd";
    default:
      return null;
  }
}

/**
 * Groups long-form sensor_readings rows by (tent_id, ts) into the legacy
 * mock-shaped SensorReading objects. Compatibility fields keep zero defaults,
 * but `observedMetrics` preserves missingness so UI code cannot treat those
 * zeroes as measurements. Sorted by ts descending (newest first).
 *
 * In practice all per-metric rows from one ingest share source/captured_at.
 * If persisted rows are mixed, the explicitly least-trusted provenance and
 * status win, so ordering can never promote untrusted evidence. Status is
 * derived from the contract — never inline-classified.
 */
export function groupSensorReadingRows(
  rows: SensorReadingRow[],
  now: Date = new Date(),
): SensorReading[] {
  const byKey = new Map<string, SensorReading>();
  for (const row of rows) {
    const rowCapturedAt = resolveSensorObservationTime(row) ?? row.ts;
    const key = `${row.tent_id}|${rowCapturedAt}`;
    const rowSource = resolveSensorReadingSource(row);
    const rowStatus = deriveReadingStatus(rowCapturedAt, rowSource, row.quality, now);
    let reading = byKey.get(key);
    if (!reading) {
      reading = {
        ts: rowCapturedAt,
        tentId: row.tent_id,
        temp: 0,
        rh: 0,
        vpd: 0,
        co2: 0,
        soil: 0,
        observedMetrics: [],
        source: rowSource,
        status: rowStatus,
        capturedAt: rowCapturedAt,
      };
      byKey.set(key, reading);
    } else {
      // Mixed provenance at one timestamp fails closed. The normal ingest
      // emits one lineage for every metric, but malformed/mixed persistence
      // must never let the first physical-looking row promote the group.
      reading.source = leastTrustedSource(reading.source, rowSource);
      reading.status = leastTrustedStatus(reading.status, rowStatus);
    }
    const observedMetric = applyMetric(reading, row.metric, row.value);
    if (observedMetric && !reading.observedMetrics?.includes(observedMetric)) {
      reading.observedMetrics?.push(observedMetric);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}
