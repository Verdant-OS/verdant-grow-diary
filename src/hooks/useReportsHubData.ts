/**
 * useReportsHubData — read-only Supabase loader for /reports.
 *
 * Loads compact aggregates for the Grow Learning Hub scoped to one grow:
 *  - Outcome rollup + Action Outcome Learning report (action_outcome diary rows)
 *  - Open environment alert counts by severity
 *  - Latest sensor reading captured_at + count of recent readings (tents in grow)
 *  - Diary entry total + last-7-days count for timeline activity summary
 *
 * SAFETY:
 *  - Read-only: no .insert/.update/.delete/.upsert/.rpc.
 *  - No ai-coach call. No device-control. No service_role. RLS enforces ownership.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth";
import {
  EMPTY_GROW_OUTCOME_SUMMARY,
  summarizeGrowOutcomes,
  type GrowOutcomeSummary,
  type RawGrowOutcomeRow,
} from "@/lib/growOutcomeRollupRules";
import {
  buildActionOutcomeLearningReport,
  EMPTY_LEARNING_REPORT,
  type ActionOutcomeLearningReport,
} from "@/lib/actionOutcomeLearningRules";

export type ReportsHubDataStatus = "idle" | "loading" | "ready" | "unavailable";

export interface ReportsHubData {
  status: ReportsHubDataStatus;
  outcomeSummary: GrowOutcomeSummary;
  outcomeLearning: ActionOutcomeLearningReport;
  alertsOpen: number;
  alertsCritical: number;
  alertsWarning: number;
  latestSensorCapturedAt: string | null;
  recentSensorReadingCount: number;
  diaryEntriesTotal: number;
  diaryEntriesLast7d: number;
}

export const EMPTY_REPORTS_HUB_DATA: ReportsHubData = {
  status: "idle",
  outcomeSummary: EMPTY_GROW_OUTCOME_SUMMARY,
  outcomeLearning: EMPTY_LEARNING_REPORT,
  alertsOpen: 0,
  alertsCritical: 0,
  alertsWarning: 0,
  latestSensorCapturedAt: null,
  recentSensorReadingCount: 0,
  diaryEntriesTotal: 0,
  diaryEntriesLast7d: 0,
};

export function useReportsHubData(growId: string | null | undefined): ReportsHubData {
  const { user } = useAuth();
  const [state, setState] = useState<ReportsHubData>(EMPTY_REPORTS_HUB_DATA);

  const load = useCallback(async () => {
    if (!user || !growId) {
      setState({ ...EMPTY_REPORTS_HUB_DATA, status: "idle" });
      return;
    }
    setState((prev) => ({ ...prev, status: "loading" }));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      // Resolve tent ids for sensor lookup.
      const { data: tentRows, error: tentErr } = await supabase
        .from("tents")
        .select("id")
        .eq("grow_id", growId);
      if (tentErr) throw tentErr;
      const tentIds = (tentRows ?? []).map((r) => r.id as string).filter(Boolean);

      const [
        outcomeRes,
        alertsOpenRes,
        alertsCritRes,
        alertsWarnRes,
        diaryTotalRes,
        diary7dRes,
        sensorLatestRes,
        sensorRecentRes,
      ] = await Promise.all([
        supabase
          .from("diary_entries")
          .select("id,entry_at,created_at,note,details")
          .eq("grow_id", growId)
          .eq("details->>event_type", "action_outcome")
          .order("entry_at", { ascending: false })
          .limit(50),
        supabase
          .from("alerts")
          .select("id", { count: "exact", head: true })
          .eq("grow_id", growId)
          .eq("status", "open"),
        supabase
          .from("alerts")
          .select("id", { count: "exact", head: true })
          .eq("grow_id", growId)
          .eq("status", "open")
          .eq("severity", "critical"),
        supabase
          .from("alerts")
          .select("id", { count: "exact", head: true })
          .eq("grow_id", growId)
          .eq("status", "open")
          .eq("severity", "warning"),
        supabase
          .from("diary_entries")
          .select("id", { count: "exact", head: true })
          .eq("grow_id", growId),
        supabase
          .from("diary_entries")
          .select("id", { count: "exact", head: true })
          .eq("grow_id", growId)
          .gte("entry_at", sevenDaysAgo),
        tentIds.length > 0
          ? supabase
              .from("sensor_readings")
              .select("ts")
              .in("tent_id", tentIds)
              .order("ts", { ascending: false })
              .limit(1)
          : Promise.resolve({ data: [], error: null } as { data: { ts: string }[]; error: null }),
        tentIds.length > 0
          ? supabase
              .from("sensor_readings")
              .select("id", { count: "exact", head: true })
              .in("tent_id", tentIds)
              .gte("ts", sevenDaysAgo)
          : Promise.resolve({ count: 0, error: null } as { count: number; error: null }),
      ]);

      const outcomeRows = (outcomeRes.data ?? []) as RawGrowOutcomeRow[];

      setState({
        status: "ready",
        outcomeSummary: summarizeGrowOutcomes(outcomeRows),
        outcomeLearning: buildActionOutcomeLearningReport(outcomeRows),
        alertsOpen: alertsOpenRes.count ?? 0,
        alertsCritical: alertsCritRes.count ?? 0,
        alertsWarning: alertsWarnRes.count ?? 0,
        latestSensorCapturedAt:
          (sensorLatestRes.data?.[0]?.ts as string | undefined) ?? null,
        recentSensorReadingCount: sensorRecentRes.count ?? 0,
        diaryEntriesTotal: diaryTotalRes.count ?? 0,
        diaryEntriesLast7d: diary7dRes.count ?? 0,
      });
    } catch {
      setState({ ...EMPTY_REPORTS_HUB_DATA, status: "unavailable" });
    }
  }, [user, growId]);

  useEffect(() => {
    load();
  }, [load]);

  return state;
}
