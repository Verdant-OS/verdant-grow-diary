/**
 * Typed Supabase database layer.
 *
 * Re-exports generated table types as plain aliases so the rest of the app
 * never imports from the generated file directly. If the generated types are
 * regenerated, only this file needs auditing.
 */
import { supabase } from "@/integrations/supabase/client";
import type {
  Tables,
  TablesInsert,
  TablesUpdate,
  Enums,
} from "@/integrations/supabase/types";

/* ------------------------------------------------------------------ */
//  Row types — what comes back from SELECT *
/* ------------------------------------------------------------------ */
export type GrowRow = Tables<"grows">;
export type TentRow = Tables<"tents">;
export type PlantRow = Tables<"plants">;
export type DiaryEntryRow = Tables<"diary_entries">;
export type HarvestRow = Tables<"harvests">;
export type SensorReadingRow = Tables<"sensor_readings">;
export type ProfileRow = Tables<"profiles">;
export type UnlockRow = Tables<"unlocks">;
export type UserQuestRow = Tables<"user_quests">;
export type UserRoleRow = Tables<"user_roles">;
export type NugEventRow = Tables<"nug_events">;

/* ------------------------------------------------------------------ */
//  Insert / Update payload types
/* ------------------------------------------------------------------ */
export type GrowInsert = TablesInsert<"grows">;
export type TentInsert = TablesInsert<"tents">;
export type PlantInsert = TablesInsert<"plants">;
export type DiaryEntryInsert = TablesInsert<"diary_entries">;
export type HarvestInsert = TablesInsert<"harvests">;
export type SensorReadingInsert = TablesInsert<"sensor_readings">;
export type ProfileInsert = TablesInsert<"profiles">;
export type UnlockInsert = TablesInsert<"unlocks">;
export type UserQuestInsert = TablesInsert<"user_quests">;
export type UserRoleInsert = TablesInsert<"user_roles">;
export type NugEventInsert = TablesInsert<"nug_events">;

export type GrowUpdate = TablesUpdate<"grows">;
export type TentUpdate = TablesUpdate<"tents">;
export type PlantUpdate = TablesUpdate<"plants">;
export type DiaryEntryUpdate = TablesUpdate<"diary_entries">;
export type HarvestUpdate = TablesUpdate<"harvests">;
export type SensorReadingUpdate = TablesUpdate<"sensor_readings">;
export type ProfileUpdate = TablesUpdate<"profiles">;
export type UnlockUpdate = TablesUpdate<"unlocks">;
export type UserQuestUpdate = TablesUpdate<"user_quests">;
export type UserRoleUpdate = TablesUpdate<"user_roles">;
export type NugEventUpdate = TablesUpdate<"nug_events">;

/* ------------------------------------------------------------------ */
//  Enum types
/* ------------------------------------------------------------------ */
export type AppRole = Enums<"app_role">;

/* ------------------------------------------------------------------ */
//  Small helper — not exported, keeps DRY.
/* ------------------------------------------------------------------ */
function fail(scope: string, error: { message?: string } | null): never {
  throw new Error(`db.${scope}: ${error?.message ?? "unknown error"}`);
}

/* ------------------------------------------------------------------ */
//  Typed CRUD helpers — Grows
/* ------------------------------------------------------------------ */
export async function fetchGrowRows(): Promise<GrowRow[]> {
  const { data, error } = await supabase
    .from("grows")
    .select("*")
    .eq("is_archived", false)
    .order("created_at", { ascending: false });
  if (error) fail("fetchGrowRows", error);
  return (data as GrowRow[]) ?? [];
}

export async function fetchGrowRow(id: string): Promise<GrowRow | null> {
  if (!id) return null;
  const { data, error } = await supabase
    .from("grows")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) fail("fetchGrowRow", error);
  return (data as GrowRow | null) ?? null;
}

export async function insertGrowRow(row: GrowInsert): Promise<GrowRow> {
  const { data, error } = await supabase
    .from("grows")
    .insert(row)
    .select()
    .single();
  if (error) fail("insertGrowRow", error);
  return data as GrowRow;
}

export async function updateGrowRow(
  id: string,
  patch: GrowUpdate,
): Promise<GrowRow> {
  const { data, error } = await supabase
    .from("grows")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) fail("updateGrowRow", error);
  return data as GrowRow;
}

