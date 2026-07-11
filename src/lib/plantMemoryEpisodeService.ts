/**
 * Plant Memory Episode read service — the ONLY place this feature touches
 * Supabase. Bounded queries, grouped in memory, adapted through pure rules.
 *
 * SAFETY:
 *  - Read-only. Never mutates action_queue, alerts, or diary rows.
 *  - RLS-scoped client reads only; no service role.
 *  - sensor_readings select EXCLUDES raw_payload — raw payloads never enter
 *    this feature.
 *  - Errors are sanitized; provider messages never surface.
 *  - No query per episode: one action query, one diary query, one bounded
 *    sensor query per distinct tent (one-tent grows → one query).
 */
import { supabase } from "@/integrations/supabase/client";
import { ACTION_FOLLOWUP_EVENT_TYPE } from "@/lib/actionFollowupRules";
import { ACTION_OUTCOME_EVENT_TYPE } from "@/lib/actionOutcomeRules";
import {
  EPISODE_AFTER_WINDOW_MS,
  EPISODE_BEFORE_WINDOW_MS,
  EPISODE_FOLLOW_UP_DUE_MS,
  RUN_LEARNING_DECISION_EVENT_TYPE,
  parseEpochMs,
  type EpisodeActionInput,
  type EpisodeDiaryRowInput,
  type PlantMemoryEpisode,
  type RunLearningDecisionDraft,
} from "@/lib/plantMemoryEpisodeRules";
import {
  EPISODE_PHOTO_EVENT_TYPE,
  buildPlantMemoryEpisodes,
  type EpisodeSensorRowInput,
} from "@/lib/plantMemoryEpisodeAdapter";

export const EPISODE_ACTION_LIMIT = 60;
export const EPISODE_DIARY_LIMIT = 400;
export const EPISODE_SENSOR_LIMIT = 200;

export type PlantMemoryEpisodeLoad =
  | { status: "ok"; episodes: PlantMemoryEpisode[] }
  | { status: "error"; message: string };

const SANITIZED_ERROR = "Could not load learning episodes. Try again shortly.";

export interface LoadEpisodesArgs {
  readonly growId: string;
  readonly plantId?: string | null;
  readonly actionQueueId?: string | null;
  /** Skip the bounded sensor-evidence query (lighter surfaces). */
  readonly includeSensorEvidence?: boolean;
  /** Injected clock (ISO). Callers pass new Date().toISOString() once. */
  readonly nowIso: string;
}

