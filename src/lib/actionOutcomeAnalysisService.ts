/**
 * actionOutcomeAnalysisService — thin read-only wrapper that collects
 * the rows the pure engine needs and hands them to the compiler.
 *
 * Contract:
 *  - Uses the caller-scoped authenticated client (RLS is the boundary).
 *  - Never writes. Never uses an elevated database role. Never retries.
 *  - Sanitized error reasons only — provider messages never escape.
 *  - Deterministic query order: action → follow-ups → sensor rows →
 *    grow targets → diary rows.
 *  - `analysisAt` must be injected by the caller so the pure engine
 *    stays clock-free; the wrapper does not read Date.now either.
 */

import { supabase as defaultClient } from "@/integrations/supabase/client";
import {
  analyzeActionOutcomeFromRows,
  ACTION_FOLLOWUP_EVENT_TYPE,
  type RawActionQueueRow,
  type RawFollowUpEntryRow,
  type RawGrowTargetsRow,
} from "@/lib/actionOutcomeEvidenceCompiler";
import type { RawDiaryEvidenceRow, RawSensorReadingRow } from "@/lib/actionOutcomeEvidenceRules";
import type { ActionOutcomeAnalysisReceipt } from "@/lib/actionOutcomeAnalysisTypes";
import {
  PRE_WINDOW_HOURS,
  POST_WINDOW_MAX_HOURS,
  parseTimestampMs,
} from "@/lib/actionOutcomeWindowRules";

export type ActionOutcomeAnalysisServiceResult =
  | { ok: true; receipt: ActionOutcomeAnalysisReceipt }
  | {
      ok: false;
      reason:
        | "action_not_found"
        | "action_query_failed"
        | "followup_query_failed"
        | "sensor_query_failed"
        | "targets_query_failed"
        | "diary_query_failed"
        | "invalid_analysis_time"
        | "action_not_completed"
        | "missing_completed_at"
        | "invalid_completed_at"
        | "future_completed_at"
        | "missing_analysis_endpoint"
        | "invalid_analysis_endpoint"
        | "analysis_endpoint_before_completion"
        | "missing_grow_context";
    };

/** Minimal client surface so tests can inject a pure fake. */
export type ActionOutcomeAnalysisClient = Pick<typeof defaultClient, "from">;

export async function analyzeActionOutcome(
  actionQueueId: string,
  dependencies: {
    client?: ActionOutcomeAnalysisClient;
    /** ISO timestamp injected by the caller — never read from a clock here. */
    analysisAt: string;
  },
): Promise<ActionOutcomeAnalysisServiceResult> {
  const client = dependencies.client ?? defaultClient;
  const analysisAt = dependencies.analysisAt;
  if (parseTimestampMs(analysisAt) === null) {
    return { ok: false, reason: "invalid_analysis_time" };
  }

  // 1. Verified action (RLS-scoped: a cross-user id resolves to null).
  const actionRes = await client
    .from("action_queue")
    .select(
      "id,status,completed_at,grow_id,tent_id,plant_id,action_type,target_metric,suggested_change,reason",
    )
    .eq("id", actionQueueId)
    .maybeSingle();
  if (actionRes.error) return { ok: false, reason: "action_query_failed" };
  if (!actionRes.data) return { ok: false, reason: "action_not_found" };
  const action = actionRes.data as RawActionQueueRow;

  // 2. Follow-up rows for this action (marker-matched in the pure layer).
  const followUpRes = await client
    .from("diary_entries")
    .select("id,grow_id,tent_id,plant_id,details")
    .contains("details", {
      event_type: ACTION_FOLLOWUP_EVENT_TYPE,
      action_queue_id: actionQueueId,
    });
  if (followUpRes.error) return { ok: false, reason: "followup_query_failed" };
  const followUpEntries = (followUpRes.data ?? []) as RawFollowUpEntryRow[];

  // 3. Sensor rows in the maximal window (pure layer re-filters exactly).
  let sensorRows: RawSensorReadingRow[] = [];
  if (action.tent_id && action.completed_at) {
    const completedMs = parseTimestampMs(action.completed_at);
    if (completedMs !== null) {
      const fromIso = new Date(completedMs - PRE_WINDOW_HOURS * 3_600_000).toISOString();
      const toIso = new Date(completedMs + POST_WINDOW_MAX_HOURS * 3_600_000).toISOString();
      const sensorRes = await client
        .from("sensor_readings")
        .select("tent_id,metric,value,captured_at,source,quality")
        .eq("tent_id", action.tent_id)
        .gte("captured_at", fromIso)
        .lte("captured_at", toIso);
      if (sensorRes.error) return { ok: false, reason: "sensor_query_failed" };
      sensorRows = (sensorRes.data ?? []) as RawSensorReadingRow[];
    }
  }

  // 4. Grow targets (1:1 with grow).
  let growTargets: RawGrowTargetsRow | null = null;
  if (action.grow_id) {
    const targetsRes = await client
      .from("grow_targets")
      .select(
        "grow_id,temp_min,temp_max,rh_min,rh_max,vpd_min,vpd_max,soil_wc_min,soil_wc_max,soil_ec_min,soil_ec_max,ppfd_min,ppfd_max",
      )
      .eq("grow_id", action.grow_id)
      .maybeSingle();
    if (targetsRes.error) return { ok: false, reason: "targets_query_failed" };
    growTargets = (targetsRes.data as RawGrowTargetsRow | null) ?? null;
  }

  // 5. Diary/operational rows for the grow (pure layer scopes windows).
  let diaryRows: RawDiaryEvidenceRow[] = [];
  if (action.grow_id) {
    const diaryRes = await client
      .from("grow_events")
      .select("event_type,occurred_at,note,grow_id,tent_id,plant_id,is_deleted")
      .eq("grow_id", action.grow_id)
      .eq("is_deleted", false);
    if (diaryRes.error) return { ok: false, reason: "diary_query_failed" };
    diaryRows = (diaryRes.data ?? []) as RawDiaryEvidenceRow[];
  }

  const analyzed = analyzeActionOutcomeFromRows({
    action,
    followUpEntries,
    sensorRows,
    diaryRows,
    growTargets,
    analysisAt,
  });
  if (analyzed.ok === false) return { ok: false, reason: analyzed.reason };
  return { ok: true, receipt: analyzed.receipt };
}
