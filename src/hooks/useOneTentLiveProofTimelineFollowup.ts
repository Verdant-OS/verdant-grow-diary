/**
 * useOneTentLiveProofTimelineFollowup — read-only hook used by the
 * One-Tent Live Proof page to infer whether an `action_followup`
 * diary entry exists for the completed linked action.
 *
 * Safety:
 *  - SELECT only. No insert/update/delete/upsert/rpc/functions.invoke.
 *  - RLS enforces ownership; no service_role.
 *  - Never exposes raw internal IDs to the UI.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  pickLatestFollowupForAction,
  type RawFollowupDiaryRow,
} from "@/lib/actionFollowupVisibilityRules";
import { ACTION_FOLLOWUP_EVENT_TYPE } from "@/lib/actionFollowupRules";

export interface OneTentLiveProofTimelineFollowup {
  followupConfirmed: boolean | null;
  loading: boolean;
}

export function useOneTentLiveProofTimelineFollowup(
  growId: string | null,
  completedActionId: string | null,
  externalNonce: number,
): OneTentLiveProofTimelineFollowup {
  const [state, setState] = useState<OneTentLiveProofTimelineFollowup>({
    followupConfirmed: null,
    loading: false,
  });

  useEffect(() => {
    let cancelled = false;
    if (!growId || !completedActionId) {
      setState({ followupConfirmed: null, loading: false });
      return;
    }
    setState({ followupConfirmed: null, loading: true });
    (async () => {
      const { data, error } = await supabase
        .from("diary_entries")
        .select("id,grow_id,plant_id,tent_id,entry_at,created_at,note,details")
        .eq("grow_id", growId)
        .order("entry_at", { ascending: false })
        .limit(200);
      if (cancelled) return;
      if (error) {
        setState({ followupConfirmed: null, loading: false });
        return;
      }
      const rows = ((data ?? []) as unknown as RawFollowupDiaryRow[]).filter(
        (r) => r?.details?.event_type === ACTION_FOLLOWUP_EVENT_TYPE,
      );
      const matched = pickLatestFollowupForAction(rows, completedActionId);
      setState({ followupConfirmed: matched !== null, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [growId, completedActionId, externalNonce]);

  return state;
}
