/**
 * Quick Log event creator — Gate 1 of the Verdant V0 operating loop.
 *
 * Hard rules:
 *   - All business logic lives here, not in JSX.
 *   - Auth + grow ownership + plant-context validation BEFORE any write.
 *   - Sensor snapshot provenance (`source`, `captured_at`) is preserved as-is;
 *     unknown / stale sources are never relabeled as "live".
 *   - Empty / non-finite sensor data is never embedded as a fake snapshot.
 *   - grow_events + diary_entries are written in two steps because the
 *     PostgREST client cannot wrap them in a single transaction. If the
 *     second write fails we compensate by deleting the orphan grow_event
 *     so a partial save is never reported as success.
 *
 * TODO(quick-log-rpc): Replace the two-step write with a SECURITY DEFINER
 *   RPC modeled after `public.quicklog_save_manual` so the whole save is
 *   atomic server-side and we can drop the compensation delete.
 */
import { supabase } from "@/integrations/supabase/client";
import { validateQuickLogSensorSnapshot } from "./quickLogSensorSnapshotValidation";

export type QuickLogEventType = "observe" | "water" | "feed" | "photo" | "note";

export interface CreateQuickLogInput {
  growId: string;
  tentId?: string;
  plantId?: string;
  eventType: QuickLogEventType;
  note?: string;
  photoUrl?: string;
}

/** Deterministic mapping from UI event types → canonical grow_events values. */
export const QUICK_LOG_EVENT_TYPE_MAP: Record<QuickLogEventType, string> = {
  observe: "observation",
  water: "watering",
  feed: "feeding",
  photo: "photo",
  note: "note",
};

export interface QuickLogSensorSnapshot {
  /** Verbatim source string from the most recent reading. Never coerced to "live". */
  source: string | null;
  /** ISO timestamp of the most recent contributing reading. */
  captured_at: string | null;
  /** Metric → finite numeric value. Empty object means "no usable readings". */
  metrics: Record<string, number>;
}

async function fetchLatestSensorSnapshot(
  tentId: string,
): Promise<QuickLogSensorSnapshot | null> {
  const { data: rows, error } = await supabase
    .from("sensor_readings")
    .select("metric, value, source, captured_at")
    .eq("tent_id", tentId)
    .order("captured_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !rows || rows.length === 0) return null;

  const seen = new Set<string>();
  const metrics: Record<string, number> = {};
  for (const row of rows) {
    if (!row?.metric || seen.has(row.metric)) continue;
    const n = typeof row.value === "number" ? row.value : Number(row.value);
    if (!Number.isFinite(n)) continue;
    seen.add(row.metric);
    metrics[row.metric] = n;
  }

  if (Object.keys(metrics).length === 0) return null;

  const mostRecent = rows[0];
  return {
    source: typeof mostRecent.source === "string" ? mostRecent.source : null,
    captured_at:
      typeof mostRecent.captured_at === "string" ? mostRecent.captured_at : null,
    metrics,
  };
}

export async function createQuickLogEvent(input: CreateQuickLogInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const canonicalType = QUICK_LOG_EVENT_TYPE_MAP[input.eventType];
  if (!canonicalType) {
    throw new Error(`Unknown quick log event type: ${String(input.eventType)}`);
  }

  // 1. Grow ownership.
  const { data: grow, error: growError } = await supabase
    .from("grows")
    .select("id")
    .eq("id", input.growId)
    .eq("user_id", user.id)
    .single();
  if (growError || !grow) {
    throw new Error("Grow not found or not owned by current user");
  }

  // 2. Plant context: must belong to the same grow, and to the provided tent
  //    when one is supplied. Prevents cross-grow / cross-tent linkage.
  if (input.plantId) {
    const { data: plant, error: plantError } = await supabase
      .from("plants")
      .select("id, grow_id, tent_id")
      .eq("id", input.plantId)
      .eq("user_id", user.id)
      .single();
    if (plantError || !plant) {
      throw new Error("Plant not found or not owned by current user");
    }
    if (plant.grow_id !== input.growId) {
      throw new Error("Plant does not belong to this grow");
    }
    if (input.tentId && plant.tent_id && plant.tent_id !== input.tentId) {
      throw new Error("Plant does not belong to this tent");
    }
  }

  // 3. Best-effort sensor snapshot. Absence is a real signal — never faked.
  const sensorSnapshot = input.tentId
    ? await fetchLatestSensorSnapshot(input.tentId)
    : null;

  // 4. Primary write: grow_events.
  const { data: eventRow, error: eventError } = await supabase
    .from("grow_events")
    .insert({
      user_id: user.id,
      grow_id: input.growId,
      tent_id: input.tentId ?? null,
      plant_id: input.plantId ?? null,
      event_type: canonicalType,
      source: "manual",
      occurred_at: new Date().toISOString(),
      note: input.note ?? null,
    })
    .select()
    .single();
  if (eventError || !eventRow) {
    throw new Error(
      `Failed to save quick log: ${eventError?.message ?? "unknown error"}`,
    );
  }

  // 5. Optional companion diary_entries row carrying structured details.
  const hasSnapshot =
    !!sensorSnapshot && Object.keys(sensorSnapshot.metrics).length > 0;
  const needsDiary = hasSnapshot || !!input.photoUrl;
  if (needsDiary) {
    const details = {
      sensor_snapshot: hasSnapshot
        ? {
            source: sensorSnapshot!.source,
            captured_at: sensorSnapshot!.captured_at,
            metrics: sensorSnapshot!.metrics,
          }
        : null,
      photo_url: input.photoUrl ?? null,
      quick_log_version: 1,
      linked_grow_event_id: eventRow.id,
    };

    const { error: diaryError } = await supabase
      .from("diary_entries")
      .insert({
        user_id: user.id,
        grow_id: input.growId,
        tent_id: input.tentId ?? null,
        plant_id: input.plantId ?? null,
        note: input.note?.trim() || "(quick log)",
        entry_at: new Date().toISOString(),
        details: details as never,
      });

    if (diaryError) {
      // Compensate: roll back the orphan grow_event. See TODO(quick-log-rpc).
      try {
        await supabase
          .from("grow_events")
          .delete()
          .eq("id", eventRow.id)
          .eq("user_id", user.id);
      } catch (cleanupErr) {
        // eslint-disable-next-line no-console
        console.error("QuickLog rollback failed:", cleanupErr);
      }
      throw new Error(
        `Failed to save quick log details: ${diaryError.message}`,
      );
    }
  }

  return eventRow;
}
