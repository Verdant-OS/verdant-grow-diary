/**
 * useReportsHubData — read-only Supabase loader for /reports.
 *
 * Loads compact aggregates for the Grow Learning Hub scoped to one grow:
 *  - Outcome rollup + Action Outcome Learning report (action_outcome diary rows)
 *  - Open environment alert counts by severity
 *  - Latest sensor reading captured_at + count of recent readings (tents in grow)
 *  - Diary entry total + last-7-days count for timeline activity summary,
 *    merged with the manual `grow_events` spine (a plain Quick Log save has
 *    no diary companion; companions dedupe by linkage + timestamp pair)
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
import {
  findPendingOutcomeReviews,
  PENDING_OUTCOME_REVIEW_THRESHOLD_MS,
} from "@/lib/pendingOutcomeReviewRules";
import { normalizeSensorSource } from "@/lib/sensor/sensorSourceRules";
import { isDiagnosticSensorProvenanceRow } from "@/lib/sensorProvenanceFenceRules";
import { resolveSensorObservationTime } from "@/lib/sensorObservationTimeRules";
import {
  countMergedManualGrowActivity,
  type ConnectedActivationDiaryEntryRow,
  type ConnectedActivationGrowEventRow,
} from "@/lib/connectedOneTentActivationRules";

/** Bounded dedupe window for merging diary rows with the grow_events spine. */
const REPORTS_HUB_ACTIVITY_MERGE_WINDOW = 1_000;

export type ReportsHubDataStatus = "idle" | "loading" | "ready" | "unavailable";

export interface ReportsHubData {
  status: ReportsHubDataStatus;
  outcomeSummary: GrowOutcomeSummary;
  outcomeLearning: ActionOutcomeLearningReport;
  alertsOpen: number;
  alertsCritical: number;
  alertsWarning: number;
  firstOpenAlertId: string | null;
  firstOpenAlertSeverity: string | null;
  firstOpenAlertCreatedAt: string | null;
  latestSensorCapturedAt: string | null;
  recentSensorReadingCount: number;
  diaryEntriesTotal: number;
  diaryEntriesLast7d: number;
  pendingOutcomeReviewCount: number;
  firstPendingActionId: string | null;
  oldestPendingCompletedAt: string | null;
}

export const EMPTY_REPORTS_HUB_DATA: ReportsHubData = {
  status: "idle",
  outcomeSummary: EMPTY_GROW_OUTCOME_SUMMARY,
  outcomeLearning: EMPTY_LEARNING_REPORT,
  alertsOpen: 0,
  alertsCritical: 0,
  alertsWarning: 0,
  firstOpenAlertId: null,
  firstOpenAlertSeverity: null,
  firstOpenAlertCreatedAt: null,
  latestSensorCapturedAt: null,
  recentSensorReadingCount: 0,
  diaryEntriesTotal: 0,
  diaryEntriesLast7d: 0,
  pendingOutcomeReviewCount: 0,
  firstPendingActionId: null,
  oldestPendingCompletedAt: null,
};

export interface ReportsHubSensorRow {
  ts: string;
  captured_at?: string | null;
  source?: string | null;
  raw_payload?: unknown;
}

const REPORTS_HUB_SENSOR_PAGE_SIZE = 1_000;
const REPORTS_HUB_CONTEXT_SOURCES = ["live", "manual", "csv"] as const;

/** Pure row fence for the Hub's unlabeled sensor count/latest timestamp. */
export function isReportsHubSensorContextRow(row: ReportsHubSensorRow): boolean {
  if (!resolveSensorObservationTime(row)) return false;
  if (isDiagnosticSensorProvenanceRow(row)) return false;
  const source = normalizeSensorSource(row.source);
  return source === "live" || source === "manual" || source === "csv";
}

async function loadReportsHubSensorPage(input: {
  tentIds: string[];
  from: number;
  recentSince?: string;
  before?: string;
}): Promise<ReportsHubSensorRow[]> {
  let query = supabase
    .from("sensor_readings")
    .select("ts,captured_at,source,raw_payload")
    .in("tent_id", input.tentIds)
    .in("source", [...REPORTS_HUB_CONTEXT_SOURCES]);
  // Use physical observation time for the learning summary. Legacy rows with
  // no captured_at retain their established ts fallback; imported historical
  // rows cannot inflate a recent count simply because they were imported now.
  if (input.recentSince) {
    query = query.or(
      `captured_at.gte.${input.recentSince},and(captured_at.is.null,ts.gte.${input.recentSince})`,
    );
  }
  if (input.before) {
    query = query.or(
      `captured_at.lt.${input.before},and(captured_at.is.null,ts.lt.${input.before})`,
    );
  }
  const { data, error } = await query
    .order("captured_at", { ascending: false, nullsFirst: false })
    .order("ts", { ascending: false })
    .range(input.from, input.from + REPORTS_HUB_SENSOR_PAGE_SIZE - 1);
  if (error) throw error;
  return (data ?? []) as ReportsHubSensorRow[];
}

async function findLatestReportsHubSensorAt(
  tentIds: string[],
  before: string,
): Promise<string | null> {
  let from = 0;
  while (true) {
    const page = await loadReportsHubSensorPage({ tentIds, from, before });
    const eligible = page.find(isReportsHubSensorContextRow);
    if (eligible) return resolveSensorObservationTime(eligible);
    if (page.length < REPORTS_HUB_SENSOR_PAGE_SIZE) return null;
    from += REPORTS_HUB_SENSOR_PAGE_SIZE;
  }
}