export async function loadPlantMemoryEpisodes(
  args: LoadEpisodesArgs,
): Promise<PlantMemoryEpisodeLoad> {
  const growId = (args.growId ?? "").trim();
  if (!growId) return { status: "error", message: SANITIZED_ERROR };

  try {
    let actionQuery = supabase
      .from("action_queue")
      .select(
        "id,grow_id,tent_id,plant_id,source,target_metric,suggested_change,reason,status,completed_at",
      )
      .eq("grow_id", growId)
      .eq("status", "completed")
      .not("completed_at", "is", null)
      .order("completed_at", { ascending: false })
      .limit(EPISODE_ACTION_LIMIT);
    if (args.plantId) actionQuery = actionQuery.eq("plant_id", args.plantId);
    if (args.actionQueueId) actionQuery = actionQuery.eq("id", args.actionQueueId);

    const { data: actionRows, error: actionError } = await actionQuery;
    if (actionError) return { status: "error", message: SANITIZED_ERROR };
    const actions = (actionRows ?? []) as unknown as EpisodeActionInput[];
    if (actions.length === 0) return { status: "ok", episodes: [] };

    const { data: diaryRows, error: diaryError } = await supabase
      .from("diary_entries")
      .select("id,grow_id,tent_id,plant_id,note,entry_at,details")
      .eq("grow_id", growId)
      .in("details->>event_type", [
        ACTION_FOLLOWUP_EVENT_TYPE,
        ACTION_OUTCOME_EVENT_TYPE,
        RUN_LEARNING_DECISION_EVENT_TYPE,
        EPISODE_PHOTO_EVENT_TYPE,
      ])
      .order("entry_at", { ascending: false })
      .limit(EPISODE_DIARY_LIMIT);
    if (diaryError) return { status: "error", message: SANITIZED_ERROR };

    let sensorRows: EpisodeSensorRowInput[] = [];
    if (args.includeSensorEvidence) {
      const completedTimes = actions
        .map((a) => parseEpochMs(a.completed_at))
        .filter((ms): ms is number => ms !== null);
      const tentIds = [...new Set(actions.map((a) => a.tent_id).filter(Boolean))] as string[];
      if (completedTimes.length > 0 && tentIds.length > 0) {
        const fromIso = new Date(Math.min(...completedTimes) - EPISODE_BEFORE_WINDOW_MS).toISOString();
        const toIso = new Date(
          Math.max(...completedTimes) + EPISODE_FOLLOW_UP_DUE_MS + EPISODE_AFTER_WINDOW_MS,
        ).toISOString();
        // Bounded window, bounded limit, NO raw_payload in the select.
        const { data: sensorData, error: sensorError } = await supabase
          .from("sensor_readings")
          .select("id,tent_id,metric,source,quality,captured_at")
          .in("tent_id", tentIds)
          .gte("captured_at", fromIso)
          .lte("captured_at", toIso)
          .order("captured_at", { ascending: false })
          .limit(EPISODE_SENSOR_LIMIT);
        if (!sensorError) sensorRows = (sensorData ?? []) as unknown as EpisodeSensorRowInput[];
        // Sensor evidence is optional context; its absence is an honest
        // evidence_limited state, never a hard failure.
      }
    }

    const episodes = buildPlantMemoryEpisodes({
      actions,
      diaryRows: (diaryRows ?? []) as unknown as EpisodeDiaryRowInput[],
      sensorRows,
      now: args.nowIso,
    });
    return { status: "ok", episodes };
  } catch {
    return { status: "error", message: SANITIZED_ERROR };
  }
}

// ── Learning-decision persistence (idempotent; grower-initiated only) ──────

export type SaveLearningDecisionResult =
  | { ok: true; updatedExisting: boolean }
  | { ok: false; reason: string };

/**
 * Persist ONE current learning decision per action/outcome pair:
 *  - probe for existing decisions by explicit reference;
 *  - one existing row → UPDATE it (grower edit), never a silent duplicate;
 *  - multiple existing rows → refuse and report needs_review; nothing is
 *    deleted or silently chosen.
 * The insert payload omits user_id — database ownership is authoritative.
 */
export async function saveRunLearningDecision(
  draft: RunLearningDecisionDraft,
): Promise<SaveLearningDecisionResult> {
  try {
    const { data: existing, error: probeError } = await supabase
      .from("diary_entries")
      .select("id,details")
      .eq("grow_id", draft.grow_id)
      .eq("details->>event_type", RUN_LEARNING_DECISION_EVENT_TYPE)
      .eq("details->>action_queue_id", draft.details.action_queue_id)
      .limit(3);
    if (probeError) return { ok: false, reason: "save_failed" };

    if ((existing ?? []).length > 1) {
      return { ok: false, reason: "needs_review_duplicates" };
    }

    if ((existing ?? []).length === 1) {
      const { error: updateError } = await supabase
        .from("diary_entries")
        .update({ note: draft.note, details: draft.details })
        .eq("id", existing![0].id);
      if (updateError) return { ok: false, reason: "save_failed" };
      return { ok: true, updatedExisting: true };
    }

    const { error: insertError } = await supabase.from("diary_entries").insert({
      grow_id: draft.grow_id,
      tent_id: draft.tent_id,
      plant_id: draft.plant_id,
      note: draft.note,
      details: draft.details,
      // user_id deliberately omitted — DB default remains authoritative.
    });
    if (insertError) return { ok: false, reason: "save_failed" };
    return { ok: true, updatedExisting: false };
  } catch {
    return { ok: false, reason: "save_failed" };
  }
}
