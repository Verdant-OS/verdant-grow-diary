import { supabase } from "@/integrations/supabase/client";
import type { BreedingEventType } from "@/lib/genetics/breedingTypes";

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

export interface BreedingLogSaveEventResult {
  ok: boolean;
  growEventId: string | null;
  reason: string | null;
}

type RpcInvoker = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

interface RawResult {
  ok?: boolean;
  grow_event_id?: string;
  reason?: string;
}

export async function callBreedingLogSaveEvent(
  args: BreedingLogSaveEventArgs,
): Promise<BreedingLogSaveEventResult> {
  const invoke = supabase.rpc as unknown as RpcInvoker;
  const { data, error } = await invoke("breeding_log_save_event", {
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
    throw new Error(`Failed to save event: ${error.message}`);
  }

  const raw = (data ?? null) as RawResult | null;
  return {
    ok: Boolean(raw?.ok),
    growEventId: raw?.grow_event_id ?? null,
    reason: raw?.reason ?? null,
  };
}
