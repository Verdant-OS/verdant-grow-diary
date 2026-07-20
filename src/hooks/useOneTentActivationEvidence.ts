/**
 * Read-only evidence loader for the connected first-run One-Tent chain.
 *
 * Quick Log has two legitimate persistence shapes: every confirmed save has
 * a `grow_events` spine row, while only saves with structured details receive
 * a companion `diary_entries` row. Reading both tables keeps onboarding
 * honest for a short watering, feeding, or observation with no note.
 *
 * Safety:
 *  - SELECT only; RLS owns account isolation.
 *  - No client user id, write, RPC, Edge function, AI, or device control.
 *  - A failed read is "unavailable", never false completion.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isUuid } from "@/lib/isUuid";
import {
  summarizeConnectedActivationEvidence,
  type ConnectedActivationEvidenceSummary,
  type ConnectedActivationScope,
  type ConnectedActivationDiaryEntryRow,
  type ConnectedActivationGrowEventRow,
} from "@/lib/connectedOneTentActivationRules";
import { QUICK_LOG_V2_ENTRY_CREATED_EVENT } from "@/lib/quickLogV2EntryCreatedEvent";
import { useAuth } from "@/store/auth";
import { buildPrivateGrowQueryKey } from "@/lib/growDataQueryKeyRules";

export const ONE_TENT_ACTIVATION_EVIDENCE_QUERY_KEY = "one_tent_activation_evidence" as const;
export const ONE_TENT_ACTIVATION_EVIDENCE_LIMIT = 100;

const EMPTY_SUMMARY: ConnectedActivationEvidenceSummary = Object.freeze({
  count: 0,
  hasEvidence: false,
  latestAt: null,
  latestSource: null,
});

export type OneTentActivationEvidenceState =
  | { status: "idle"; summary: ConnectedActivationEvidenceSummary }
  | { status: "loading"; summary: ConnectedActivationEvidenceSummary }
  | { status: "ok"; summary: ConnectedActivationEvidenceSummary }
  | { status: "unavailable"; summary: ConnectedActivationEvidenceSummary };

function isQueryableScope(
  scope: ConnectedActivationScope | null | undefined,
): scope is Required<ConnectedActivationScope> {
  return !!(scope && isUuid(scope.growId) && isUuid(scope.tentId) && isUuid(scope.plantId));
}

export function oneTentActivationEvidenceQueryKey(
  ownerId: string | null | undefined,
  scope: ConnectedActivationScope | null | undefined,
): readonly unknown[] {
  return buildPrivateGrowQueryKey(ownerId, [
    ONE_TENT_ACTIVATION_EVIDENCE_QUERY_KEY,
    scope?.growId ?? null,
    scope?.tentId ?? null,
    scope?.plantId ?? null,
  ]);
}

async function loadConnectedActivationEvidence(
  scope: Required<ConnectedActivationScope>,
): Promise<ConnectedActivationEvidenceSummary> {
  const [diaryResult, growEventResult] = await Promise.all([
    supabase
      .from("diary_entries")
      .select("id,grow_id,tent_id,plant_id,entry_at,details")
      .eq("grow_id", scope.growId)
      .order("entry_at", { ascending: false })
      .limit(ONE_TENT_ACTIVATION_EVIDENCE_LIMIT),
    supabase
      .from("grow_events")
      .select("id,grow_id,tent_id,plant_id,occurred_at,event_type,source,is_deleted")
      .eq("grow_id", scope.growId)
      .eq("source", "manual")
      .eq("is_deleted", false)
      .order("occurred_at", { ascending: false })
      .limit(ONE_TENT_ACTIVATION_EVIDENCE_LIMIT),
  ]);

  if (diaryResult.error) throw diaryResult.error;
  if (growEventResult.error) throw growEventResult.error;

  return summarizeConnectedActivationEvidence({
    ...scope,
    diaryEntries: (diaryResult.data ?? []) as ConnectedActivationDiaryEntryRow[],
    growEvents: (growEventResult.data ?? []) as ConnectedActivationGrowEventRow[],
  });
}

export function useOneTentActivationEvidence(
  scope: ConnectedActivationScope | null | undefined,
): OneTentActivationEvidenceState {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ownerId = user?.id ?? null;
  const enabled = !!ownerId && isQueryableScope(scope);
  const queryKey = oneTentActivationEvidenceQueryKey(ownerId, scope);
  const growId = scope?.growId ?? null;
  const tentId = scope?.tentId ?? null;
  const plantId = scope?.plantId ?? null;
  const query = useQuery({
    queryKey,
    enabled,
    queryFn: () => loadConnectedActivationEvidence(scope as Required<ConnectedActivationScope>),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const refresh = () => {
      void queryClient.invalidateQueries({
        queryKey: oneTentActivationEvidenceQueryKey(ownerId, {
          growId,
          tentId,
          plantId,
        }),
      });
    };
    window.addEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, refresh);
    return () => {
      window.removeEventListener(QUICK_LOG_V2_ENTRY_CREATED_EVENT, refresh);
    };
  }, [enabled, growId, ownerId, plantId, queryClient, tentId]);

  if (!enabled) return { status: "idle", summary: EMPTY_SUMMARY };
  if (query.isLoading) return { status: "loading", summary: EMPTY_SUMMARY };
  if (query.isError) return { status: "unavailable", summary: EMPTY_SUMMARY };
  return { status: "ok", summary: query.data ?? EMPTY_SUMMARY };
}

export default useOneTentActivationEvidence;
