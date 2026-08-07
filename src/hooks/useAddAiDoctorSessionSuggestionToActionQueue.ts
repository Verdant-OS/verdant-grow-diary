/**
 * Mutation hook: convert one approved AI Doctor session suggestion into one
 * approval-required Action Queue row.
 *
 * Safety envelope:
 *   - Writes via `action_queue_create` RPC so the queue row and `created`
 *     audit event commit together (#586). No best-effort second insert.
 *   - No update / upsert / delete / edge-function invocations.
 *   - No edge functions, no AI calls, no automation, no device control.
 *   - No alerts/tasks writes.
 *   - Never sends `user_id` (RPC resolves auth.uid()).
 *   - Never sends `target_device`.
 *   - `source` pinned to "ai_doctor"; `status` pinned to "pending_approval".
 *
 * Idempotency:
 *   - Client probe still skips when an open match already exists (fast path).
 *   - Server `dedupe_key` (`ai_doctor_session:<id>`) enforces non-terminal
 *     uniqueness under concurrent tabs.
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
import { createActionQueueItem } from "@/lib/actionQueueCreateService";
import { buildAiDoctorSessionDedupeKey } from "@/lib/actionQueueCreateRules";

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

  return useMutation<AddAiDoctorSessionSuggestionResult, Error, AddAiDoctorSessionSuggestionInput>({
    mutationFn: async ({ session, action }) => {
      const draftResult = buildActionQueueDraftFromAiDoctorSession(session, action);
      if (!draftResult.ok) {
        const r = (draftResult as { ok: false; reason: string }).reason;
        return { status: "ineligible", reason: r };
      }
      const { draft } = draftResult;

      // Client-side dedupe probe — never blocks insert on terminal-status rows.
      const candidates = await probeExistingAiDoctorActionQueueRows(session);
      const match = candidates.find((row) => sessionActionMatchesExisting(row, session, action));
      if (match) {
        return { status: "duplicate_skipped", existingActionQueueId: match.id };
      }

      // Atomic create + created audit (#586). Never user_id / target_device.
      // Evidence Linkage Persistence v1: AI Doctor session suggestions do not
      // yet carry typed timeline refs — persist explicit empty array.
      const result = await createActionQueueItem({
        grow_id: draft.grow_id,
        tent_id: draft.tent_id,
        plant_id: draft.plant_id,
        action_type: draft.action_type,
        target_metric: draft.target_metric,
        suggested_change: draft.suggested_change,
        reason: draft.reason,
        risk_level: draft.risk_level,
        source: draft.source,
        dedupe_key: buildAiDoctorSessionDedupeKey(session.id),
        audit_note: draft.audit_note,
        originating_timeline_events: [],
      });

      if (!result.ok) {
        if (result.reason === "dedupe_conflict") {
          // Concurrent tab won the race — surface as skip if we can probe again.
          const again = await probeExistingAiDoctorActionQueueRows(session);
          const existing = again.find((row) => sessionActionMatchesExisting(row, session, action));
          if (existing) {
            return { status: "duplicate_skipped", existingActionQueueId: existing.id };
          }
        }
        throw new Error(result.reason || "insert_failed");
      }

      if (result.reused) {
        return {
          status: "duplicate_skipped",
          existingActionQueueId: result.action_queue_id,
        };
      }

      return { status: "inserted", actionQueueId: result.action_queue_id };
    },
    onSettled: () => {
      // Reconcile any future ["action_queue"] caches with server truth.
      queryClient.invalidateQueries({ queryKey: ["action_queue"] });
    },
  });
}
