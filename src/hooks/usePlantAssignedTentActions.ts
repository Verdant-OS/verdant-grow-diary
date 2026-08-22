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
  /**
   * Read-only, exact current-alert evidence for Live Proof only. This is
   * intentionally separate from the generic assigned-tent display window.
   */
  proofSelectedAlertActionRow: PlantAssignedTentActionRow | null;
  /**
   * Read-only, exact current AI Doctor session evidence for Live Proof only.
   * This does not broaden the generic assigned-tent panel read.
   */
  proofSelectedAiDoctorActionRow: PlantAssignedTentActionRow | null;
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
  /** Exact selected alert back-pointer for a separately scoped proof lookup. */
  selectedAlertIdForProof?: string | null | undefined;
  /** Exact selected AI Doctor session back-pointer for a separately scoped proof lookup. */
  selectedAiDoctorSessionIdForProof?: string | null | undefined;
}

const ACTION_QUEUE_READ_COLUMNS =
  "id,grow_id,tent_id,plant_id,status,source,action_type,target_metric,suggested_change,reason,risk_level,target_device,created_at";

/**
 * The generic panel intentionally remains small. Live Proof gets one
 * separately-bounded row for its exact selected-plant AI Coach evidence so a
 * busy tent cannot push that row outside the generic newest-first window.
 */
const PROOF_SELECTED_PLANT_AI_COACH_LIMIT = 1;
const PROOF_BACK_POINTER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function normalizeSelectedPlantId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

/**
 * Back-pointer ids are interpolated into a PostgREST `like` pattern only
 * after this strict validation. The row is still parsed and compared again
 * after the read, so a lookalike or repeated token cannot certify the proof.
 */
function normalizeProofBackPointerId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return PROOF_BACK_POINTER_ID_RE.test(normalized) ? normalized : null;
}

