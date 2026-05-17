/**
 * Centralized, type-safe permission guards.
 *
 * RLS is the source of truth at the DB layer — these guards add an explicit,
 * pre-flight, app-side check so:
 *   1. Unauthenticated callers fail with a clear error before ever hitting
 *      the network.
 *   2. Operator-only writes (cross-user updates, role assignment) are
 *      blocked locally with a consistent error shape.
 *   3. Sensitive helpers are typed: TS won't let you call them without
 *      passing a previously-resolved `Caller`.
 *
 * IMPORTANT: never weaken the corresponding RLS policy because of these
 * guards. They are defence-in-depth, not a replacement.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  type AppRole,
  type DiaryEntryInsert,
  type DiaryEntryRow,
  type DiaryEntryUpdate,
  type GrowInsert,
  type GrowRow,
  type GrowUpdate,
  type HarvestInsert,
  type HarvestRow,
  type PlantRow,
  type UserRoleInsert,
  type UserRoleRow,
  archiveGrow as _archiveGrow,
  assignRole as _assignRole,
  deleteDiaryEntry as _deleteDiaryEntry,
  fetchDiaryEntryRows as _fetchDiaryEntryRows,
  fetchGrowRow as _fetchGrowRow,
  fetchGrowRows as _fetchGrowRows,
  fetchHarvestRows as _fetchHarvestRows,
  fetchUserRoles as _fetchUserRoles,
  insertDiaryEntryRow as _insertDiaryEntryRow,
  insertGrowRow as _insertGrowRow,
  insertHarvestRow as _insertHarvestRow,
  updateDiaryEntryRow as _updateDiaryEntryRow,
  updateGrowRow as _updateGrowRow,
} from "@/lib/db";

/* ------------------------------------------------------------------ */
//  Errors
/* ------------------------------------------------------------------ */
export class PermissionError extends Error {
  readonly code: "unauthenticated" | "forbidden";
  constructor(code: "unauthenticated" | "forbidden", scope: string, detail?: string) {
    super(`permissions.${scope}: ${code}${detail ? ` (${detail})` : ""}`);
    this.code = code;
    this.name = "PermissionError";
  }
}

/* ------------------------------------------------------------------ */
//  Caller — authenticated identity + cached role set.
/* ------------------------------------------------------------------ */
export interface Caller {
  readonly userId: string;
  readonly roles: ReadonlySet<AppRole>;
}

/**
 * Resolve the current caller from the live auth session and cached role
 * lookup. Throws PermissionError("unauthenticated") if there is no session.
 * Returns a frozen Caller; never use a bare userId string anywhere these
 * guards are required.
 */
export async function resolveCaller(): Promise<Caller> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    throw new PermissionError("unauthenticated", "resolveCaller", error?.message);
  }
  const userId = data.user.id;
  const roles = await _fetchUserRoles(userId);
  return Object.freeze({ userId, roles: new Set<AppRole>(roles) });
}

/** Pure predicate — no I/O. Safe to use from view-model composers. */
export function hasRole(caller: Caller, role: AppRole): boolean {
  return caller.roles.has(role);
}

/** Pure predicate — true when caller owns the row's user_id. */
export function ownsRow(caller: Caller, row: { user_id: string }): boolean {
  return caller.userId === row.user_id;
}

/** Operator OR owner — the standard read/update authorization rule. */
export function canAccessRow(caller: Caller, row: { user_id: string }): boolean {
  return ownsRow(caller, row) || hasRole(caller, "operator");
}

function requireRole(caller: Caller, role: AppRole, scope: string): void {
  if (!hasRole(caller, role)) {
    throw new PermissionError("forbidden", scope, `missing role: ${role}`);
  }
}

function requireOwnership(
  caller: Caller,
  resourceUserId: string,
  scope: string,
): void {
  if (caller.userId !== resourceUserId && !hasRole(caller, "operator")) {
    throw new PermissionError("forbidden", scope, "not owner and not operator");
  }
}

/* ------------------------------------------------------------------ */
//  Guarded query surface
//
//  Every function takes a Caller as its first argument. TypeScript prevents
//  callers from "forgetting" the auth check — there is no overload that
//  omits it.
/* ------------------------------------------------------------------ */