export async function archiveGrow(id: string): Promise<void> {
  const { error } = await supabase
    .from("grows")
    .update({ is_archived: true })
    .eq("id", id);
  if (error) fail("archiveGrow", error);
}

/* ------------------------------------------------------------------ */
//  Typed CRUD helpers — Diary Entries
/* ------------------------------------------------------------------ */
export async function fetchDiaryEntryRows(growId?: string): Promise<DiaryEntryRow[]> {
  let q = supabase.from("diary_entries").select("*");
  if (growId) q = q.eq("grow_id", growId);
  const { data, error } = await q.order("entry_at", { ascending: false });
  if (error) fail("fetchDiaryEntryRows", error);
  return (data as DiaryEntryRow[]) ?? [];
}

export async function insertDiaryEntryRow(row: DiaryEntryInsert): Promise<DiaryEntryRow> {
  const { data, error } = await supabase
    .from("diary_entries")
    .insert(row)
    .select()
    .single();
  if (error) fail("insertDiaryEntryRow", error);
  return data as DiaryEntryRow;
}

export async function updateDiaryEntryRow(
  id: string,
  patch: DiaryEntryUpdate,
): Promise<DiaryEntryRow> {
  const { data, error } = await supabase
    .from("diary_entries")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) fail("updateDiaryEntryRow", error);
  return data as DiaryEntryRow;
}

export async function deleteDiaryEntry(id: string): Promise<void> {
  const { error } = await supabase.from("diary_entries").delete().eq("id", id);
  if (error) fail("deleteDiaryEntry", error);
}

/* ------------------------------------------------------------------ */
//  Typed CRUD helpers — Harvests
/* ------------------------------------------------------------------ */
export async function fetchHarvestRows(growId?: string): Promise<HarvestRow[]> {
  let q = supabase.from("harvests").select("*");
  if (growId) q = q.eq("grow_id", growId);
  const { data, error } = await q.order("harvested_at", { ascending: false });
  if (error) fail("fetchHarvestRows", error);
  return (data as HarvestRow[]) ?? [];
}

export async function insertHarvestRow(row: HarvestInsert): Promise<HarvestRow> {
  const { data, error } = await supabase
    .from("harvests")
    .insert(row)
    .select()
    .single();
  if (error) fail("insertHarvestRow", error);
  return data as HarvestRow;
}

/* ------------------------------------------------------------------ */
//  Typed CRUD helpers — Profiles
/* ------------------------------------------------------------------ */
export async function fetchProfileRow(userId: string): Promise<ProfileRow | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) fail("fetchProfileRow", error);
  return (data as ProfileRow | null) ?? null;
}

export async function upsertProfileRow(row: ProfileInsert): Promise<ProfileRow> {
  const { data, error } = await supabase
    .from("profiles")
    .upsert(row)
    .select()
    .single();
  if (error) fail("upsertProfileRow", error);
  return data as ProfileRow;
}

/* ------------------------------------------------------------------ */
//  Typed CRUD helpers — User Roles
/* ------------------------------------------------------------------ */
export async function fetchUserRoles(userId: string): Promise<AppRole[]> {
  if (!userId) return [];
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) fail("fetchUserRoles", error);
  return ((data as { role: AppRole }[]) ?? []).map((r) => r.role);
}

export async function assignRole(row: UserRoleInsert): Promise<UserRoleRow> {
  const { data, error } = await supabase
    .from("user_roles")
    .insert(row)
    .select()
    .single();
  if (error) fail("assignRole", error);
  return data as UserRoleRow;
}

/* ------------------------------------------------------------------ */
//  Typed CRUD helpers — Unlocks & Quests
/* ------------------------------------------------------------------ */
export async function fetchUnlockRows(userId: string): Promise<UnlockRow[]> {
  const { data, error } = await supabase
    .from("unlocks")
    .select("*")
    .eq("user_id", userId)
    .order("unlocked_at", { ascending: false });
  if (error) fail("fetchUnlockRows", error);
  return (data as UnlockRow[]) ?? [];
}

export async function fetchUserQuestRows(userId: string): Promise<UserQuestRow[]> {
  const { data, error } = await supabase
    .from("user_quests")
    .select("*")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false });
  if (error) fail("fetchUserQuestRows", error);
  return (data as UserQuestRow[]) ?? [];
}