function hasNonEmptyString(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * PostgREST's `like` filter uses PostgreSQL LIKE semantics: escape the two
 * wildcard characters and the escape character itself before interpolating an
 * otherwise validated back-pointer into the bounded server-side pattern.
 */
function escapePostgrestLikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function buildProofBackPointerLikePattern(kind: "alert" | "session", id: string): string {
  return `%[${kind}:${escapePostgrestLikeLiteral(id)}]%`;
}

/**
 * The generic panel is intentionally display-capped. Exact causal proof
 * queries are already scoped to an escaped back-pointer token, but that token
 * can occur after a different first token in a reason. Preserve every returned
 * candidate until the canonical parser verifies its first pointer below.
 */
function returnedProofCandidateCount(
  rows: readonly AssignedTentActionInputRow[] | null | undefined,
): number {
  return Math.max(1, rows?.length ?? 0);
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
  const requestedAlertIdForProof =
    typeof limitOrOptions === "number" ? null : limitOrOptions.selectedAlertIdForProof;
  const requestedAiDoctorSessionIdForProof =
    typeof limitOrOptions === "number" ? null : limitOrOptions.selectedAiDoctorSessionIdForProof;
  const selectedAlertIdForProof = normalizeProofBackPointerId(requestedAlertIdForProof);
  const selectedAiDoctorSessionIdForProof = normalizeProofBackPointerId(
    requestedAiDoctorSessionIdForProof,
  );
  const hasInvalidCausalProofSelector =
    (hasNonEmptyString(requestedAlertIdForProof) && selectedAlertIdForProof === null) ||
    (hasNonEmptyString(requestedAiDoctorSessionIdForProof) &&
      selectedAiDoctorSessionIdForProof === null);
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

  const proofAlertQ = useQuery({
    queryKey: [
      "plant_assigned_tent_actions",
      "proof_selected_alert",
      tentId ?? null,
      growId ?? null,
      selectedAlertIdForProof,
    ],
    enabled: enabled && selectedAlertIdForProof !== null,
    queryFn: async (): Promise<AssignedTentActionInputRow[]> => {
      const alertIdForProof = selectedAlertIdForProof;
      if (!alertIdForProof) return [];
      let query = supabase
        .from("action_queue")
        .select(ACTION_QUEUE_READ_COLUMNS)
        .eq("status", "pending_approval")
        .eq("tent_id", tentId as string)
        .eq("source", ACTION_QUEUE_SOURCE_VALUES.ENVIRONMENT_ALERT)
        .like("reason", buildProofBackPointerLikePattern("alert", alertIdForProof))
        .order("created_at", { ascending: false });
      if (growId) query = query.eq("grow_id", growId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AssignedTentActionInputRow[];
    },
  });

  const proofAiDoctorQ = useQuery({
    queryKey: [
      "plant_assigned_tent_actions",
      "proof_selected_ai_doctor",
      tentId ?? null,
      growId ?? null,
      selectedAiDoctorSessionIdForProof,
    ],
    enabled: enabled && selectedAiDoctorSessionIdForProof !== null,
    queryFn: async (): Promise<AssignedTentActionInputRow[]> => {
      const aiDoctorSessionIdForProof = selectedAiDoctorSessionIdForProof;
      if (!aiDoctorSessionIdForProof) return [];
      let query = supabase
        .from("action_queue")
        .select(ACTION_QUEUE_READ_COLUMNS)
        .eq("status", "pending_approval")
        .eq("tent_id", tentId as string)
        .eq("source", ACTION_QUEUE_SOURCE_VALUES.AI_DOCTOR)
        .like("reason", buildProofBackPointerLikePattern("session", aiDoctorSessionIdForProof))
        .order("created_at", { ascending: false });
      if (growId) query = query.eq("grow_id", growId);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as AssignedTentActionInputRow[];
    },
  });

  // A proof-mode response is only evidence after every requested scoped read
  // settles cleanly. Otherwise a partial response could incorrectly certify
  // the loop while an older exact causal row is still unknown.
  const hasProofMode =
    selectedPlantIdForAiCoach !== null ||
    selectedAlertIdForProof !== null ||
    selectedAiDoctorSessionIdForProof !== null ||
    hasInvalidCausalProofSelector;
  const proofReadIncomplete =
    hasProofMode &&
    (hasInvalidCausalProofSelector ||
      q.isLoading ||
      q.isError ||
      proofAiCoachQ.isLoading ||
      proofAiCoachQ.isError ||
      proofAlertQ.isLoading ||
      proofAlertQ.isError ||
      proofAiDoctorQ.isLoading ||
      proofAiDoctorQ.isError);
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
  const proofSelectedAlertActionRow = proofReadIncomplete
    ? null
    : (buildAssignedTentActions(proofAlertQ.data ?? [], {
        tentId,
        growId,
        limit: returnedProofCandidateCount(proofAlertQ.data),
      }).find(
        (row) =>
          selectedAlertIdForProof !== null &&
          getActionQueueSourceKind(row) === "environment_alert" &&
          row.alertBackPointerId === selectedAlertIdForProof,
      ) ?? null);
  const proofSelectedAiDoctorActionRow = proofReadIncomplete
    ? null
    : (buildAssignedTentActions(proofAiDoctorQ.data ?? [], {
        tentId,
        growId,
        limit: returnedProofCandidateCount(proofAiDoctorQ.data),
      }).find(
        (row) =>
          selectedAiDoctorSessionIdForProof !== null &&
          getActionQueueSourceKind(row) === "ai_doctor" &&
          row.aiDoctorSessionBackPointerId === selectedAiDoctorSessionIdForProof,
      ) ?? null);
  return {
    rows,
    proofSelectedPlantAiCoachRow,
    proofSelectedAlertActionRow,
    proofSelectedAiDoctorActionRow,
    isLoading:
      q.isLoading || proofAiCoachQ.isLoading || proofAlertQ.isLoading || proofAiDoctorQ.isLoading,
    isError: q.isError || proofAiCoachQ.isError || proofAlertQ.isError || proofAiDoctorQ.isError,
    error: q.error ?? proofAiCoachQ.error ?? proofAlertQ.error ?? proofAiDoctorQ.error,
  };
}
