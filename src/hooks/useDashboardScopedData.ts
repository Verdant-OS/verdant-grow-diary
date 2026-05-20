/**
 * useDashboardScopedData — read-only Supabase loader for the grow-scoped
 * Dashboard.
 *
 * Fetches, for a single grow_id:
 *   - latest 5 diary_entries
 *   - latest 5 action_queue_events (with parent suggested_change/reason)
 *   - pending action_queue rows (status = 'pending_approval')
 *
 * Read-only: no .insert/.update/.delete/.upsert/.rpc. No ai-coach call.
 * No device-control surface. No elevated keys. RLS enforces ownership.
 *
 * When growId is falsy the hook idles in `prompt` state — the Dashboard
 * itself decides whether to render a "Select a grow" hint.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { type RecentItem, mergeRecent } from "@/lib/growStatus";

export interface PendingAction {
  id: string;
  risk_level: string;
  suggested_change: string;
  reason: string;
  created_at: string;
}

export type RecentState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; items: RecentItem[] }
  | { status: "unavailable" };

export type PendingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; items: PendingAction[] }
  | { status: "unavailable" };

export interface UseDashboardScopedData {
  recent: RecentState;
  pending: PendingState;
}

export function useDashboardScopedData(
  growId: string | null | undefined,
): UseDashboardScopedData {
  const { user } = useAuth();
  const [recent, setRecent] = useState<RecentState>({ status: "idle" });
  const [pending, setPending] = useState<PendingState>({ status: "idle" });

  const load = useCallback(async () => {
    if (!user || !growId) {
      setRecent({ status: "idle" });
      setPending({ status: "idle" });
      return;
    }
    setRecent({ status: "loading" });
    setPending({ status: "loading" });

    // Recent activity: latest 5 diary + latest 5 action_queue_events.
    try {
      const [diaryRes, eventsRes] = await Promise.all([
        supabase
          .from("diary_entries")
          .select("id,entry_at,stage,note")
          .eq("grow_id", growId)
          .order("entry_at", { ascending: false })
          .limit(5),
        supabase
          .from("action_queue_events")
          .select(
            "id,action_queue_id,event_type,previous_status,new_status,note,created_at",
          )
          .eq("grow_id", growId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (diaryRes.error || eventsRes.error) {
        setRecent({ status: "unavailable" });
      } else {
        const diaryItems: RecentItem[] = (diaryRes.data ?? []).map((d) => ({
          id: `diary-${d.id}`,
          kind: "diary",
          ts: d.entry_at,
          title: d.stage ? `Diary entry (${d.stage})` : "Diary entry",
          detail: d.note,
        }));

        const actionIds = Array.from(
          new Set(
            (eventsRes.data ?? []).map((e) => e.action_queue_id).filter(Boolean),
          ),
        );
        let parents: Record<string, { suggested_change: string; reason: string }> = {};
        if (actionIds.length > 0) {
          const { data: pRows } = await supabase
            .from("action_queue")
            .select("id,suggested_change,reason")
            .in("id", actionIds);
          parents = Object.fromEntries(
            (pRows ?? []).map((p) => [
              p.id,
              { suggested_change: p.suggested_change, reason: p.reason },
            ]),
          );
        }

        const eventItems: RecentItem[] = (eventsRes.data ?? []).map((e) => {
          const parent = parents[e.action_queue_id];
          return {
            id: `event-${e.id}`,
            kind: "action_event",
            ts: e.created_at,
            title: `${e.event_type}${parent ? `: ${parent.suggested_change}` : ""}`,
            detail: e.note ?? parent?.reason ?? null,
            href: `/actions/${e.action_queue_id}`,
          };
        });

        setRecent({
          status: "ok",
          items: mergeRecent([...diaryItems, ...eventItems]),
        });
      }
    } catch {
      setRecent({ status: "unavailable" });
    }

    // Pending action_queue items for this grow.
    try {
      const { data, error } = await supabase
        .from("action_queue")
        .select("id,risk_level,suggested_change,reason,created_at,status")
        .eq("grow_id", growId)
        .eq("status", "pending_approval")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        setPending({ status: "unavailable" });
      } else {
        setPending({
          status: "ok",
          items: (data ?? []).map((r) => ({
            id: r.id,
            risk_level: r.risk_level,
            suggested_change: r.suggested_change,
            reason: r.reason,
            created_at: r.created_at,
          })),
        });
      }
    } catch {
      setPending({ status: "unavailable" });
    }
  }, [user, growId]);

  useEffect(() => {
    load();
  }, [load]);

  return { recent, pending };
}

export default useDashboardScopedData;
