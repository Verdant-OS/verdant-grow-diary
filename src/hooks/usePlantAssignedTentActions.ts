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
  ACTION_QUEUE_SOURCE_VALUES,
  getActionQueueSourceKind,
} from "@/lib/actionQueueProvenanceRules";
import {
  ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT,
  buildAssignedTentActions,
  type AssignedTentActionInputRow,
  type PlantAssignedTentActionRow,
} from "@/lib/plantAssignedTentActionRules";

export interface UsePlantAssignedTentActionsResult {
  rows: PlantAssignedTentActionRow[];
  /**
   * Read-only, exact selected-plant AI Coach evidence for Live Proof only.
   * Kept separate from `rows` so the generic assigned-tent panel retains its
   * small newest-first display window unchanged.
   */
  proofSelectedPlantAiCoachRow: PlantAssignedTentActionRow | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
}

export interface UsePlantAssignedTentActionsOptions {
  /**
   * Narrow Live Proof selector: skip nonmatching AI Coach rows before the
   * shared bounded display cap. Other action sources remain tent-scoped.
   */
  selectedPlantIdForAiCoach?: string | null | undefined;
}

const ACTION_QUEUE_READ_COLUMNS =
  "id,grow_id,tent_id,plant_id,status,source,action_type,target_metric,suggested_change,reason,risk_level,target_device,created_at";

/**
 * The generic panel intentionally remains small. Live Proof gets one
 * separately-bounded row for its exact selected-plant AI Coach evidence so a
 * busy tent cannot push that row outside the generic newest-first window.
 */
const PROOF_SELECTED_PLANT_AI_COACH_LIMIT = 1;

function normalizeSelectedPlantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

export function usePlantAssignedTentActions(
  tentId: string | null | undefined,
  growId: string | null | undefined,
  limitOrOptions: number | UsePlantAssignedTentActionsOptions = ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT,
): UsePlantAssignedTentActionsResult {
  const limit =
    typeof limitOrOptions === "number" ? limitOrOptions : ASSIGNED_TENT_ACTIONS_DEFAULT_LIMIT;
  const selectedPlantIdForAiCoach = normalizeSelectedPlantId(
    typeof limitOrOptions === "number" ? null : limitOrOptions.selectedPlantIdForAiCoach,
  );
  const enabled = !!tentId;
  const q = useQuery({
    queryKey: ["plant_assigned_tent_actions", tentId ?? null, growId ?? null, limit],
    enabled,
    queryFn: async (): Promise<AssignedTentActionInputRow[]> => {
      let query = supabase
        .from("action_queue")
        .select(ACTION_QUEUE_READ_COLUMNS)
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

  const proofAiCoachQ = useQuery({
    queryKey: [
      "plant_assigned_tent_actions",
      "proof_selected_plant_ai_coach",
      tentId ?? null,
      growId ?? null,
      selectedPlantIdForAiCoach,
    ],
    enabled: enabled && selectedPlantIdForAiCoach !== null,
    queryFn: async (): Promise<AssignedTentActionInputRow[]> => {
      // All dynamic scope values are passed through parameterized PostgREST
      // equality filters; no source string is interpolated into a filter.
      let query = supabase
        .from("action_queue")
        .select(ACTION_QUEUE_READ_COLUMNS)
        .eq("status", "pending_approval")
        .eq("tent_id", tentId as string)
        .eq("plant_id", selectedPlantIdForAiCoach as string)
        .eq("source", ACTION_QUEUE_SOURCE_VALUES.AI_COACH)
        .order("created_at", { ascending: false })
        .limit(PROOF_SELECTED_PLANT_AI_COACH_LIMIT);
      if (growId) query = query.eq("grow_id", growId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AssignedTentActionInputRow[];
    },
  });

  // A proof-mode response is only evidence after both bounded reads settle
  // cleanly. Otherwise a partial response could incorrectly certify the loop.
  const proofReadIncomplete =
    selectedPlantIdForAiCoach !== null &&
    (q.isLoading || q.isError || proofAiCoachQ.isLoading || proofAiCoachQ.isError);
  const rows = proofReadIncomplete
    ? []
    : buildAssignedTentActions(q.data ?? [], {
        tentId,
        growId,
        limit,
        selectedPlantIdForAiCoach,
      });
  const proofSelectedPlantAiCoachRow = proofReadIncomplete
    ? null
    : (buildAssignedTentActions(proofAiCoachQ.data ?? [], {
        tentId,
        growId,
        limit: PROOF_SELECTED_PLANT_AI_COACH_LIMIT,
        selectedPlantIdForAiCoach,
      }).find(
        (row) =>
          selectedPlantIdForAiCoach !== null &&
          row.plantId === selectedPlantIdForAiCoach &&
          getActionQueueSourceKind(row) === "ai_coach",
      ) ?? null);
  return {
    rows,
    proofSelectedPlantAiCoachRow,
    isLoading: q.isLoading || proofAiCoachQ.isLoading,
    isError: q.isError || proofAiCoachQ.isError,
    error: q.error ?? proofAiCoachQ.error,
  };
}
