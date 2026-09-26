// Thin Supabase data-access layer for Phase 1 tables.
// Boring, predictable: each fn returns mapped domain objects or throws.
// Not wired into UI yet; safe to import alongside mock data.
import { supabase } from "@/integrations/supabase/client";
import {
  effectiveSensorReadingsQuery,
  requireEffectiveSensorReadings,
} from "@/lib/effectiveSensorReadings";
import type { SensorReadingInsert } from "@/lib/db";
import type { Tent, Plant, SensorReading } from "@/mock";
import { mapTentRow, mapPlantRow, groupSensorReadingRows } from "./growAdapters";
import { buildGrowScopedPlantsOrFilter } from "./growAttributionRules";
import { isUuid } from "./isUuid";
import { filterValidPlantRows, validatePlantRowResponse } from "./plantPayloadValidation";

function fail(scope: string, error: { message?: string } | null): never {
  throw new Error(`growRepo.${scope}: ${error?.message ?? "unknown error"}`);
}

export async function fetchTents(growId?: string): Promise<Tent[]> {
  if (growId !== undefined && !isUuid(growId)) return [];
  let q = supabase.from("tents").select("*").eq("is_archived", false);
  if (growId) q = q.eq("grow_id", growId);
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) fail("fetchTents", error);
  return (data ?? []).map(mapTentRow);
}

export async function fetchTent(id: string): Promise<Tent | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("tents").select("*").eq("id", id).maybeSingle();
  if (error) fail("fetchTent", error);
  return data ? mapTentRow(data) : null;
}

export interface FetchPlantsOptions {
  /**
   * Include archived (and merged-archived) plants in the result set.
   * Default false — archived plants are hidden from active grow work.
   */
  includeArchived?: boolean;
}

export async function fetchPlants(
  tentId?: string,
  growId?: string,
  opts: FetchPlantsOptions = {},
): Promise<Plant[]> {
  // Non-UUID tentId (e.g. legacy mock "t1") would 400 against a UUID column.
  // Return an honest empty list without querying or substituting fixtures.
  if (tentId !== undefined && !isUuid(tentId)) return [];
  if (growId !== undefined && !isUuid(growId)) return [];
  let q = supabase.from("plants").select("*");
  if (!opts.includeArchived) q = q.eq("is_archived", false);
  if (tentId) q = q.eq("tent_id", tentId);
  if (growId && !tentId) {
    // BUG-A: resolve the grow's plants through tent rollup too, so plants
    // whose own grow_id is null but whose tent belongs to the grow don't
    // vanish from grow-scoped views. A grow with no tents degrades to the
    // own-grow_id filter. A failed tent lookup fails the read instead: a
    // partial list would drop those plants while reading as current, and
    // their stages decide alert targets (Codex review on #1683; Grow Detail's
    // plant count likewise reports "unavailable" rather than undercounting).
    const { data: tents, error: tentsError } = await supabase
      .from("tents")
      .select("id")
      .eq("grow_id", growId);
    if (tentsError) fail("fetchPlants", tentsError);
    q = q.or(
      buildGrowScopedPlantsOrFilter(
        growId,
        (tents ?? []).map((t: { id: string }) => t.id),
      ),
    );
  } else if (growId) {
    q = q.eq("grow_id", growId);
  }
  const { data, error } = await q.order("created_at", { ascending: false });
  if (error) fail("fetchPlants", error);
  const { valid, rejected } = filterValidPlantRows(data ?? []);
  if (rejected > 0 && typeof console !== "undefined") {
    console.warn(`growRepo.fetchPlants: dropped ${rejected} malformed plant row(s)`);
  }
  return valid.map(mapPlantRow);
}

export async function fetchPlant(id: string): Promise<Plant | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("plants").select("*").eq("id", id).maybeSingle();
  if (error) fail("fetchPlant", error);
  if (!data) return null;
  const guard = validatePlantRowResponse(data);
  if (!guard.ok || !guard.value) {
    throw new Error(
      `growRepo.fetchPlant: plant row failed validation (${guard.errors.join("; ")})`,
    );
  }
  return mapPlantRow(guard.value);
}

export async function fetchSensorReadings(tentId?: string | null): Promise<SensorReading[]> {
  // `undefined` is the intentional aggregate read. `null` explicitly means
  // the caller has no selected tent and must fail closed without a query.
  if (tentId === null) return [];
  if (tentId !== undefined && !isUuid(tentId)) return [];
  let q = effectiveSensorReadingsQuery().select("*");
  if (tentId) q = q.eq("tent_id", tentId);
  const { data, error } = await q
    // Actual observation time leads: imported CSV rows preserve historical
    // `captured_at` while `ts` can be one shared import time.
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("ts", { ascending: false })
    .limit(2000);
  if (error) fail("fetchSensorReadings", error);
  return groupSensorReadingRows(requireEffectiveSensorReadings(data));
}

export async function insertSensorReading(row: SensorReadingInsert): Promise<void> {
  const { error } = await supabase.from("sensor_readings").insert(row);
  if (error) fail("insertSensorReading", error);
}

/**
 * Batch insert sensor readings. All rows are inserted in a single request to
 * the `sensor_readings` table; if any row is rejected by RLS or the validator
 * trigger, the entire batch fails (Postgres atomicity). Callers are expected
 * to pre-validate every row (see `useInsertSensorReadings`).
 *
 * Safety: writes only to `sensor_readings`. Does not touch alerts,
 * action_queue, devices, or any other table. Does not derive snapshots or
 * alerts as a side effect.
 */
export async function insertSensorReadingsBatch(rows: SensorReadingInsert[]): Promise<void> {
  if (!rows || rows.length === 0) return;
  const { error } = await supabase.from("sensor_readings").insert(rows);
  if (error) {
    // Keep the structured code so a frozen manual retry can verify a genuine
    // uniqueness conflict; callers must never infer one from message text.
    throw Object.assign(new Error(`growRepo.insertSensorReadingsBatch: ${error.message}`), {
      code: error.code,
    });
  }
}
