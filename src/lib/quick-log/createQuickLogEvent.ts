/**
 * Quick Log event creator — Gate 1 of the Verdant V0 operating loop.
 *
 * Hard rules:
 *   - All business logic lives here, not in JSX.
 *   - Atomic save via SECURITY DEFINER RPC `public.quicklog_save_event`.
 *     Ownership of grow/tent/plant is enforced server-side from auth.uid().
 *   - Sensor snapshot provenance (`source`, `captured_at`) is preserved as-is;
 *     unknown / stale sources are never relabeled as "live".
 *   - Empty / non-finite sensor data is never embedded as a fake snapshot.
 *   - Idempotency: duplicate saves with the same (user, key) return the
 *     original grow_event_id; no second row is written.
 */
import { supabase } from "@/integrations/supabase/client";
import { validateQuickLogSensorSnapshot } from "./quickLogSensorSnapshotValidation";
import { fetchLatestSensorSnapshot } from "./fetchLatestSensorSnapshot";

export type QuickLogEventType = "observe" | "water" | "feed" | "photo" | "note";

export interface CreateQuickLogInput {
  growId: string;
  tentId?: string;
  plantId?: string;
  eventType: QuickLogEventType;
  note?: string;
  photoUrl?: string;
  /** Required for dedupe. Generate once per save attempt (reuse on retry). */
  idempotencyKey: string;
}

/**
 * Deterministic mapping from UI event types → canonical grow_events values.
 *
 * Note about `note`: the V0 grow_events validate trigger only accepts
 * ('watering','feeding','training','observation','photo','environment').
 * Quick Log "note" entries are therefore stored as `observation` and the
 * original intent is preserved in the companion diary row's
 * `details.kind = 'note'` (see buildQuickLogDetails). The user's note
 * text is preserved verbatim on grow_events.note and diary_entries.note.
 */
export const QUICK_LOG_EVENT_TYPE_MAP: Record<QuickLogEventType, string> = {
  observe: "observation",
  water: "watering",
  feed: "feeding",
  photo: "photo",
  note: "observation",
};

/** Quick Log UI event types that are stored as observations + kind tag. */
export const QUICK_LOG_NOTE_LIKE_TYPES: ReadonlySet<QuickLogEventType> =
  new Set(["note"]);

/** Build the optional `p_details` payload, or null when no tag is needed. */
export function buildQuickLogDetails(
  uiEventType: QuickLogEventType,
): Record<string, string> | null {
  if (QUICK_LOG_NOTE_LIKE_TYPES.has(uiEventType)) {
    return { kind: "note", original_event_type: uiEventType };
  }
  return null;
}

export interface QuickLogSensorSnapshot {
  source: string | null;
  captured_at: string | null;
  metrics: Record<string, number>;
}

export interface QuickLogSaveResult {
  id: string;
  reused: boolean;
}

export async function createQuickLogEvent(
  input: CreateQuickLogInput,
): Promise<QuickLogSaveResult> {
  const canonicalType = QUICK_LOG_EVENT_TYPE_MAP[input.eventType];
  if (!canonicalType) {
    throw new Error(`Unknown quick log event type: ${String(input.eventType)}`);
  }
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
    throw new Error("Failed to save quick log: missing idempotency key");
  }

  // Best-effort sensor snapshot. Absence is a real signal — never faked.
  const rawSnapshot = input.tentId
    ? await fetchLatestSensorSnapshot(input.tentId)
    : null;

  const snapshotValidation = validateQuickLogSensorSnapshot(rawSnapshot);
  if (snapshotValidation.ok === false) {
    throw new Error(
      `Failed to save quick log: invalid sensor snapshot (${snapshotValidation.error})`,
    );
  }
  const sensorSnapshot = snapshotValidation.snapshot;

  const { data, error } = await supabase.rpc(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    "quicklog_save_event" as any,
    {
      p_idempotency_key: input.idempotencyKey,
      p_grow_id: input.growId,
      p_event_type: canonicalType,
      p_tent_id: input.tentId ?? null,
      p_plant_id: input.plantId ?? null,
      p_note: input.note ?? null,
      p_photo_url: input.photoUrl ?? null,
      p_sensor_snapshot: sensorSnapshot
        ? {
            source: sensorSnapshot.source,
            captured_at: sensorSnapshot.captured_at,
            metrics: sensorSnapshot.metrics,
          }
        : null,
      p_occurred_at: null,
    } as unknown as Record<string, unknown>,
  );

  if (error) {
    throw new Error(`Failed to save quick log: ${error.message}`);
  }
  const r = (data ?? {}) as {
    ok?: boolean;
    reason?: string;
    grow_event_id?: string;
    reused?: boolean;
  };
  if (!r.ok || !r.grow_event_id) {
    const reason = r.reason || "unknown_error";
    if (reason === "not_authenticated") throw new Error("Not authenticated");
    if (reason === "grow_not_owned") {
      throw new Error("Grow not found or not owned by current user");
    }
    if (reason === "plant_not_in_grow") {
      throw new Error("Plant does not belong to this grow");
    }
    if (reason === "plant_not_in_tent") {
      throw new Error("Plant does not belong to this tent");
    }
    if (reason === "tent_not_in_grow") {
      throw new Error("Tent does not belong to this grow");
    }
    throw new Error(`Failed to save quick log: ${reason}`);
  }
  return { id: r.grow_event_id, reused: r.reused === true };
}
