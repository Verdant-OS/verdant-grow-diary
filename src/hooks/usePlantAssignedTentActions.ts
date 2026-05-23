/**
 * Read-only hook: pending-approval action_queue items for the plant's
 * assigned tent.
 *
 * - Reads `public.action_queue` under RLS (user_id = auth.uid()).
 * - Tent / grow / status filtering done server-side; final shaping in the
 *   pure rules layer so it stays deterministic and testable.
 * - No writes. No transitions. No action_queue_events insert.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT,
  buildAssignedTentActions,
  type AssignedTentActionInputRow,
  type PlantAssignedTentActionRow,
} from "@/lib/plantAssignedTentActionRules";

export interface UsePlantAssignedTentActionsResult {
  rows: PlantAssignedTentActionRow[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

export function usePlantAssignedTentActions(
  tentId: string | null | undefined,
  growId: string | null | undefined,
  limit: number = ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT,
): UsePlantAssignedTentActionsResult {
  const enabled = !!tentId;
  const q = useQuery({
    queryKey: [
      "plant_assigned_tent_actions",
      tentId ?? null,
      growId ?? null,
      limit,
    ],
    enabled,
    queryFn: async (): Promise<AssignedTentActionInputRow[]> => {
      let query = supabase
        .from("action_queue")
        .select(
          "id,grow_id,tent_id,plant_id,status,source,action_type,target_metric,suggested_change,reason,risk_level,created_at",
        )
        .eq("status", "pending_approval")
        .eq("tent_id", tentId as string)
        .order("created_at", { ascending: false })
        .limit(Math.max(limit * 2, 10));
      if (growId) query = query.eq("grow_id", growId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AssignedTentActionInputRow[];
    },
  });

  const rows = buildAssignedTentActions(q.data ?? [], { tentId, growId, limit });
  return {
    rows,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error,
  };
}
