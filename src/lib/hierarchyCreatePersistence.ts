import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/isUuid";

export type HierarchyCreateAttempt =
  | {
      entity: "grow";
      rowId: string;
      ownerId: string;
    }
  | {
      entity: "tent";
      rowId: string;
      ownerId: string;
      growId: string;
    }
  | {
      entity: "plant";
      rowId: string;
      ownerId: string;
      growId: string;
      tentId: string | null;
    };

export interface ConfirmedHierarchyCreateRow {
  id: string;
  user_id: string;
  grow_id?: string | null;
  tent_id?: string | null;
  [key: string]: unknown;
}

export type HierarchyCreateReconciliationResult =
  | { status: "confirmed"; confirmed: { row: ConfirmedHierarchyCreateRow } }
  | { status: "not_found" | "unavailable" };

export type HierarchyCreatePersistenceResult =
  | { status: "confirmed"; confirmed: { row: ConfirmedHierarchyCreateRow } }
  | { status: "definitive_error"; message: string }
  | { status: "unknown" };

/** Mint one exact row identity before a logical Grow, Tent, or Plant write begins. */
export function newHierarchyCreateAttemptId(): string {
  const id = globalThis.crypto?.randomUUID?.();
  if (!isUuid(id)) throw new Error("secure_random_unavailable");
  return id.toLowerCase();
}

/**
 * A duplicate key can be the same preallocated retry identity, while network
 * errors can arrive after Postgres committed. Both must be reconciled instead
 * of blindly retried.
 */
export function isAmbiguousHierarchyInsertError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  if (code === "23505") return true;
  if (code !== "" && code != null) return false;
  const message = (error as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    /failed to fetch|fetch failed|network(?:error| request failed)|load failed/i.test(message)
  );
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function rowFromUnknown(value: unknown): ConfirmedHierarchyCreateRow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.user_id !== "string") return null;
  return row as ConfirmedHierarchyCreateRow;
}

/**
 * Confirm a returned or reconciled row only if it is the one preallocated for
 * this logical write and remains in the submitted owner's exact hierarchy.
 */
export function confirmHierarchyCreateAttemptRow(
  value: unknown,
  attempt: HierarchyCreateAttempt,
): { row: ConfirmedHierarchyCreateRow } | null {
  const row = rowFromUnknown(value);
  if (!row || row.id !== attempt.rowId || row.user_id !== attempt.ownerId) return null;

  if (attempt.entity === "grow") return { row };
  if (nullableString(row.grow_id) !== attempt.growId) return null;
  if (attempt.entity === "tent") return { row };
  if (nullableString(row.tent_id) !== attempt.tentId) return null;
  return { row };
}

function tableForAttempt(attempt: HierarchyCreateAttempt): "grows" | "tents" | "plants" {
  if (attempt.entity === "grow") return "grows";
  if (attempt.entity === "tent") return "tents";
  return "plants";
}

function selectForAttempt(attempt: HierarchyCreateAttempt): string {
  if (attempt.entity === "grow") return "id,name,user_id";
  if (attempt.entity === "tent") return "id,name,user_id,grow_id";
  return "id,name,user_id,grow_id,tent_id";
}

function reconciliationSelectForAttempt(attempt: HierarchyCreateAttempt): string {
  if (attempt.entity === "grow") return "id,user_id";
  if (attempt.entity === "tent") return "id,user_id,grow_id";
  return "id,user_id,grow_id,tent_id";
}

function errorMessage(error: unknown, fallback: string): string {
  return typeof error === "object" &&
    error &&
    typeof (error as { message?: unknown }).message === "string"
    ? (error as { message: string }).message
    : fallback;
}

/**
 * Re-read only the preallocated UUID through the signed-in client's normal
 * SELECT RLS. A row that cannot be read, or whose owner/hierarchy differs,
 * never becomes a confirmed create result.
 */
export async function reconcileHierarchyCreateAttempt(
  client: Pick<SupabaseClient, "from">,
  attempt: HierarchyCreateAttempt,
): Promise<HierarchyCreateReconciliationResult> {
  try {
    const { data, error } = await client
      .from(tableForAttempt(attempt) as never)
      .select(reconciliationSelectForAttempt(attempt))
      .eq("id", attempt.rowId)
      .eq("user_id", attempt.ownerId)
      .maybeSingle();
    if (error) return { status: "unavailable" };
    if (!data) return { status: "not_found" };
    const confirmed = confirmHierarchyCreateAttemptRow(data, attempt);
    return confirmed ? { status: "confirmed", confirmed } : { status: "unavailable" };
  } catch {
    return { status: "unavailable" };
  }
}

/**
 * Insert one preallocated hierarchy row and reconcile only errors that may
 * have committed after the client lost its response. Callers can safely offer
 * a normal error retry only for `definitive_error`; `unknown` must stay locked
 * until a later page runtime can complete exact owner-scoped reconciliation.
 */
export async function persistHierarchyCreateAttempt(
  client: Pick<SupabaseClient, "from">,
  attempt: HierarchyCreateAttempt,
  payload: Record<string, unknown>,
): Promise<HierarchyCreatePersistenceResult> {
  let data: unknown = null;
  let error: unknown = null;
  let insertThrew = false;
  try {
    const result = await client
      .from(tableForAttempt(attempt) as never)
      .insert(payload as never)
      .select(selectForAttempt(attempt))
      .single();
    data = result.data;
    error = result.error;
  } catch {
    insertThrew = true;
  }

  let confirmed = !error ? confirmHierarchyCreateAttemptRow(data, attempt) : null;
  const needsReconciliation =
    insertThrew || isAmbiguousHierarchyInsertError(error) || (!error && !confirmed);
  if (needsReconciliation) {
    const reconciliation = await reconcileHierarchyCreateAttempt(client, attempt);
    if (reconciliation.status === "confirmed") confirmed = reconciliation.confirmed;
  }

  if (confirmed) return { status: "confirmed", confirmed };
  if (needsReconciliation) return { status: "unknown" };
  return { status: "definitive_error", message: errorMessage(error, "Could not create record") };
}
