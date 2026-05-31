/**
 * Read-only hook: open Action Queue items linked back to a specific
 * AI Doctor session via the `[session:<id>]` back-pointer in `reason`.
 *
 * - Reads `public.action_queue` under RLS (auth.uid() ownership).
 * - Server-side filter: source = "ai_doctor", status ∈ open set,
 *   reason LIKE "%[session:<id>]%".
 * - Pure shaping (token strip, focus href, dedupe) lives in the view model.
 * - No writes. No mutation. No automation. No device control.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  buildAiDoctorSessionLinkedActionsViewModel,
  OPEN_LINKED_ACTION_STATUSES,
  type LinkedActionInputRow,
  type LinkedActionsViewModel,
} from "@/lib/aiDoctorSessionLinkedActionsViewModel";

export interface UseAiDoctorSessionLinkedActionQueueItemsResult {
  vm: LinkedActionsViewModel;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

export function useAiDoctorSessionLinkedActionQueueItems(
  sessionId: string | null | undefined,
): UseAiDoctorSessionLinkedActionQueueItemsResult {
  const sid = typeof sessionId === "string" ? sessionId.trim() : "";
  const enabled = sid.length > 0;

  const q = useQuery({
    queryKey: ["ai_doctor_session_linked_action_queue_items", sid],
    enabled,
    queryFn: async (): Promise<LinkedActionInputRow[]> => {
      const { data, error } = await supabase
        .from("action_queue")
        .select("id,status,source,reason,suggested_change")
        .eq("source", "ai_doctor")
        .in("status", OPEN_LINKED_ACTION_STATUSES as unknown as string[])
        .like("reason", `%[session:${sid}]%`)
        .limit(20);
      if (error) throw error;
      return (data ?? []) as LinkedActionInputRow[];
    },
  });

  const vm = buildAiDoctorSessionLinkedActionsViewModel(sid, q.data ?? []);
  return {
    vm,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  };
}
