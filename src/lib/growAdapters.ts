// Pure adapter functions: Supabase row -> app domain shape (matches @/mock types).
// No side effects. No I/O. Safe to unit-test in isolation.
import type { TentRow, PlantRow, SensorReadingRow } from "@/lib/db";
import type { Tent, Plant, SensorReading, Stage } from "@/mock";

const VALID_STAGES: readonly Stage[] = ["seedling", "veg", "flower", "flush", "harvest", "cure"];
const VALID_HEALTH = ["healthy", "watch", "issue"] as const;
type Health = (typeof VALID_HEALTH)[number];

function coerceStage(v: string | null | undefined): Stage {
  return (VALID_STAGES as readonly string[]).includes(v ?? "") ? (v as Stage) : "seedling";
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
  };
}

/**
 * Maps a single per-metric sensor_readings row into the legacy mock-shaped
 * SensorReading. Missing metrics default to 0. Prefer `groupSensorReadingRows`
 * for fetch results — a single row alone reports only one metric.
 */
export function mapSensorReadingRow(row: SensorReadingRow): SensorReading {
  const reading: SensorReading = {
    ts: row.ts,
    tentId: row.tent_id,
    temp: 0,
    rh: 0,
    vpd: 0,
    co2: 0,
    soil: 0,
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
 */
export function groupSensorReadingRows(rows: SensorReadingRow[]): SensorReading[] {
  const byKey = new Map<string, SensorReading>();
  for (const row of rows) {
    const key = `${row.tent_id}|${row.ts}`;
    let reading = byKey.get(key);
    if (!reading) {
      reading = { ts: row.ts, tentId: row.tent_id, temp: 0, rh: 0, vpd: 0, co2: 0, soil: 0 };
      byKey.set(key, reading);
    }
    applyMetric(reading, row.metric, row.value);
  }
  return Array.from(byKey.values()).sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
}
