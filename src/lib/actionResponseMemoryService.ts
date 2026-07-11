/**
 * actionResponseMemoryService — owner-scoped, READ-ONLY loader for canonical
 * Action Response Memories (Milestone 5).
 *
 * Allowed data operation: SELECT. This module performs no INSERT, no UPDATE,
 * no DELETE, no upsert, no RPC, no storage access, no Edge invocation, and
 * no AI calls. It never selects payload blobs, secrets, tokens, or private
 * environment values, and never accepts a client-provided owner id — owner
 * scoping is the authenticated client's RLS plus explicit grow/plant filters.
 *
 * Query shape is CONSTANT (no per-card N+1):
 *   1. one bounded diary_entries read (grow-scoped, optionally plant-scoped);
 *   2. one batched action_queue read for the referenced action ids;
 *   3. at most one batched sensor_readings read for referenced snapshot ids.
 * All joins/validation/dedup happen in the pure rules module.
 */

import { supabase as defaultSupabase } from "@/integrations/supabase/client";
import { ACTION_FOLLOWUP_EVENT_TYPE } from "@/lib/actionFollowupRules";
import {
  buildActionResponseMemories,
  collectActionResponseCandidateRows,
  type ActionResponseActionRowInput,
  type ActionResponseDiaryRowInput,
  type ActionResponseMemory,
  type ActionResponseSensorRowInput,
} from "@/lib/actionResponseMemoryRules";

export type AuthenticatedSupabaseClient = typeof defaultSupabase;

export interface ActionResponseMemoryServiceDeps {
  supabase?: AuthenticatedSupabaseClient;
}

/** Bounded reads — never full-table fetches. */
export const RESPONSE_ROW_LIMIT = 150;
export const RESPONSE_ACTION_BATCH_LIMIT = 60;
export const RESPONSE_SENSOR_BATCH_LIMIT = 60;

export interface LoadActionResponseMemoriesArgs {
  readonly growId: string;
  readonly plantId?: string | null;
}

export type ActionResponseMemoryLoadResult =
  | { status: "ok"; memories: ActionResponseMemory[] }
  | { status: "failed"; reason: "query_failed" };

const FAILED: ActionResponseMemoryLoadResult = {
  status: "failed",
  reason: "query_failed",
};

export async function loadActionResponseMemories(
  args: LoadActionResponseMemoriesArgs,
  deps?: ActionResponseMemoryServiceDeps,
): Promise<ActionResponseMemoryLoadResult> {
  const client = deps?.supabase ?? defaultSupabase;
  if (!args.growId) return { status: "ok", memories: [] };

  try {
    // 1) Grower response rows for this grow (optionally exact plant).
    let diaryQuery = client
      .from("diary_entries")
      .select("id,grow_id,tent_id,plant_id,entry_at,details")
      .eq("grow_id", args.growId)
      .contains("details", { event_type: ACTION_FOLLOWUP_EVENT_TYPE })
      .order("entry_at", { ascending: false })
      .limit(RESPONSE_ROW_LIMIT);
    if (args.plantId) diaryQuery = diaryQuery.eq("plant_id", args.plantId);
    const { data: diaryData, error: diaryError } = await diaryQuery;
    if (diaryError) return FAILED;

    const rows = (diaryData ?? []) as unknown as ActionResponseDiaryRowInput[];
    const candidates = collectActionResponseCandidateRows(rows);
    if (candidates.length === 0) return { status: "ok", memories: [] };

    // 2) One batched action lookup for every referenced action id.
    const actionIds = [
      ...new Set(
        candidates
          .map((r) => r.details?.action_queue_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ].slice(0, RESPONSE_ACTION_BATCH_LIMIT);
    const { data: actionData, error: actionError } = await client
      .from("action_queue")
      .select("id,grow_id,tent_id,plant_id,status,suggested_change,completed_at")
      .in("id", actionIds);
    if (actionError) return FAILED;
    const actions = (actionData ?? []) as unknown as ActionResponseActionRowInput[];

    // 3) At most one batched sensor lookup for referenced snapshot ids.
    //    Selection lists explicit columns only — payload blobs never enter
    //    this feature. A failed sensor lookup degrades to "unavailable"
    //    evidence without erasing outcomes or notes.
    const snapshotIds = [
      ...new Set(
        candidates
          .map((r) => r.details?.sensor_snapshot_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0),
      ),
    ].slice(0, RESPONSE_SENSOR_BATCH_LIMIT);
    let sensorRows: ActionResponseSensorRowInput[] | undefined = [];
    if (snapshotIds.length > 0) {
      const { data: sensorData, error: sensorError } = await client
        .from("sensor_readings")
        .select("id,tent_id,source,captured_at")
        .in("id", snapshotIds);
      sensorRows = sensorError
        ? undefined
        : ((sensorData ?? []) as unknown as ActionResponseSensorRowInput[]);
    }

    return {
      status: "ok",
      memories: buildActionResponseMemories({
        responseRows: candidates,
        actions,
        sensorRows,
      }),
    };
  } catch {
    // Sanitized failure — no provider error text leaves this module.
    return FAILED;
  }
}
