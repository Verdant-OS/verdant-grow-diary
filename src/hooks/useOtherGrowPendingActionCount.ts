/**
 * useOtherGrowPendingActionCount — read-only count of approval-required
 * actions that are pending in grows OTHER than the one currently in scope.
 *
 * Why this exists: the Action Queue loads a single grow's actions (URL
 * `?growId=`, else the workspace active grow), so when that grow is empty the
 * page can only honestly say "none pending here". It cannot say "none exist" —
 * and a PENDING_APPROVAL action in a grow the user cannot select was
 * previously invisible with no hint that it was there at all. Grows are
 * filtered by `is_archived = false` in `fetchGrowRows`, so an archived grow
 * still holding live plants and an unapproved high-risk action disappears from
 * every selector while its actions stay pending.
 *
 * This hook restores discoverability without changing scope: the queue still
 * lists only the scoped grow's rows. It just stops the empty state implying
 * nothing is pending anywhere.
 *
 * SAFETY:
 *  - Read-only: no .insert/.update/.delete/.upsert/.rpc.
 *  - User-scoped via RLS (no client-trusted user_id, no service_role).
 *  - Counts only; never surfaces another grow's action content here.
 *  - No AI, no automation, no device control.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";

export type OtherGrowPendingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; count: number; growIds: string[] }
  | { status: "unavailable" };

/** Cap on sampled rows; `count` remains exact regardless of this limit. */
const SAMPLE_LIMIT = 50;

export function useOtherGrowPendingActionCount(
  scopedGrowId: string | null | undefined,
): OtherGrowPendingState {
  const { user } = useAuth();
  const [state, setState] = useState<OtherGrowPendingState>({ status: "idle" });

  const load = useCallback(async () => {
    // With no grow in scope the queue is already showing every grow the user
    // can see, so "other grows" is not a meaningful question.
    if (!user || !scopedGrowId) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    try {
      const { data, error, count } = await supabase
        .from("action_queue")
        .select("id,grow_id", { count: "exact" })
        .eq("status", "pending_approval")
        .neq("grow_id", scopedGrowId)
        .limit(SAMPLE_LIMIT);
      if (error) {
        setState({ status: "unavailable" });
        return;
      }
      const growIds = Array.from(
        new Set(
          (data ?? [])
            .map((r) => (r as { grow_id: string | null }).grow_id)
            .filter((id): id is string => typeof id === "string" && !!id),
        ),
      );
      setState({ status: "ok", count: count ?? growIds.length, growIds });
    } catch {
      setState({ status: "unavailable" });
    }
  }, [user, scopedGrowId]);

  useEffect(() => {
    void load();
  }, [load]);

  return state;
}
