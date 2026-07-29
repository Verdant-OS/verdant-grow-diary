/**
 * breedingLogSaveEventRpc — the single typed seam for the
 * `public.breeding_log_save_event` RPC.
 *
 * Why this exists:
 *   The RPC is created by migration 20260728163100, which is merged but not
 *   yet applied to every project, so it is absent from the generated Supabase
 *   types. Call sites were reaching for a local
 *   `supabase.rpc as unknown as (...)` cast, which erased BOTH the argument
 *   shape and the result shape at every call site and made the
 *   function-not-found case indistinguishable from a validation failure.
 *
 *   This module owns that cast exactly once, behind a typed boundary:
 *   arguments are a named interface, the result is a discriminated union, and
 *   the "RPC isn't live yet" case is its own outcome instead of a generic
 *   error string. When the migration is applied and types are regenerated,
 *   only this file needs revisiting.
 *
 * Pure typing + one thin call. No React. The RPC itself owns the trust
 * boundary (auth.uid(), ownership checks, idempotency); the client never
 * sends a user_id and this wrapper never invents one.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { classifySupabaseRpcError, type SupabaseRpcErrorLike } from "@/lib/supabaseRpcAvailability";

/** Canonical breeding event types the RPC accepts. Anything else fails closed. */
export const BREEDING_LOG_EVENT_TYPES = [
  "reversal_application",
  "isolation_start",
  "pollination",
  "pollen_shed_observed",
  "stigmas_receptive",
  "cross_harvest",
] as const;

export type BreedingLogEventType = (typeof BREEDING_LOG_EVENT_TYPES)[number];

export function isBreedingLogEventType(value: unknown): value is BreedingLogEventType {
  return (
    typeof value === "string" && (BREEDING_LOG_EVENT_TYPES as ReadonlyArray<string>).includes(value)
  );
}

/**
 * Arguments for the RPC, named exactly as the SQL signature declares them.
 * `p_user_id` deliberately does not exist: identity comes from auth.uid().
 */
export interface BreedingLogSaveEventArgs {
  readonly p_idempotency_key: string;
  readonly p_grow_id: string;
  readonly p_plant_id: string;
  readonly p_event_type: BreedingLogEventType;
  readonly p_tent_id: string | null;
  readonly p_method: string | null;
  readonly p_intensity: string | null;
  readonly p_details: Record<string, string>;
}

/**
 * Every `reason` the RPC can return on a refusal. Kept in lockstep with
 * migration 20260728163100; `src/test/breeding-log-save-event-rpc.test.ts`
 * pins this list against the migration text so drift fails a test rather
 * than silently degrading to "unknown_error" in the UI.
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

/** Raw success envelope the RPC returns as jsonb. */
interface BreedingLogSaveEventPayload {
  readonly ok?: boolean;
  readonly grow_event_id?: string;
  readonly reused?: boolean;
  readonly reason?: string;
}

/**
 * Discriminated outcome. Call sites branch exhaustively instead of
 * string-matching an error message.
 *
 *  - saved         — one grow_event + one breeding_event persisted (or an
 *                    exact idempotent replay, flagged by `reused`).
 *  - refused       — the RPC ran and declined, with a known typed reason.
 *  - rpc_unavailable — the function is not live on this project yet
 *                    (migration unapplied / stale schema cache). Distinct so
 *                    the UI can offer the real next action.
 *  - failed        — transport or unexpected shape.
 */
export type BreedingLogSaveEventOutcome =
  | { readonly status: "saved"; readonly growEventId: string; readonly reused: boolean }
  | { readonly status: "refused"; readonly reason: BreedingLogSaveEventReason | "unknown_reason" }
  | { readonly status: "rpc_unavailable" }
  | { readonly status: "failed"; readonly message: string };

function toReason(value: unknown): BreedingLogSaveEventReason | "unknown_reason" {
  return typeof value === "string" &&
    (BREEDING_LOG_SAVE_EVENT_REASONS as ReadonlyArray<string>).includes(value)
    ? (value as BreedingLogSaveEventReason)
    : "unknown_reason";
}

/**
 * Normalize the RPC's raw response into the typed outcome. Exported so the
 * mapping is unit-testable without a Supabase client.
 */
export function interpretBreedingLogSaveEventResponse(input: {
  readonly data: unknown;
  readonly error: SupabaseRpcErrorLike | null | undefined;
}): BreedingLogSaveEventOutcome {
  if (input.error) {
    if (classifySupabaseRpcError(input.error) === "missing_or_stale") {
      return { status: "rpc_unavailable" };
    }
    const message =
      typeof input.error.message === "string" && input.error.message.trim().length > 0
        ? input.error.message
        : "unknown_error";
    return { status: "failed", message };
  }

  const payload = (input.data ?? null) as BreedingLogSaveEventPayload | null;
  if (!payload || typeof payload !== "object") {
    return { status: "failed", message: "unexpected_rpc_response" };
  }
  if (payload.ok === true && typeof payload.grow_event_id === "string") {
    return {
      status: "saved",
      growEventId: payload.grow_event_id,
      reused: payload.reused === true,
    };
  }
  return { status: "refused", reason: toReason(payload.reason) };
}

/**
 * Minimal structural type for the client's `rpc` method. The single cast in
 * this module narrows to exactly this, so the RPC's own argument and result
 * types stay enforced at every call site.
 */
type UntypedRpcClient = {
  rpc: (
    fn: string,
    args: BreedingLogSaveEventArgs,
  ) => Promise<{ data: unknown; error: SupabaseRpcErrorLike | null }>;
};

/**
 * Call the RPC and return a typed outcome.
 *
 * The lone `as unknown as` lives here and nowhere else: it exists solely
 * because the generated types do not yet include this function. Delete it
 * (and this comment) once the migration is applied and types are regenerated.
 */
export async function callBreedingLogSaveEvent(
  client: Pick<SupabaseClient, "rpc">,
  args: BreedingLogSaveEventArgs,
): Promise<BreedingLogSaveEventOutcome> {
  try {
    const untyped = client as unknown as UntypedRpcClient;
    const { data, error } = await untyped.rpc("breeding_log_save_event", args);
    return interpretBreedingLogSaveEventResponse({ data, error });
  } catch (thrown) {
    return {
      status: "failed",
      message: thrown instanceof Error ? thrown.message : "unknown_error",
    };
  }
}

/**
 * Grower-facing copy for the "migration not applied yet" case. Names the real
 * situation without exposing Postgres internals, and states plainly that
 * nothing was recorded.
 */
export const BREEDING_LOG_SAVE_EVENT_UNAVAILABLE_COPY =
  "Breeding events can't be saved yet — this workspace is still waiting on a database update. " +
  "Nothing was recorded. Your entry is safe to re-submit once the update is applied.";

/**
 * Grower-facing copy per refusal reason. Never echoes raw SQL/PostgREST text
 * and never implies anything was saved.
 */
export const BREEDING_LOG_SAVE_EVENT_COPY: Readonly<
  Record<BreedingLogSaveEventReason | "unknown_reason", string>
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
  idempotency_key_conflict:
    "This looks like a repeat submission with different details. Review the form and save again.",
  save_failed: "The event could not be saved. Nothing was recorded — please try again.",
  unknown_reason: "The event could not be saved. Nothing was recorded — please try again.",
});
