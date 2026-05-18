// Thin Supabase data-access layer for Phase 1 tables.
// Boring, predictable: each fn returns mapped domain objects or throws.
// Not wired into UI yet; safe to import alongside mock data.
import { supabase } from "@/integrations/supabase/client";
import type { SensorReadingInsert } from "@/lib/db";
import type { Tent, Plant, SensorReading } from "@/mock";
import { mapTentRow, mapPlantRow, groupSensorReadingRows } from "./growAdapters";

function fail(scope: string, error: { message?: string } | null): never {
  throw new Error(`growRepo.${scope}: ${error?.message ?? "unknown error"}`);
}

// Guard against legacy/mock string ids (e.g. "t1", "p1") which would cause
// Postgres uuid columns to 400. When a non-UUID is passed, repo callers
// short-circuit and let the useGrowData fallback layer serve mock data.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: string | undefined | null): v is string =>
  !!v && UUID_RE.test(v);

export async function fetchTents(): Promise<Tent[]> {
  const { data, error } = await supabase
    .from("tents")
    .select("*")
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (error) fail("fetchTents", error);
  return (data ?? []).map(mapTentRow);
}

export async function fetchTent(id: string): Promise<Tent | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("tents").select("*").eq("id", id).maybeSingle();
  if (error) fail("fetchTent", error);
  return data ? mapTentRow(data) : null;
}

export async function fetchPlants(tentId?: string): Promise<Plant[]> {
  // Non-UUID tentId (e.g. mock "t1") would 400 against a uuid column.
  // Return empty so the hook falls back to mock-filtered plants.
  if (tentId !== undefined && !isUuid(tentId)) return [];
  let q = supabase.from("plants").select("*").eq("is_archived", false);
  if (tentId) q = q.eq("tent_id", tentId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) fail("fetchPlants", error);
  return (data ?? []).map(mapPlantRow);
}

export async function fetchPlant(id: string): Promise<Plant | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("plants").select("*").eq("id", id).maybeSingle();
  if (error) fail("fetchPlant", error);
  return data ? mapPlantRow(data) : null;
}

export async function fetchSensorReadings(tentId?: string): Promise<SensorReading[]> {
  if (tentId !== undefined && !isUuid(tentId)) return [];
  let q = supabase.from("sensor_readings").select("*");
  if (tentId) q = q.eq("tent_id", tentId);
  const { data, error } = await q.order("ts", { ascending: false }).limit(2000);
  if (error) fail("fetchSensorReadings", error);
  return groupSensorReadingRows(data ?? []);
}

export async function insertSensorReading(
  row: SensorReadingInsert,
): Promise<void> {
  const { error } = await supabase.from("sensor_readings").insert(row);
  if (error) fail("insertSensorReading", error);
}
