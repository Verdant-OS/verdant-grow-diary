/**
 * useGrowDetailData — read-only Supabase loader for /grows/:growId.
 *
 * Owns all data fetching for the Grow Detail page:
 *  - grow row (maybeSingle, safe not-found)
 *  - related counts (plants, tents, diary, action_queue, action_queue_events)
 *  - recent activity (latest 5 diary + latest 5 manual grow_events + latest 5
 *    action_queue_events, merged)
 *  - grow status (pending action risk + last diary/manual-log timestamp)
 *
 * Diary/activity numbers merge the `grow_events` spine with `diary_entries`:
 * every confirmed Quick Log save writes a spine row, while a diary companion
 * exists only when structured details exist. Companions are deduped by
 * linkage (details.linked_grow_event_id) and by identical (plant_id,
 * timestamp) pairs so nothing double-counts.
 *
 * Read-only: no .insert/.update/.delete/.upsert/.rpc. No ai-coach call.
 * No device-control surface. No elevated keys. RLS enforces ownership.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import { alertDetailPath } from "@/lib/routes";
import {
  type CountValue,
  type GrowStatus,
  type RecentItem,
  type RiskRank,
  UNAVAILABLE_STATUS,
  deriveStatus,
  mergeRecent,
  rankRisk,
} from "@/lib/growStatus";
import {
  EMPTY_GROW_OUTCOME_SUMMARY,
  pickRecentGrowOutcomes,
  summarizeGrowOutcomes,
  type GrowOutcomeSummary,
  type PickedGrowOutcome,
  type RawGrowOutcomeRow,
} from "@/lib/growOutcomeRollupRules";
import {
  buildActionOutcomeLearningReport,
  EMPTY_LEARNING_REPORT,
  type ActionOutcomeLearningReport,
} from "@/lib/actionOutcomeLearningRules";
import {
  countMergedManualGrowActivity,
  dedupeMergedManualGrowActivityRows,
  type ConnectedActivationDiaryEntryRow,
  type ConnectedActivationGrowEventRow,
} from "@/lib/connectedOneTentActivationRules";
import { resolveQuickLogEventTimelineLabel } from "@/lib/quickLogActivityRules";

/** Bounded dedupe window for merging diary rows with the grow_events spine. */
const ACTIVITY_MERGE_WINDOW = 1000;

type MergeDiaryRow = ConnectedActivationDiaryEntryRow;
type MergeGrowEventRow = ConnectedActivationGrowEventRow & { note?: string | null };

export type GrowOutcomesState = {
  status: "loading" | "ready" | "unavailable";
  summary: GrowOutcomeSummary;
  recent: PickedGrowOutcome[];
  learning: ActionOutcomeLearningReport;
};

export const EMPTY_GROW_OUTCOMES_STATE: GrowOutcomesState = {
  status: "loading",
  summary: EMPTY_GROW_OUTCOME_SUMMARY,
  recent: [],
  learning: EMPTY_LEARNING_REPORT,
};

export interface GrowRow {
  id: string;
  name: string;
  stage: string;
  grow_type: string;
  is_archived: boolean;
  started_at: string;
  created_at: string;
  updated_at: string;
  notes: string | null;
}

export interface GrowCounts {
  plants: CountValue;
  tents: CountValue;
  diary: CountValue;
  actionsPending: CountValue;
  actionsTotal: CountValue;
  auditEvents: CountValue;
  alertsOpen: CountValue;
  alertsCritical: CountValue;
  alertsWarning: CountValue;
}

export const EMPTY_COUNTS: GrowCounts = {
  plants: 0,
  tents: 0,
  diary: 0,
  actionsPending: 0,
  actionsTotal: 0,
  auditEvents: 0,
  alertsOpen: 0,
  alertsCritical: 0,
  alertsWarning: 0,
};

export type RecentState =
  | { status: "loading" }
  | { status: "ok"; items: RecentItem[] }
  | { status: "unavailable" };

export interface UseGrowDetailData {
  grow: GrowRow | null;
  loading: boolean;
  notFound: boolean;
  error: boolean;
  counts: GrowCounts;
  recent: RecentState;
  status: GrowStatus;
  outcomes: GrowOutcomesState;
  growId: string | undefined;
  refetch: () => void;
}