/* ---------- Grows ---------- */
export function listGrowsForCaller(_caller: Caller): Promise<GrowRow[]> {
  // RLS already scopes to caller; the Caller arg enforces that we *have* one.
  return _fetchGrowRows();
}

export async function getGrowForCaller(
  caller: Caller,
  id: string,
): Promise<GrowRow | null> {
  const row = await _fetchGrowRow(id);
  if (!row) return null;
  if (!canAccessRow(caller, row)) {
    throw new PermissionError("forbidden", "getGrowForCaller", "row not visible");
  }
  return row;
}

export function createGrowForCaller(
  caller: Caller,
  row: Omit<GrowInsert, "user_id">,
): Promise<GrowRow> {
  return _insertGrowRow({ ...row, user_id: caller.userId });
}

export async function updateGrowForCaller(
  caller: Caller,
  id: string,
  patch: GrowUpdate,
): Promise<GrowRow> {
  const existing = await _fetchGrowRow(id);
  if (!existing) {
    throw new PermissionError("forbidden", "updateGrowForCaller", "grow not found");
  }
  requireOwnership(caller, existing.user_id, "updateGrowForCaller");
  // Never let the caller reassign ownership through the patch.
  const { user_id: _ignored, ...safePatch } = patch;
  return _updateGrowRow(id, safePatch);
}

export async function archiveGrowForCaller(caller: Caller, id: string): Promise<void> {
  const existing = await _fetchGrowRow(id);
  if (!existing) {
    throw new PermissionError("forbidden", "archiveGrowForCaller", "grow not found");
  }
  requireOwnership(caller, existing.user_id, "archiveGrowForCaller");
  await _archiveGrow(id);
}

/* ---------- Diary Entries ---------- */
export function listDiaryEntriesForCaller(
  _caller: Caller,
  growId?: string,
): Promise<DiaryEntryRow[]> {
  return _fetchDiaryEntryRows(growId);
}

export function createDiaryEntryForCaller(
  caller: Caller,
  row: Omit<DiaryEntryInsert, "user_id">,
): Promise<DiaryEntryRow> {
  return _insertDiaryEntryRow({ ...row, user_id: caller.userId });
}

export async function updateDiaryEntryForCaller(
  caller: Caller,
  id: string,
  patch: DiaryEntryUpdate,
  existingUserId: string,
): Promise<DiaryEntryRow> {
  requireOwnership(caller, existingUserId, "updateDiaryEntryForCaller");
  const { user_id: _ignored, ...safePatch } = patch;
  return _updateDiaryEntryRow(id, safePatch);
}

export async function deleteDiaryEntryForCaller(
  caller: Caller,
  id: string,
  existingUserId: string,
): Promise<void> {
  requireOwnership(caller, existingUserId, "deleteDiaryEntryForCaller");
  await _deleteDiaryEntry(id);
}

/* ---------- Harvests ---------- */
export function listHarvestsForCaller(
  _caller: Caller,
  growId?: string,
): Promise<HarvestRow[]> {
  return _fetchHarvestRows(growId);
}

export function createHarvestForCaller(
  caller: Caller,
  row: Omit<HarvestInsert, "user_id">,
): Promise<HarvestRow> {
  return _insertHarvestRow({ ...row, user_id: caller.userId });
}

/* ---------- Plants (operator-only cross-user moderation example) ---------- */
export async function moderatePlantAsOperator(
  caller: Caller,
  plantId: string,
  patch: Partial<Pick<PlantRow, "health" | "stage" | "is_archived">>,
): Promise<void> {
  requireRole(caller, "operator", "moderatePlantAsOperator");
  const { error } = await supabase.from("plants").update(patch).eq("id", plantId);
  if (error) {
    throw new Error(`permissions.moderatePlantAsOperator: ${error.message}`);
  }
}

/* ---------- Role assignment (operator only) ---------- */
export function assignRoleAsOperator(
  caller: Caller,
  row: UserRoleInsert,
): Promise<UserRoleRow> {
  requireRole(caller, "operator", "assignRoleAsOperator");
  return _assignRole(row);
}
