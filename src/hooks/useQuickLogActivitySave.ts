/**
 * useQuickLogActivitySave — thin routing hook that maps a supported
 * QuickLogActivityId to the correct existing safe persistence path.
 *
 * Hard rules (see project knowledge):
 *   - Uses ONLY existing RPCs (`quicklog_save_manual`, `quicklog_save_event`).
 *   - No schema, RLS, Edge, or validator changes.
 *   - Harvest and unsupported ids are refused with a stable reason;
 *     no RPC call is made and no timeline event is dispatched.
 *   - `verdant:entry-created` is dispatched ONLY after confirmed success.
 *   - Defoliation persists as event_type=training with a
 *     details.subtype="defoliation" metadata fence.
 *   - Manual sensor snapshot is out of scope here — the existing manual
 *     sensor reading path (ManualSensorReadingCard) already handles it.
 */
import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  QUICK_LOG_ACTIVITY_DEFINITIONS,
  QUICK_LOG_HARVEST_DISABLED_REASON,
  type QuickLogActivityId,
} from "@/constants/quickLogActivityTypes";
import { planQuickLogPersistence } from "@/lib/quickLogActivityRules";
import {
  QUICK_LOG_V2_ENTRY_CREATED_EVENT,
  dispatchQuickLogV2EntryCreated,
} from "@/lib/quickLogV2EntryCreatedEvent";

export interface QuickLogActivitySaveInput {
  activityId: QuickLogActivityId;
  growId: string;
  tentId?: string | null;
  plantId?: string | null;
  note?: string | null;
  photoUrl?: string | null;
  /** Required for event-route dedupe. Ignored by manual route. */
  idempotencyKey?: string | null;
  /** Extra details to merge into event p_details (safe metadata only). */
  extraDetails?: Record<string, unknown> | null;
}

export type QuickLogActivitySaveReason =
  | "ok"
  | "harvest_disabled"
  | "activity_disabled"
  | "unsupported_activity"
  | "missing_idempotency_key"
  | "save_failed";

export interface QuickLogActivitySaveResult {
  ok: boolean;
  reason: QuickLogActivitySaveReason;
  disabledReason?: string;
  growEventId?: string | null;
  reused?: boolean;
}

interface EventRpcResponse {
  ok?: boolean;
  reason?: string;
  grow_event_id?: string | null;
  reused?: boolean;
}

interface ManualRpcResponse {
  ok?: boolean;
  reason?: string;
  grow_event_id?: string | null;
  environment_event_id?: string | null;
}

export function useQuickLogActivitySave() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<QuickLogActivitySaveReason | null>(null);

  const save = useCallback(
    async (
      input: QuickLogActivitySaveInput,
    ): Promise<QuickLogActivitySaveResult> => {
      const def = QUICK_LOG_ACTIVITY_DEFINITIONS[input.activityId];
      if (!def) {
        setError("unsupported_activity");
        return { ok: false, reason: "unsupported_activity" };
      }
      if (input.activityId === "harvest") {
        setError("harvest_disabled");
        return {
          ok: false,
          reason: "harvest_disabled",
          disabledReason: QUICK_LOG_HARVEST_DISABLED_REASON,
        };
      }
      if (!def.enabled) {
        setError("activity_disabled");
        return {
          ok: false,
          reason: "activity_disabled",
          disabledReason: def.disabledReason ?? "This activity is disabled.",
        };
      }
      const plan = planQuickLogPersistence(input.activityId);
      if (!plan) {
        setError("unsupported_activity");
        return { ok: false, reason: "unsupported_activity" };
      }

      setSaving(true);
      setError(null);
      try {
        if (plan.saveRoute === "manual_note" || plan.saveRoute === "manual_water") {
          const { data, error: rpcErr } = await supabase.rpc(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "quicklog_save_manual" as any,
            {
              p_grow_id: input.growId,
              p_tent_id: input.tentId ?? null,
              p_plant_id: input.plantId ?? null,
              p_action: plan.manualAction,
              p_note: input.note ?? null,
            } as unknown as Record<string, unknown>,
          );
          if (rpcErr) {
            setError("save_failed");
            return { ok: false, reason: "save_failed" };
          }
          const r = (data ?? {}) as ManualRpcResponse;
          if (!r.ok) {
            setError("save_failed");
            return { ok: false, reason: "save_failed" };
          }
          dispatchQuickLogV2EntryCreated({
            createdAt: new Date().toISOString(),
            growEventId: r.grow_event_id ?? null,
            source: "quick_log_v2",
          });
          return {
            ok: true,
            reason: "ok",
            growEventId: r.grow_event_id ?? null,
          };
        }

        if (plan.saveRoute === "event") {
          if (!input.idempotencyKey || input.idempotencyKey.length < 8) {
            setError("missing_idempotency_key");
            return { ok: false, reason: "missing_idempotency_key" };
          }
          const details: Record<string, unknown> = {
            ...(input.extraDetails ?? {}),
          };
          if (plan.detailsSubtype) details.subtype = plan.detailsSubtype;
          const { data, error: rpcErr } = await supabase.rpc(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            "quicklog_save_event" as any,
            {
              p_idempotency_key: input.idempotencyKey,
              p_grow_id: input.growId,
              p_event_type: plan.eventType,
              p_tent_id: input.tentId ?? null,
              p_plant_id: input.plantId ?? null,
              p_note: input.note ?? null,
              p_photo_url: input.photoUrl ?? null,
              p_sensor_snapshot: null,
              p_occurred_at: null,
              p_details: Object.keys(details).length > 0 ? details : null,
            } as unknown as Record<string, unknown>,
          );
          if (rpcErr) {
            setError("save_failed");
            return { ok: false, reason: "save_failed" };
          }
          const r = (data ?? {}) as EventRpcResponse;
          if (!r.ok || !r.grow_event_id) {
            setError("save_failed");
            return { ok: false, reason: "save_failed" };
          }
          dispatchQuickLogV2EntryCreated({
            createdAt: new Date().toISOString(),
            growEventId: r.grow_event_id,
            source: "quick_log_v2",
          });
          return {
            ok: true,
            reason: "ok",
            growEventId: r.grow_event_id,
            reused: r.reused === true,
          };
        }

        // manual_sensor_reading / none — not saved through this hook.
        setError("unsupported_activity");
        return { ok: false, reason: "unsupported_activity" };
      } catch {
        setError("save_failed");
        return { ok: false, reason: "save_failed" };
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { save, saving, error, ENTRY_CREATED_EVENT: QUICK_LOG_V2_ENTRY_CREATED_EVENT };
}
