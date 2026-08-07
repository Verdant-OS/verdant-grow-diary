/**
 * actionQueueCreateService — client write path for atomic Action Queue create (#586).
 *
 * Calls public.action_queue_create so the queue row and 'created' audit event
 * commit (or roll back) together. Optional dedupe_key provides server-side
 * non-terminal idempotency.
 *
 * Never sends user_id or target_device.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildActionQueueCreateRpcArgs,
  parseActionQueueCreateResult,
  type ActionQueueCreateDraft,
  type ActionQueueCreateResult,
} from "@/lib/actionQueueCreateRules";

export async function createActionQueueItem(
  draft: ActionQueueCreateDraft,
): Promise<ActionQueueCreateResult> {
  const built = buildActionQueueCreateRpcArgs(draft);
  if ("ok" in built && built.ok === false) {
    return built;
  }
  const args = built as import("@/lib/actionQueueCreateRules").ActionQueueCreateRpcArgs;

  // Optional RPC fields: PostgREST accepts omitted keys; coerce null → undefined
  // for the generated Args type.
  const rpcArgs = {
    p_grow_id: args.p_grow_id,
    p_action_type: args.p_action_type,
    p_suggested_change: args.p_suggested_change,
    p_reason: args.p_reason,
    p_risk_level: args.p_risk_level,
    p_source: args.p_source,
    p_target_metric: args.p_target_metric ?? undefined,
    p_tent_id: args.p_tent_id ?? undefined,
    p_plant_id: args.p_plant_id ?? undefined,
    p_originating_timeline_events: args.p_originating_timeline_events as never,
    p_audit_note: args.p_audit_note ?? undefined,
    p_dedupe_key: args.p_dedupe_key ?? undefined,
  };
  const { data, error } = await supabase.rpc("action_queue_create", rpcArgs);

  if (error) {
    // Surface PostgREST/Postgres failure as a structured reason without
    // echoing raw device/control language.
    const code = typeof error.code === "string" ? error.code : "";
    if (code === "PGRST202" || code === "42883") {
      return { ok: false, reason: "rpc_unavailable" };
    }
    if (code === "42501") {
      return { ok: false, reason: "forbidden" };
    }
    return { ok: false, reason: "insert_failed" };
  }

  return parseActionQueueCreateResult(data);
}
