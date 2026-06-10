/**
 * Minimal Quick Log event creator — Gate 1 of the Verdant V0 operating loop.
 *
 * A grower must be able to open Verdant, select or auto-detect Tent + Plant
 * context, capture what just happened, pull the latest sensor snapshot for that
 * tent, and complete the log in under 30 seconds.
 *
 * Hard rules:
 *   - Business logic lives here, NOT in .tsx files.
 *   - grow_events is the primary table; diary_entries holds structured details
 *     because grow_events does not have a details jsonb column.
 *   - Ownership is validated server-side via RLS AND client-side before write.
 *   - Sensor snapshot is pulled from the EAV-style sensor_readings table.
 */
import { supabase } from "@/integrations/supabase/client";

export type QuickLogEventType = "observe" | "water" | "feed" | "photo" | "note";

export interface CreateQuickLogInput {
  growId: string;
  tentId?: string;
  plantId?: string;
  eventType: QuickLogEventType;
  note?: string;
  photoUrl?: string;
}

/** Maps user-facing event types to canonical grow_events.event_type values. */
const EVENT_TYPE_MAP: Record<QuickLogEventType, string> = {
  observe: "observation",
  water: "watering",
  feed: "feeding",
  photo: "photo",
  note: "note",
};

/**
 * Pull the latest sensor readings for a tent.
 *
 * sensor_readings is stored EAV-style (one row per metric), so we query the
 * most recent rows and pivot by metric, taking the first occurrence of each.
 */
async function fetchLatestSensorSnapshot(tentId: string) {
  const { data: rows, error } = await supabase
    .from("sensor_readings")
    .select("metric, value, source, captured_at")
    .eq("tent_id", tentId)
    .order("captured_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !rows || rows.length === 0) return null;

  const seen = new Set<string>();
  const snapshot: Record<string, unknown> = {};

  for (const row of rows) {
    if (!seen.has(row.metric)) {
      seen.add(row.metric);
      snapshot[row.metric] = row.value;
    }
  }

  const mostRecent = rows[0];
  return {
    ...snapshot,
    source: mostRecent.source,
    captured_at: mostRecent.captured_at,
  };
}

/**
 * Create a Quick Log event.
 *
 * Steps:
 * 1. Authenticate user.
 * 2. Verify grow ownership.
 * 3. Pull latest sensor snapshot for the tent (if provided).
 * 4. Insert primary record into grow_events.
 * 5. If sensor snapshot or photo is present, insert structured details into
 *    diary_entries (grow_events does not have a details column).
 */
export async function createQuickLogEvent(input: CreateQuickLogInput) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Ownership check: verify the grow belongs to this user.
  const { data: grow, error: growError } = await supabase
    .from("grows")
    .select("id")
    .eq("id", input.growId)
    .eq("user_id", user.id)
    .single();

  if (growError || !grow) {
    throw new Error("Grow not found or not owned by current user");
  }

  // Pull latest sensor snapshot if tent is provided.
  let sensorSnapshot: Record<string, unknown> | null = null;
  if (input.tentId) {
    sensorSnapshot = await fetchLatestSensorSnapshot(input.tentId);
  }

  const canonicalType = EVENT_TYPE_MAP[input.eventType] ?? input.eventType;

  const { data, error } = await supabase
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

  if (error) throw error;

  // Structured details (sensor snapshot + photo) are stored in diary_entries
  // because grow_events does not have a details jsonb column.
  if (sensorSnapshot || input.photoUrl) {
    const { error: diaryError } = await supabase
      .from("diary_entries")
      .insert({
        user_id: user.id,
        grow_id: input.growId,
        tent_id: input.tentId ?? null,
        plant_id: input.plantId ?? null,
        note: input.note?.trim() || "(quick log)",
        entry_at: new Date().toISOString(),
      details: {
        sensor_snapshot: sensorSnapshot,
        photo_url: input.photoUrl ?? null,
        quick_log_version: 1,
        linked_grow_event_id: data?.id,
      } as never,
      });
    if (diaryError) {
      // Non-fatal: the grow_event is the primary record.
      // eslint-disable-next-line no-console
      console.error("QuickLog diary entry creation failed:", diaryError);
    }
  }

  return data;
}
