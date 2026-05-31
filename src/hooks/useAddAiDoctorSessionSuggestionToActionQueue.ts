/**
 * Mutation hook: convert one approved AI Doctor session suggestion into one
 * approval-required Action Queue row.
 *
 * Safety envelope:
 *   - INSERT-only into `public.action_queue` (+ optional `action_queue_events`
 *     audit row, matching the existing AlertDetail pattern).
 *   - No update/upsert/delete/rpc/functions.invoke.
 *   - No edge functions, no AI calls, no automation, no device control.
 *   - No alerts/tasks writes.
 *   - Never sends `user_id` (DB default `auth.uid()` + RLS own ownership).
 *   - Never sends `target_device`.
 *   - `source` pinned to "ai_doctor"; `status` pinned to "pending_approval".
 *
 * Idempotency:
 *   - Before insert, probes open ai_doctor rows for the same grow_id with the
 *     session back-pointer in `reason`, then filters via the pure helper
 *     `sessionActionMatchesExisting` (terminal-status rows are ignored).
 *   - If a matching open row exists, returns `duplicate_skipped` and does NOT
 *     insert a second row.
 *
 * Cache behaviour:
 *   - No optimistic cache update — the project does not have a unified
 *     ["action_queue"] query cache; AlertDetail/Coach surfaces use local
 *     useState. On settle the hook invalidates any ["action_queue"] keys so
 *     callers that *do* adopt the convention later get fresh data for free.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildActionQueueDraftFromAiDoctorSession,
  sessionActionMatchesExisting,
  type AiDoctorSessionLike,
  type AiDoctorSuggestedActionLike,
  type ExistingActionQueueRowLike,
} from "@/lib/aiDoctorSessionToActionQueueRules";

export interface AddAiDoctorSessionSuggestionInput {
  session: AiDoctorSessionLike;
  action: AiDoctorSuggestedActionLike;
}

export type AddAiDoctorSessionSuggestionResult =
  | { status: "inserted"; actionQueueId: string }
  | { status: "duplicate_skipped"; existingActionQueueId: string }
  | { status: "ineligible"; reason: string };

/** Allowed open / non-terminal statuses for the dedupe probe. */
export const NON_TERMINAL_ACTION_QUEUE_STATUSES = [
  "pending_approval",
  "approved",
  "simulated",
] as const;

interface ProbeRow extends ExistingActionQueueRowLike {
  id: string;
}

export async function probeExistingAiDoctorActionQueueRows(
  session: AiDoctorSessionLike,
): Promise<ProbeRow[]> {
  if (!session?.grow_id || !session?.id) return [];
  const { data, error } = await supabase
    .from("action_queue")
    .select("id,grow_id,source,reason,status,suggested_change")
    .eq("grow_id", session.grow_id)
    .eq("source", "ai_doctor")
    .in("status", NON_TERMINAL_ACTION_QUEUE_STATUSES as unknown as string[])
    .like("reason", `%[session:${session.id}]%`)
    .limit(20);
  if (error) throw error;
  return (data ?? []) as ProbeRow[];
}

export function useAddAiDoctorSessionSuggestionToActionQueue() {
  const queryClient = useQueryClient();

  return useMutation<
    AddAiDoctorSessionSuggestionResult,
    Error,
    AddAiDoctorSessionSuggestionInput
  >({
    mutationFn: async ({ session, action }) => {
      const draftResult = buildActionQueueDraftFromAiDoctorSession(session, action);
      if (!draftResult.ok) {
        return { status: "ineligible", reason: draftResult.reason };
      }
      const { draft } = draftResult;

      // Dedupe probe — never blocks insert on terminal-status rows.
      const candidates = await probeExistingAiDoctorActionQueueRows(session);
      const match = candidates.find((row) =>
        sessionActionMatchesExisting(row, session, action),
      );
      if (match) {
        return { status: "duplicate_skipped", existingActionQueueId: match.id };
      }

      // SECURITY: never send user_id (DB default auth.uid() owns it).
      // SECURITY: never send target_device — AI Doctor suggestions are advisory only.
      const { data: inserted, error: insErr } = await supabase
        .from("action_queue")
        .insert({
          grow_id: draft.grow_id,
          tent_id: draft.tent_id,
          plant_id: draft.plant_id,
          action_type: draft.action_type,
          target_metric: draft.target_metric,
          suggested_change: draft.suggested_change,
          reason: draft.reason,
          risk_level: draft.risk_level,
          source: draft.source,
          status: draft.status,
        })
        .select("id,grow_id")
        .single();
      if (insErr) throw insErr;
      if (!inserted?.id) {
        throw new Error("Action queue insert returned no row");
      }

      // Best-effort audit event — mirrors AlertDetail's existing pattern.
      // A failure here does NOT roll back the action_queue row (append-only event log).
      await supabase.from("action_queue_events").insert({
        action_queue_id: inserted.id,
        grow_id: inserted.grow_id ?? draft.grow_id,
        event_type: "created",
        previous_status: null,
        new_status: "pending_approval",
        note: draft.audit_note,
      });

      return { status: "inserted", actionQueueId: inserted.id };
    },
    onSettled: () => {
      // Reconcile any future ["action_queue"] caches with server truth.
      queryClient.invalidateQueries({ queryKey: ["action_queue"] });
    },
  });
}
