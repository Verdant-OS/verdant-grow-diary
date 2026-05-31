/**
 * useDashboardPendingOutcomeReviews — read-only Supabase loader for the
 * Dashboard "Record outcomes" nudge.
 *
 * SAFETY:
 *  - Read-only: no .insert/.update/.delete/.upsert/.rpc.
 *  - User-scoped via RLS (no client-trusted user_id, no service_role).
 *  - Never mutates action_queue or diary_entries.
 *  - Never claims an action fixed or resolved an issue.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  findPendingOutcomeReviews,
  PENDING_OUTCOME_REVIEW_THRESHOLD_MS,
  type PendingOutcomeReview,
} from "@/lib/pendingOutcomeReviewRules";

export type PendingOutcomeReviewsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; items: PendingOutcomeReview[] }
  | { status: "unavailable" };

const COMPLETED_ACTION_COLUMNS =
  "id,status,completed_at,suggested_change,grow_id";
const OUTCOME_DIARY_COLUMNS = "id,details";

export function useDashboardPendingOutcomeReviews(
  growId: string | null | undefined,
): PendingOutcomeReviewsState {
  const { user } = useAuth();
  const [state, setState] = useState<PendingOutcomeReviewsState>({
    status: "idle",
  });

  const load = useCallback(async () => {
    if (!user || !growId) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    try {
      const cutoffIso = new Date(
        Date.now() - PENDING_OUTCOME_REVIEW_THRESHOLD_MS,
      ).toISOString();
      const [actionsRes, outcomesRes] = await Promise.all([
        supabase
          .from("action_queue")
          .select(COMPLETED_ACTION_COLUMNS)
          .eq("grow_id", growId)
          .eq("status", "completed")
          .lte("completed_at", cutoffIso)
          .order("completed_at", { ascending: true })
          .limit(50),
        supabase
          .from("diary_entries")
          .select(OUTCOME_DIARY_COLUMNS)
          .eq("grow_id", growId)
          .eq("details->>event_type", "action_outcome")
          .limit(200),
      ]);
      if (actionsRes.error || outcomesRes.error) {
        setState({ status: "unavailable" });
        return;
      }
      const items = findPendingOutcomeReviews({
        completedActions: actionsRes.data ?? [],
        outcomes: outcomesRes.data ?? [],
        now: Date.now(),
      });
      setState({ status: "ok", items });
    } catch {
      setState({ status: "unavailable" });
    }
  }, [user, growId]);

  useEffect(() => {
    load();
  }, [load]);

  return state;
}

export default useDashboardPendingOutcomeReviews;