export function useGrowDetailData(): UseGrowDetailData {
  const { growId } = useParams<{ growId: string }>();
  const { user } = useAuth();
  const [grow, setGrow] = useState<GrowRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  const [counts, setCounts] = useState<GrowCounts>(EMPTY_COUNTS);
  const [recent, setRecent] = useState<RecentState>({ status: "loading" });
  const [outcomes, setOutcomes] = useState<GrowOutcomesState>(EMPTY_GROW_OUTCOMES_STATE);
  const [status, setStatus] = useState<GrowStatus>({
    level: "good",
    reason: "Loading…",
    pending: 0,
    highestRisk: "none",
    lastDiaryAt: null,
  });

  const load = useCallback(async () => {
    if (!user || !growId) return;
    setLoading(true);
    setNotFound(false);
    setError(false);

    const { data, error: gErr } = await supabase
      .from("grows")
      .select("id,name,stage,grow_type,is_archived,started_at,created_at,updated_at,notes")
      .eq("id", growId)
      .maybeSingle();
    if (gErr) {
      setGrow(null);
      setError(true);
      setLoading(false);
      return;
    }
    if (!data) {
      setGrow(null);
      setNotFound(true);
      setLoading(false);
      return;
    }

    setGrow(data as GrowRow);

    // Read-only count queries. Any failure degrades to "unavailable".
    type CountQuery = { eq: (col: string, val: unknown) => CountQuery } & PromiseLike<{
      count: number | null;
      error: unknown;
    }>;
    async function countFrom(
      table:
        | "plants"
        | "tents"
        | "diary_entries"
        | "grow_events"
        | "action_queue"
        | "action_queue_events"
        | "alerts",
      extra?: (q: CountQuery) => CountQuery,
    ): Promise<CountValue> {
      try {
        const base = supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("grow_id", growId!) as unknown as CountQuery;
        const q = extra ? extra(base) : base;
        const { count, error: cErr } = await q;
        if (cErr) return "unavailable";
        return count ?? 0;
      } catch {
        return "unavailable";
      }
    }

    const [
      plants,
      tents,
      diaryOnly,
      manualEvents,
      actionsPending,
      actionsTotal,
      auditEvents,
      alertsOpen,
      alertsCritical,
      alertsWarning,
    ] = await Promise.all([
      countFrom("plants"),
      countFrom("tents"),
      countFrom("diary_entries"),
      countFrom("grow_events", (q) => q.eq("source", "manual").eq("is_deleted", false)),
      countFrom("action_queue", (q) => q.eq("status", "pending_approval")),
      countFrom("action_queue"),
      countFrom("action_queue_events"),
      countFrom("alerts", (q) => q.eq("status", "open")),
      countFrom("alerts", (q) => q.eq("status", "open").eq("severity", "critical")),
      countFrom("alerts", (q) => q.eq("status", "open").eq("severity", "warning")),
    ]);

    // Merge the grow_events spine into the diary/activity counter. A plain
    // Quick Log save has no diary companion, so diary_entries alone hides it;
    // companion rows are deduped inside the bounded window, and the exact
    // per-table counts clamp the result if the window ever saturates.
    let diary: CountValue = diaryOnly;
    try {
      const [diaryRowsRes, spineRowsRes] = await Promise.all([
        supabase
          .from("diary_entries")
          .select("id,plant_id,entry_at,created_at,details")
          .eq("grow_id", growId)
          .order("entry_at", { ascending: false })
          .limit(ACTIVITY_MERGE_WINDOW),
        supabase
          .from("grow_events")
          .select("id,tent_id,plant_id,event_type,occurred_at,created_at,source,is_deleted,deleted_at")
          .eq("grow_id", growId)
          .eq("source", "manual")
          .eq("is_deleted", false)
          .order("occurred_at", { ascending: false })
          .limit(ACTIVITY_MERGE_WINDOW),
      ]);
      if (!diaryRowsRes.error && !spineRowsRes.error) {
        const diaryRows = (diaryRowsRes.data ?? []) as MergeDiaryRow[];
        const spineRows = (spineRowsRes.data ?? []) as MergeGrowEventRow[];
        const merged = countMergedManualGrowActivity({
          diaryEntries: diaryRows,
          growEvents: spineRows,
        });
        const windowSaturated =
          diaryRows.length >= ACTIVITY_MERGE_WINDOW ||
          spineRows.length >= ACTIVITY_MERGE_WINDOW;
        diary = windowSaturated
          ? Math.max(
              merged,
              typeof diaryOnly === "number" ? diaryOnly : 0,
              typeof manualEvents === "number" ? manualEvents : 0,
            )
          : merged;
      }
    } catch {
      // Keep the plain diary count — degraded, never inflated.
    }

    setCounts({
      plants,
      tents,
      diary,
      actionsPending,
      actionsTotal,
      auditEvents,
      alertsOpen,
      alertsCritical,
      alertsWarning,
    });

    // Recent activity: latest 5 diary + latest 5 manual grow_events +
    // latest 5 action_queue_events + latest 5 alert_events (read-only merge).
    try {
      const [diaryRes, growEventsRes, eventsRes, alertEventsRes] = await Promise.all([
        supabase
          .from("diary_entries")
          .select("id,plant_id,entry_at,stage,note,details")
          .eq("grow_id", growId)
          .order("entry_at", { ascending: false })
          .limit(5),
        supabase
          .from("grow_events")
          .select("id,tent_id,plant_id,event_type,occurred_at,source,is_deleted,deleted_at,note")
          .eq("grow_id", growId)
          .eq("source", "manual")
          .eq("is_deleted", false)
          .order("occurred_at", { ascending: false })
          .limit(5),
        supabase
          .from("action_queue_events")
          .select("id,action_queue_id,event_type,previous_status,new_status,note,created_at")
          .eq("grow_id", growId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("alert_events")
          .select("id,alert_id,event_type,previous_status,new_status,note,created_at")
          .eq("grow_id", growId)
          .order("created_at", { ascending: false })
          .limit(5),
      ]);

      if (diaryRes.error || growEventsRes.error || eventsRes.error || alertEventsRes.error) {
        setRecent({ status: "unavailable" });
      } else {
        // Dedupe companion diary rows against their grow_events parents so a
        // Quick Log save never renders twice in the merged recent list.
        const activityRows = dedupeMergedManualGrowActivityRows({
          diaryEntries: (diaryRes.data ?? []) as (MergeDiaryRow & {
            stage?: string | null;
            note?: string | null;
          })[],
          growEvents: (growEventsRes.data ?? []) as MergeGrowEventRow[],
        });

        const diaryItems: RecentItem[] = activityRows.diaryEntries.map((d) => ({
          id: `diary-${d.id}`,
          kind: "diary",
          ts: d.entry_at ?? "",
          title: d.stage ? `Diary entry (${d.stage})` : "Diary entry",
          detail: d.note,
        }));

        const growEventItems: RecentItem[] = activityRows.growEvents.map((e) => {
          const label = resolveQuickLogEventTimelineLabel({ eventType: e.event_type });
          return {
            id: `grow-event-${e.id}`,
            kind: "diary",
            ts: e.occurred_at ?? e.created_at ?? "",
            title: label ? `Quick log (${label})` : "Quick log entry",
            detail: e.note ?? null,
          };
        });

        const actionIds = Array.from(
          new Set((eventsRes.data ?? []).map((e) => e.action_queue_id).filter(Boolean)),
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

        // Resolve parent alerts for context (title/severity/metric).
        const alertIds = Array.from(
          new Set((alertEventsRes.data ?? []).map((e) => e.alert_id).filter(Boolean)),
        );
        let alertParents: Record<
          string,
          { title: string; severity: string; metric: string | null; status: string }
        > = {};
        if (alertIds.length > 0) {
          const { data: aRows } = await supabase
            .from("alerts")
            .select("id,title,severity,metric,status")
            .in("id", alertIds);
          alertParents = Object.fromEntries(
            (aRows ?? []).map((a) => [
              a.id,
              {
                title: a.title as string,
                severity: a.severity as string,
                metric: (a.metric as string | null) ?? null,
                status: a.status as string,
              },
            ]),
          );
        }

        const alertItems: RecentItem[] = (alertEventsRes.data ?? []).map((e) => {
          const parent = alertParents[e.alert_id];
          return {
            id: `alert-event-${e.id}`,
            kind: "alert_event",
            ts: e.created_at,
            title: `${e.event_type}${parent ? `: ${parent.title}` : ""}`,
            detail: e.note ?? (parent?.metric ? `metric: ${parent.metric}` : null) ?? null,
            href: alertDetailPath(e.alert_id),
          };
        });

        setRecent({
          status: "ok",
          items: mergeRecent([...diaryItems, ...growEventItems, ...eventItems, ...alertItems]),
        });
      }
    } catch {
      setRecent({ status: "unavailable" });
    }

    // Grow Status — derived from existing read-only data only.
    // NOT AI diagnosis. No ai-coach call. No device control.
    try {
      const { data: riskRows, error: riskErr } = await supabase
        .from("action_queue")
        .select("risk_level")
        .eq("grow_id", growId)
        .eq("status", "pending_approval")
        .limit(50);
      const highestRisk: RiskRank = riskErr ? "unknown" : rankRisk(riskRows ?? []);

      const [
        { data: lastDiaryRows, error: lastDiaryErr },
        { data: lastEventRows, error: lastEventErr },
      ] = await Promise.all([
        supabase
          .from("diary_entries")
          .select("entry_at")
          .eq("grow_id", growId)
          .order("entry_at", { ascending: false })
          .limit(1),
        supabase
          .from("grow_events")
          .select("occurred_at")
          .eq("grow_id", growId)
          .eq("source", "manual")
          .eq("is_deleted", false)
          .order("occurred_at", { ascending: false })
          .limit(1),
      ]);
      const lastDiaryOnlyAt = lastDiaryErr ? null : (lastDiaryRows?.[0]?.entry_at ?? null);
      // A spine-only Quick Log save is real grower activity: freshness uses
      // the later of the last diary entry and the last manual grow_event.
      const lastManualEventAt = lastEventErr ? null : (lastEventRows?.[0]?.occurred_at ?? null);
      const lastDiaryAt =
        lastDiaryOnlyAt && lastManualEventAt
          ? Date.parse(lastManualEventAt) > Date.parse(lastDiaryOnlyAt)
            ? lastManualEventAt
            : lastDiaryOnlyAt
          : (lastDiaryOnlyAt ?? lastManualEventAt);

      const pending = actionsPending;
      const { level, reason } = deriveStatus({ pending, highestRisk, lastDiaryAt });
      setStatus({ level, reason, pending, highestRisk, lastDiaryAt });
    } catch {
      setStatus(UNAVAILABLE_STATUS);
    }

    // Recent grower-recorded action outcomes (read-only).
    // Scoped by grow_id; filtered to action_outcome diary entries.
    try {
      const { data: outcomeRows, error: outcomeErr } = await supabase
        .from("diary_entries")
        .select("id,entry_at,created_at,note,details")
        .eq("grow_id", growId)
        .eq("details->>event_type", "action_outcome")
        .order("entry_at", { ascending: false })
        .limit(20);
      if (outcomeErr) {
        setOutcomes({
          status: "unavailable",
          summary: EMPTY_GROW_OUTCOME_SUMMARY,
          recent: [],
          learning: EMPTY_LEARNING_REPORT,
        });
      } else {
        const rows = (outcomeRows ?? []) as RawGrowOutcomeRow[];
        setOutcomes({
          status: "ready",
          summary: summarizeGrowOutcomes(rows),
          recent: pickRecentGrowOutcomes(rows, 5),
          learning: buildActionOutcomeLearningReport(rows),
        });
      }
    } catch {
      setOutcomes({
        status: "unavailable",
        summary: EMPTY_GROW_OUTCOME_SUMMARY,
        recent: [],
        learning: EMPTY_LEARNING_REPORT,
      });
    }

    setLoading(false);
  }, [user, growId]);

  useEffect(() => {
    load();
  }, [load]);

  return { grow, loading, notFound, error, counts, recent, status, outcomes, growId, refetch: load };
}
