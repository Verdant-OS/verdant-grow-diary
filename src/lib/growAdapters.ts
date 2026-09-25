// Pure adapter functions: Supabase row -> app domain shape (matches @/mock types).
// No side effects. No I/O. Safe to unit-test in isolation.
import type { TentRow, PlantRow, SensorReadingRow } from "@/lib/db";
import type {
  Tent,
  Plant,
  SensorReading,
  SensorReadingFreshness,
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
import { normalizePlantType } from "@/lib/plantTypeRules";
import { normalizePlantHealth } from "@/lib/plantHealthRules";

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
  return persistedStatusFloor(source, quality) ?? classifyCaptureTime(capturedAt, source, now);
}

/**
 * The part of a row's status fixed by persisted source and quality. These are
 * independent trust inputs and their least trusted result wins before
 * freshness is considered. Returns null when only capture time decides.
 */
function persistedStatusFloor(
  source: SensorReadingSource,
  quality: string | null | undefined,
): SensorReadingHealthStatus | null {
  const normalizedQuality = (quality ?? "").trim().toLowerCase();
  if (source === "invalid" || normalizedQuality === "invalid") return "invalid";
  if (source === "demo" || normalizedQuality === "degraded") return "needs_review";
  if (source === "stale" || normalizedQuality === "stale") return "stale";
  if (normalizedQuality && normalizedQuality !== "ok") return "needs_review";
  return null;
}

/** The time-sensitive part of a row's status, from the canonical contract. */
function classifyCaptureTime(
  capturedAt: string | null | undefined,
  source: SensorReadingSource,
  now: Date,
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

function freshnessForRow(
  source: SensorReadingSource,
  quality: string | null | undefined,
): SensorReadingFreshness {
  const floor = persistedStatusFloor(source, quality);
  return floor === null ? { floor: null, timeSources: [source] } : { floor, timeSources: [] };
}

/** Fold one more row's recompute inputs into a grouped reading's. */
function mergeFreshness(
  left: SensorReadingFreshness,
  right: SensorReadingFreshness,
): SensorReadingFreshness {
  const floor =
    left.floor === null
      ? right.floor
      : right.floor === null
        ? left.floor
        : leastTrustedStatus(left.floor, right.floor);
  const timeSources = [...left.timeSources];
  for (const source of right.timeSources) {
    if (!timeSources.includes(source)) timeSources.push(source);
  }
  return { floor, timeSources };
}

/**
 * Recompute a mapped reading's status against `now` without a refetch.
 *
 * `groupSensorReadingRows` classifies once, at fetch time, and caches the
 * result on `status`. A presenter that ticks its own clock (Sensor Data)
 * re-labels the source badge against `now` while `classifySensorReadingTrust`
 * still reads the cached status, so a quality-ok reading captured a few
 * minutes ahead of the clock stays "invalid" after the clock catches up until
 * the page reloads. This recomputes only the time-sensitive part from the
 * retained inputs: the persisted floor (explicit invalid, degraded, demo,
 * stale) is never revised, so nothing untrusted is ever promoted.
 *
 * Readings without retained inputs (legacy fixtures) are returned unchanged.
 * Returns the same object when the status does not change, so memoised
 * presenters do not churn.
 */
export function refreshSensorReadingStatus<T extends SensorReading | null | undefined>(
  reading: T,
  now: Date,
): T {
  if (!reading || !reading.freshness) return reading;
  const { floor, timeSources } = reading.freshness;
  let status: SensorReadingHealthStatus | null = floor;
  for (const source of timeSources) {
    const timed = classifyCaptureTime(reading.capturedAt, source, now);
    status = status === null ? timed : leastTrustedStatus(status, timed);
  }
  if (status === null || status === reading.status) return reading;
  return { ...reading, status } as T;
}

/**
 * `refreshSensorReadingStatus` over a list. Order is preserved, inputs are not
 * mutated, and the same array is returned when no reading changed.
 */
export function refreshSensorReadingsStatus(
  readings: readonly SensorReading[],
  now: Date,
): SensorReading[] {
  let changed = false;
  const out = readings.map((reading) => {
    const next = refreshSensorReadingStatus(reading, now);
    if (next !== reading) changed = true;
    return next;
  });
  return changed ? out : (readings as SensorReading[]);
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

/**
 * Preserve the missing/unknown-stage signal so stage-aware UI (VPD badges,
 * stability summaries) can render the correct guidance. Returns null when the
 * source row's stage is missing or unmapped — never silently coerces to
 * "seedling".
 */
function coerceStage(v: string | null | undefined): Stage | null {
  return (VALID_STAGES as readonly string[]).includes(v ?? "") ? (v as Stage) : null;
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
    health: normalizePlantHealth(row.health),
    photo: row.photo_url ?? "",
    lastNote: row.last_note ?? "",
    growId: row.grow_id ?? null,
    isArchived: Boolean(row.is_archived ?? false),
    medium: cleanPlantString(row.medium),
    potSize: cleanPlantString(row.pot_size),
    plantType: normalizePlantType((row as { plant_type?: string | null }).plant_type ?? null),
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
    freshness: freshnessForRow(source, row.quality),
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
    const rowFreshness = freshnessForRow(rowSource, row.quality);
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
        freshness: rowFreshness,
      };
      byKey.set(key, reading);
    } else {
      // Mixed provenance at one timestamp fails closed. The normal ingest
      // emits one lineage for every metric, but malformed/mixed persistence
      // must never let the first physical-looking row promote the group.
      reading.source = leastTrustedSource(reading.source, rowSource);
      reading.status = leastTrustedStatus(reading.status, rowStatus);
      reading.freshness = mergeFreshness(reading.freshness ?? rowFreshness, rowFreshness);
    }
    const observedMetric = applyMetric(reading, row.metric, row.value);
    if (observedMetric && !reading.observedMetrics?.includes(observedMetric)) {
      reading.observedMetrics?.push(observedMetric);
    }
  }
  return Array.from(byKey.values()).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}
