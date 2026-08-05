import { supabase } from "@/integrations/supabase/client";
import type { BreedingEventType } from "@/lib/genetics/breedingTypes";
import { isMissingRpcError, MissingAuditRpcError } from "@/lib/rpcAvailability/missingRpcError";

export const BREEDING_LOG_SAVE_EVENT_RPC_NAME = "breeding_log_save_event" as const;

/**
 * Type-safe wrapper around the `breeding_log_save_event` Postgres RPC.
 *
 * The generated Supabase types don't yet include this audit RPC, so this
 * module isolates the single narrow cast required to call it. Callers get a
 * fully typed request/response surface and never need to reach for `unknown`
 * or `any` themselves.
 */

export interface BreedingLogSaveEventArgs {
  idempotencyKey: string;
  growId: string;
  plantId: string;
  eventType: BreedingEventType;
  tentId: string | null;
  method: string | null;
  intensity: string | null;
  details: Record<string, string>;
}

/**
 * Every `reason` the RPC returns on a refusal, in lockstep with migration
 * 20260728163100. `src/test/breeding-log-save-event-reasons.test.ts` pins this
 * list against the migration's own SQL text, so adding or renaming a reason
 * server-side fails a test instead of silently reaching growers as a raw code.
 */
export const BREEDING_LOG_SAVE_EVENT_REASONS = [
  "not_authenticated",
  "invalid_idempotency_key",
  "invalid_event_type",
  "invalid_details",
  "grow_not_owned",
  "plant_required",
  "plant_not_in_grow",
  "plant_tent_not_owned",
  "plant_cross_grow",
  "tent_not_in_grow",
  "plant_not_in_tent",
  "idempotency_key_conflict",
  "save_failed",
] as const;

export type BreedingLogSaveEventReason = (typeof BREEDING_LOG_SAVE_EVENT_REASONS)[number];

export function isBreedingLogSaveEventReason(value: unknown): value is BreedingLogSaveEventReason {
  return (
    typeof value === "string" &&
    (BREEDING_LOG_SAVE_EVENT_REASONS as ReadonlyArray<string>).includes(value)
  );
}

/**
 * Grower-facing sentence per refusal reason. The RPC's reason codes are an
 * internal contract; surfacing them verbatim ("plant_not_in_tent") tells a
 * grower nothing and leaks schema vocabulary into the UI. Copy never implies
 * anything was saved.
 */
export const BREEDING_LOG_SAVE_EVENT_REASON_COPY: Readonly<
  Record<BreedingLogSaveEventReason, string>
> = Object.freeze({
  not_authenticated: "Sign in again to log this breeding event.",
  invalid_idempotency_key: "That submission couldn't be identified safely. Try saving again.",
  invalid_event_type: "That breeding event type isn't one Verdant records.",
  invalid_details: "Those event details couldn't be read. Check the fields and try again.",
  grow_not_owned: "That grow isn't in your workspace.",
  plant_required: "Choose a plant before logging a breeding event.",
  plant_not_in_grow: "That plant isn't part of the selected grow.",
  plant_tent_not_owned: "That plant's tent isn't in your workspace.",
  plant_cross_grow: "That plant is attached to a different grow than its tent.",
  tent_not_in_grow: "That tent isn't part of the selected grow.",
  plant_not_in_tent: "That plant isn't in the selected tent.",
  // A conflict proves the server already holds a committed record for this
  // submission, so "save again" was the one instruction that could not work.
  // Point the grower at the timeline to check, and be explicit that saving
  // again adds a SECOND entry rather than retrying the first.
  idempotency_key_conflict:
    "An earlier attempt at this submission may already have been recorded. " +
    "Open this grow's timeline to check — saving again adds a separate entry.",
  save_failed: "The event could not be saved. Nothing was recorded — please try again.",
});

/** Fallback for a reason the client doesn't recognize yet. */
export const BREEDING_LOG_SAVE_EVENT_UNKNOWN_REASON_COPY =
  "The event could not be saved. Nothing was recorded — please try again.";

/**
 * Grower-safe sentence for a refusal. Unknown/missing reasons degrade to the
 * generic copy rather than exposing an internal code.
 */
export function describeBreedingLogSaveEventReason(reason: string | null | undefined): string {
  return isBreedingLogSaveEventReason(reason)
    ? BREEDING_LOG_SAVE_EVENT_REASON_COPY[reason]
    : BREEDING_LOG_SAVE_EVENT_UNKNOWN_REASON_COPY;
}

export interface BreedingLogSaveEventResult {
  ok: boolean;
  growEventId: string | null;
  /** Known reason when the RPC returned one it declares; null otherwise. */
  reason: BreedingLogSaveEventReason | null;
  /**
   * The raw reason string exactly as returned, retained for logs/diagnostics
   * when the RPC introduces a code this client doesn't know yet. Never render
   * this — use `describeBreedingLogSaveEventReason`.
   */
  rawReason: string | null;
}

type RpcInvoker = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: unknown }>;

interface RawResult {
  ok?: boolean;
  grow_event_id?: string;
  reason?: string;
}

function readErrorMessage(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  return "unknown_error";
}

export async function callBreedingLogSaveEvent(
  args: BreedingLogSaveEventArgs,
): Promise<BreedingLogSaveEventResult> {
  const invoke = supabase.rpc as unknown as RpcInvoker;
  const { data, error } = await invoke(BREEDING_LOG_SAVE_EVENT_RPC_NAME, {
    p_idempotency_key: args.idempotencyKey,
    p_grow_id: args.growId,
    p_plant_id: args.plantId,
    p_event_type: args.eventType,
    p_tent_id: args.tentId,
    p_method: args.method,
    p_intensity: args.intensity,
    p_details: args.details,
  });

  if (error) {
    if (isMissingRpcError(error, BREEDING_LOG_SAVE_EVENT_RPC_NAME)) {
      throw new MissingAuditRpcError(BREEDING_LOG_SAVE_EVENT_RPC_NAME, error);
    }
    throw new Error(`Failed to save event: ${readErrorMessage(error)}`);
  }

  const raw = (data ?? null) as RawResult | null;
  const rawReason = raw?.reason ?? null;
  return {
    ok: Boolean(raw?.ok),
    growEventId: raw?.grow_event_id ?? null,
    reason: isBreedingLogSaveEventReason(rawReason) ? rawReason : null,
    rawReason,
  };
}
