/**
 * phenoActionQueueService — the ONLY pheno write path into the approval-required
 * Action Queue. Used for the herm → "consider removing" suggestion: when the
 * grower confirms removing a hermaphrodite, this inserts ONE
 * status="pending_approval" Action Queue row. It never removes a plant, never
 * targets a device, and never auto-approves.
 *
 * Safety envelope (mirrors useAddAiDoctorSessionSuggestionToActionQueue):
 *  - INSERT-only into public.action_queue. No update/upsert/delete/rpc.
 *  - Never sends user_id (DB default auth.uid() + RLS ownership).
 *  - Never sends target_device.
 *  - status pinned to "pending_approval"; source "manual".
 *  - Payload shaped by the pure, tested buildPhenoKeeperActionQueuePayloads.
 */
import { supabase } from "@/integrations/supabase/client";
import { buildPhenoKeeperActionQueuePayloads } from "@/lib/phenoKeeperActionQueue";

export type QueueResult = { ok: true; id: string } | { ok: false; error: string };

/**
 * Queue a suggest-only "confirm removal" for a hermaphrodite the grower chose
 * to cull. Returns pending_approval — the grower still approves + acts.
 */
export async function queueHermCullSuggestion(input: {
  observationId: string;
  candidateLabel: string;
  growId: string;
  plantId: string;
  tentId?: string | null;
}): Promise<QueueResult> {
  const grow = typeof input.growId === "string" ? input.growId.trim() : "";
  if (!grow) return { ok: false, error: "This hunt has no grow to queue against." };

  const payloads = buildPhenoKeeperActionQueuePayloads(
    {
      id: input.observationId,
      decision: "cull",
      candidateLabel: input.candidateLabel,
      decidedAt: null,
    },
    grow,
    input.plantId,
    input.tentId ?? null,
  );
  if (payloads.length === 0) return { ok: false, error: "Nothing to queue." };

  // INSERT-only. Never send user_id (DB default auth.uid()). Never target_device.
  const { data, error } = await supabase
    .from("action_queue")
    .insert(payloads)
    .select("id")
    .limit(1);
  if (error) return { ok: false, error: "Could not queue the removal for approval." };
  const id = Array.isArray(data) && data[0]?.id ? data[0].id : "";
  return { ok: true, id };
}
