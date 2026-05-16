// Pure adapter functions: Supabase row -> app domain shape (matches @/mock types).
// No side effects. No I/O. Safe to unit-test in isolation.
import type { Tables } from "@/integrations/supabase/types";
import type { Tent, Plant, SensorReading, Stage } from "@/mock";

type TentRow = Tables<"tents">;
type PlantRow = Tables<"plants">;
type SensorRow = Tables<"sensor_readings">;

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
  };
}

/**
 * Maps the per-metric sensor_readings rows for a single timestamp into the
 * legacy mock-shaped SensorReading. Values default to 0 when not present.
 */
export function mapSensorReadingRow(row: SensorRow): SensorReading {
  const reading: SensorReading = {
    ts: row.ts,
    tentId: row.tent_id,
    temp: 0,
    rh: 0,
    vpd: 0,
    co2: 0,
    soil: 0,
  };
  const v = Number(row.value);
  if (!Number.isFinite(v)) return reading;
  switch (row.metric) {
    case "temperature_c": reading.temp = v; break;
    case "humidity_pct": reading.rh = v; break;
    case "vpd_kpa": reading.vpd = v; break;
    case "co2_ppm": reading.co2 = v; break;
    case "soil_moisture_pct": reading.soil = v; break;
  }
  return reading;
}