async function loadReportsHubSensorSummary(
  tentIds: string[],
  recentSince: string,
): Promise<Pick<ReportsHubData, "latestSensorCapturedAt" | "recentSensorReadingCount">> {
  let from = 0;
  let recentSensorReadingCount = 0;
  let latestSensorCapturedAt: string | null = null;
  while (true) {
    const page = await loadReportsHubSensorPage({ tentIds, from, recentSince });
    for (const row of page) {
      if (!isReportsHubSensorContextRow(row)) continue;
      recentSensorReadingCount += 1;
      latestSensorCapturedAt ??= resolveSensorObservationTime(row);
    }
    if (page.length < REPORTS_HUB_SENSOR_PAGE_SIZE) break;
    from += REPORTS_HUB_SENSOR_PAGE_SIZE;
  }
  if (!latestSensorCapturedAt) {
    latestSensorCapturedAt = await findLatestReportsHubSensorAt(tentIds, recentSince);
  }
  return { latestSensorCapturedAt, recentSensorReadingCount };
}

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

      const completedCutoffIso = new Date(
        Date.now() - PENDING_OUTCOME_REVIEW_THRESHOLD_MS,
      ).toISOString();

      const [
        outcomeRes,
        alertsOpenRes,
        alertsCritRes,
        alertsWarnRes,
        diaryTotalRes,
        diary7dRes,
        activityDiaryRowsRes,
        activitySpineRowsRes,
        sensorSummary,
        firstOpenAlertRes,
        completedActionsRes,
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
        // Bounded row windows for the diary + grow_events spine merge. The
        // spine is the canonical Quick Log record; companion diary rows are
        // deduped by linkage and identical (plant_id, timestamp) pairs.
        supabase
          .from("diary_entries")
          .select("id,plant_id,entry_at,created_at,details")
          .eq("grow_id", growId)
          .order("entry_at", { ascending: false })
          .limit(REPORTS_HUB_ACTIVITY_MERGE_WINDOW),
        supabase
          .from("grow_events")
          .select("id,tent_id,plant_id,event_type,occurred_at,created_at,source,is_deleted,deleted_at")
          .eq("grow_id", growId)
          .eq("source", "manual")
          .eq("is_deleted", false)
          .order("occurred_at", { ascending: false })
          .limit(REPORTS_HUB_ACTIVITY_MERGE_WINDOW),
        tentIds.length > 0
          ? loadReportsHubSensorSummary(tentIds, sevenDaysAgo)
          : Promise.resolve({
              latestSensorCapturedAt: null,
              recentSensorReadingCount: 0,
            }),
        supabase
          .from("alerts")
          .select("id,severity,created_at")
          .eq("grow_id", growId)
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1),
        supabase
          .from("action_queue")
          .select("id,status,completed_at,suggested_change,grow_id")
          .eq("grow_id", growId)
          .eq("status", "completed")
          .lte("completed_at", completedCutoffIso)
          .order("completed_at", { ascending: true })
          .limit(50),
      ]);

      const outcomeRows = (outcomeRes.data ?? []) as RawGrowOutcomeRow[];

      // Merge the manual grow_events spine into the diary activity numbers.
      // Row-fetch failure degrades to the plain diary counts (never inflates);
      // a saturated window clamps against the exact per-table counts.
      let diaryEntriesTotal = diaryTotalRes.count ?? 0;
      let diaryEntriesLast7d = diary7dRes.count ?? 0;
      if (!activityDiaryRowsRes.error && !activitySpineRowsRes.error) {
        const activityDiaryRows = (activityDiaryRowsRes.data ??
          []) as ConnectedActivationDiaryEntryRow[];
        const activitySpineRows = (activitySpineRowsRes.data ??
          []) as ConnectedActivationGrowEventRow[];
        const mergedTotal = countMergedManualGrowActivity({
          diaryEntries: activityDiaryRows,
          growEvents: activitySpineRows,
        });
        const merged7d = countMergedManualGrowActivity({
          diaryEntries: activityDiaryRows,
          growEvents: activitySpineRows,
          since: sevenDaysAgo,
        });
        const windowSaturated =
          activityDiaryRows.length >= REPORTS_HUB_ACTIVITY_MERGE_WINDOW ||
          activitySpineRows.length >= REPORTS_HUB_ACTIVITY_MERGE_WINDOW;
        diaryEntriesTotal = windowSaturated
          ? Math.max(mergedTotal, diaryEntriesTotal)
          : mergedTotal;
        diaryEntriesLast7d = windowSaturated
          ? Math.max(merged7d, diaryEntriesLast7d)
          : merged7d;
      }
      const pendingReviews = findPendingOutcomeReviews({
        completedActions: (completedActionsRes.data ?? []) as never,
        outcomes: (outcomeRes.data ?? []) as never,
        now: Date.now(),
      });
      const firstAlert = (firstOpenAlertRes.data?.[0] ?? null) as {
        id?: string;
        severity?: string;
        created_at?: string;
      } | null;

      setState({
        status: "ready",
        outcomeSummary: summarizeGrowOutcomes(outcomeRows),
        outcomeLearning: buildActionOutcomeLearningReport(outcomeRows),
        alertsOpen: alertsOpenRes.count ?? 0,
        alertsCritical: alertsCritRes.count ?? 0,
        alertsWarning: alertsWarnRes.count ?? 0,
        firstOpenAlertId: firstAlert?.id ?? null,
        firstOpenAlertSeverity: firstAlert?.severity ?? null,
        firstOpenAlertCreatedAt: firstAlert?.created_at ?? null,
        latestSensorCapturedAt: sensorSummary.latestSensorCapturedAt,
        recentSensorReadingCount: sensorSummary.recentSensorReadingCount,
        diaryEntriesTotal,
        diaryEntriesLast7d,
        pendingOutcomeReviewCount: pendingReviews.length,
        firstPendingActionId: pendingReviews[0]?.action_queue_id ?? null,
        oldestPendingCompletedAt: pendingReviews[0]?.completed_at ?? null,
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
