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
  if (!id) return null;
  const { data, error } = await supabase.from("tents").select("*").eq("id", id).maybeSingle();
  if (error) fail("fetchTent", error);
  return data ? mapTentRow(data) : null;
}

export async function fetchPlants(tentId?: string): Promise<Plant[]> {
  let q = supabase.from("plants").select("*").eq("is_archived", false);
  if (tentId) q = q.eq("tent_id", tentId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) fail("fetchPlants", error);
  return (data ?? []).map(mapPlantRow);
}

export async function fetchPlant(id: string): Promise<Plant | null> {
  if (!id) return null;
  const { data, error } = await supabase.from("plants").select("*").eq("id", id).maybeSingle();
  if (error) fail("fetchPlant", error);
  return data ? mapPlantRow(data) : null;
}

export async function fetchSensorReadings(tentId?: string): Promise<SensorReading[]> {
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
