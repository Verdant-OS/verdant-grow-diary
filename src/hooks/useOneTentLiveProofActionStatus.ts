/**
 * useOneTentLiveProofActionStatus — read-only hook used by the One-Tent
 * Live Proof page to infer whether any linked action_queue row exists
 * for the visible alert ids, whether one of them is completed, and to
 * surface a deep-link action id when uniquely known.
 *
 * Safety:
 *  - SELECT only. No insert/update/delete/upsert/rpc/functions.invoke.
 *  - RLS enforces ownership; no service_role.
 *  - Never exposes raw [alert:<id>] tokens to the UI — ids only.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { extractSourceAlertId } from "@/lib/actionQueueProvenanceRules";

export interface OneTentLiveProofActionStatus {
  linkedActionExists: boolean;
  linkedActionCompleted: boolean | null;
  /** Id of the single linked action when uniquely known. */
  linkedActionId: string | null;
  /** Id of a completed linked action (preferred for deep-link). */
  completedActionId: string | null;
  loading: boolean;
  refreshNonce: number;
}

export function useOneTentLiveProofActionStatus(
  alertIds: ReadonlyArray<string>,
  externalNonce: number,
): OneTentLiveProofActionStatus {
  const [state, setState] = useState<OneTentLiveProofActionStatus>({
    linkedActionExists: false,
    linkedActionCompleted: null,
    linkedActionId: null,
    completedActionId: null,
    loading: false,
    refreshNonce: 0,
  });
  const idKey = Array.from(new Set(alertIds)).sort().join(",");

  useEffect(() => {
    let cancelled = false;
    const ids = idKey ? idKey.split(",") : [];
    if (ids.length === 0) {
      setState((s) => ({
        ...s,
        linkedActionExists: false,
        linkedActionCompleted: null,
        linkedActionId: null,
        completedActionId: null,
        loading: false,
      }));
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    (async () => {
      const { data, error } = await supabase
        .from("action_queue")
        .select("id,reason,status")
        .limit(1000);
      if (cancelled) return;
      if (error) {
        setState((s) => ({
          ...s,
          linkedActionExists: false,
          linkedActionCompleted: null,
          linkedActionId: null,
          completedActionId: null,
          loading: false,
        }));
        return;
      }
      const allowed = new Set(ids);
      const matched: Array<{ id: string; status: string }> = [];
      for (const row of (data ?? []) as Array<{
        id: string;
        reason: string | null;
        status: string | null;
      }>) {
        const alertId = extractSourceAlertId(row.reason ?? null);
        if (!alertId || !allowed.has(alertId)) continue;
        matched.push({ id: row.id, status: (row.status ?? "").toLowerCase() });
      }
      const completed = matched.find((m) => m.status === "completed") ?? null;
      const linkedActionExists = matched.length > 0;
      const linkedActionCompleted = linkedActionExists ? !!completed : null;
      const linkedActionId =
        completed?.id ?? (matched.length === 1 ? matched[0].id : null);
      setState({
        linkedActionExists,
        linkedActionCompleted,
        linkedActionId,
        completedActionId: completed?.id ?? null,
        loading: false,
        refreshNonce: externalNonce,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [idKey, externalNonce]);

  return state;
}
