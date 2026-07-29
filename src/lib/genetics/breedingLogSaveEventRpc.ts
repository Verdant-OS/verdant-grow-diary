/**
 * breedingLogSaveEventRpc — typed boundary for the `breeding_log_save_event`
 * audit RPC.
 *
 * Why this exists: Lovable regenerates `src/integrations/supabase/types.ts`
 * from the deployed schema. When a migration lands but types have not been
 * regenerated, the RPC name is absent from the generated union and callers are
 * forced into `unknown`/`as` casts at the call site. This module owns exactly
 * one narrow cast so UI components stay fully typed, and classifies the
 * "types out of sync with the database" case explicitly instead of surfacing it
 * as a generic failure.
 *
 * Hard constraints:
 *  - No writes beyond the single RPC the caller already intended.
 *  - No schema/RLS changes. No device control. No automation.
 *  - Pure classification: never throws; always returns a discriminated outcome.
 */

export const BREEDING_LOG_SAVE_EVENT_RPC = "breeding_log_save_event";

export interface BreedingLogSaveEventParams {
  p_idempotency_key: string;
  p_grow_id: string;
  p_plant_id: string;
  p_event_type: string;
  p_tent_id: string | null;
  p_method: string | null;
  p_intensity: string | null;
  p_details: Record<string, string>;
}

/** Shape returned by the RPC. Every field optional — the DB is untrusted. */
export interface BreedingLogSaveEventRow {
  ok?: boolean;
  grow_event_id?: string;
  reason?: string;
}

export interface RpcErrorLike {
  code?: string | null;
  message?: string | null;
}

export type BreedingLogSaveEventOutcome =
  | { status: "saved"; growEventId: string }
  | { status: "rejected"; reason: string }
  | { status: "schema_out_of_sync"; reason: string }
  | { status: "error"; reason: string };

/**
 * True when an error means the function is absent from the exposed API schema
 * — i.e. the migration has not been applied, or generated types/PostgREST cache
 * are stale. PGRST202 = function not found in schema cache; 42883 = undefined
 * function.
 */
export function isMissingRpcError(error: RpcErrorLike | null | undefined): boolean {
  if (!error) return false;
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST202" || code === "42883") return true;
  const message = (error.message ?? "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("could not find the function") ||
    message.includes("function public.breeding_log_save_event") ||
    (message.includes("breeding_log_save_event") && message.includes("does not exist"))
  );
}

/** Minimal client surface this module needs. Keeps callers off `any`. */
type RpcInvoker = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: RpcErrorLike | null }>;

export interface RpcCapableClient {
  rpc: unknown;
}

/** Narrow the RPC result without leaking `unknown` to callers. */
export function interpretBreedingLogSaveEventResult(
  data: unknown,
  error: RpcErrorLike | null | undefined,
): BreedingLogSaveEventOutcome {
  if (error) {
    if (isMissingRpcError(error)) {
      return {
        status: "schema_out_of_sync",
        reason: error.message ?? "breeding_log_save_event is not available",
      };
    }
    return { status: "error", reason: error.message ?? "unknown_error" };
  }
  const row = (data ?? null) as BreedingLogSaveEventRow | null;
  if (!row || row.ok !== true || !row.grow_event_id) {
    return { status: "rejected", reason: row?.reason ?? "unknown_error" };
  }
  return { status: "saved", growEventId: row.grow_event_id };
}

/**
 * Call the audit RPC and return a typed outcome. Never throws: transport and
 * schema faults are classified, so the caller can render a calm fallback.
 */
export async function saveBreedingLogEvent(
  client: RpcCapableClient,
  params: BreedingLogSaveEventParams,
): Promise<BreedingLogSaveEventOutcome> {
  const invoke = client.rpc as RpcInvoker;
  try {
    const { data, error } = await invoke.call(
      client,
      BREEDING_LOG_SAVE_EVENT_RPC,
      params as unknown as Record<string, unknown>,
    );
    return interpretBreedingLogSaveEventResult(data, error);
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    const asError: RpcErrorLike = { message };
    if (isMissingRpcError(asError)) {
      return { status: "schema_out_of_sync", reason: message };
    }
    return { status: "error", reason: message };
  }
}
