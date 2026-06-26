/**
 * harvestCureQuickLogPersistencePayload — pure persistence-contract builder
 * for V0 harvest and cure_check Quick Log events.
 *
 * Pure. No I/O. No React. Deterministic. Null-safe.
 *
 * Maps validated harvest / cure_check details into the parameter shape
 * accepted by the `public.quicklog_save_event` RPC. This module is the
 * single boundary between operator-entered harvest/cure details and the
 * server-side write path.
 *
 * Hard rules:
 *  - Validation goes through `validateHarvestDetails` /
 *    `validateCureCheckDetails`. Invalid numeric fields short-circuit the
 *    build (no persistence call constructed).
 *  - Optional fields can be omitted; absence is preserved as absence.
 *  - `keeper_candidate` is operator-entered only — never inferred.
 *  - `mold_check === "concern"` produces caution context only via the
 *    rules layer. This builder NEVER constructs an alert/Action Queue
 *    write — it returns the persistence payload only.
 *  - Sensor snapshot, when attached, is passed through verbatim. The
 *    snapshot's `source` label (manual / demo / stale / invalid / etc.)
 *    is preserved exactly; this module never relabels a snapshot as
 *    "live" and never treats demo/stale/invalid as good evidence.
 *  - No AI / model imports. No hardware-actuation imports.
 */

import {
  QUICK_LOG_CURE_CHECK_EVENT_TYPE,
  QUICK_LOG_HARVEST_EVENT_TYPE,
  type QuickLogHarvestCureEventType,
} from "@/constants/quickLogEventTypes";
import {
  validateCureCheckDetails,
  validateHarvestDetails,
  type CureCheckDetailsInput,
  type CureCheckDetailsValidation,
  type HarvestDetailsInput,
  type HarvestDetailsValidation,
} from "./harvestCureRules";

/**
 * Minimal, server-shaped sensor snapshot envelope accepted by the
 * `quicklog_save_event` RPC. We never widen it here.
 */
export interface HarvestCureSensorSnapshotInput {
  /** Required by server. Preserved verbatim. */
  source: string;
  /** Required by server. ISO timestamptz string. */
  captured_at: string;
  /** Required by server. Object of numeric metrics. */
  metrics: Record<string, number>;
}

export interface HarvestCureQuickLogPersistenceInput {
  eventType: QuickLogHarvestCureEventType;
  /** Required. Server validates ownership. */
  growId: string;
  /** Required. Min length 8, max 200 — server validates. */
  idempotencyKey: string;
  tentId?: string | null;
  plantId?: string | null;
  note?: string | null;
  photoUrl?: string | null;
  /** Optional ISO timestamptz. */
  occurredAt?: string | null;
  /** Operator-entered details for the chosen event_type. */
  harvest?: HarvestDetailsInput | null;
  cureCheck?: CureCheckDetailsInput | null;
  /** Optional sensor snapshot. Pass-through, source label preserved. */
  sensorSnapshot?: HarvestCureSensorSnapshotInput | null;
}

/**
 * RPC parameter shape for `public.quicklog_save_event`. Aligned with the
 * SQL signature (text, uuid, text, uuid, uuid, text, text, jsonb,
 * timestamptz, jsonb).
 */
export interface QuickLogSaveEventRpcPayload {
  p_idempotency_key: string;
  p_grow_id: string;
  p_event_type: QuickLogHarvestCureEventType;
  p_tent_id: string | null;
  p_plant_id: string | null;
  p_note: string | null;
  p_photo_url: string | null;
  p_sensor_snapshot: HarvestCureSensorSnapshotInput | null;
  p_occurred_at: string | null;
  p_details: Record<string, unknown> | null;
}

export type HarvestCurePersistenceBuildResult =
  | {
      ok: true;
      payload: QuickLogSaveEventRpcPayload;
      validation: HarvestDetailsValidation | CureCheckDetailsValidation;
    }
  | {
      ok: false;
      reason:
        | "invalid_event_type"
        | "invalid_grow_id"
        | "invalid_idempotency_key"
        | "invalid_harvest_details"
        | "invalid_cure_check_details"
        | "invalid_sensor_snapshot";
      validation?: HarvestDetailsValidation | CureCheckDetailsValidation;
    };

function nonEmptyString(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function validateSensorSnapshot(
  s: HarvestCureSensorSnapshotInput | null | undefined,
): "ok" | "missing" | "invalid" {
  if (s === null || s === undefined) return "missing";
  if (typeof s !== "object") return "invalid";
  if (typeof s.source !== "string" || s.source.trim().length === 0) return "invalid";
  if (typeof s.captured_at !== "string" || s.captured_at.trim().length === 0) {
    return "invalid";
  }
  if (!s.metrics || typeof s.metrics !== "object") return "invalid";
  for (const k of Object.keys(s.metrics)) {
    const v = (s.metrics as Record<string, unknown>)[k];
    if (typeof v !== "number" || !Number.isFinite(v)) return "invalid";
  }
  return "ok";
}

export function buildHarvestCureQuickLogPersistencePayload(
  input: HarvestCureQuickLogPersistenceInput,
): HarvestCurePersistenceBuildResult {
  if (
    input.eventType !== QUICK_LOG_HARVEST_EVENT_TYPE &&
    input.eventType !== QUICK_LOG_CURE_CHECK_EVENT_TYPE
  ) {
    return { ok: false, reason: "invalid_event_type" };
  }
  if (typeof input.growId !== "string" || input.growId.trim().length === 0) {
    return { ok: false, reason: "invalid_grow_id" };
  }
  if (
    typeof input.idempotencyKey !== "string" ||
    input.idempotencyKey.length < 8 ||
    input.idempotencyKey.length > 200
  ) {
    return { ok: false, reason: "invalid_idempotency_key" };
  }

  const sensorState = validateSensorSnapshot(input.sensorSnapshot);
  if (sensorState === "invalid") {
    return { ok: false, reason: "invalid_sensor_snapshot" };
  }

  let validation: HarvestDetailsValidation | CureCheckDetailsValidation;
  let detailsKey: "harvest" | "cure_check";
  let detailsValue: Record<string, unknown>;

  if (input.eventType === QUICK_LOG_HARVEST_EVENT_TYPE) {
    const v = validateHarvestDetails(input.harvest ?? null);
    if (!v.ok) {
      return { ok: false, reason: "invalid_harvest_details", validation: v };
    }
    validation = v;
    detailsKey = "harvest";
    detailsValue = { ...v.value };
  } else {
    const v = validateCureCheckDetails(input.cureCheck ?? null);
    if (!v.ok) {
      return { ok: false, reason: "invalid_cure_check_details", validation: v };
    }
    validation = v;
    detailsKey = "cure_check";
    detailsValue = { ...v.value };
  }

  const detailsEnvelope: Record<string, unknown> | null =
    Object.keys(detailsValue).length > 0 ? { [detailsKey]: detailsValue } : null;

  return {
    ok: true,
    payload: {
      p_idempotency_key: input.idempotencyKey,
      p_grow_id: input.growId,
      p_event_type: input.eventType,
      p_tent_id: nonEmptyString(input.tentId),
      p_plant_id: nonEmptyString(input.plantId),
      p_note: nonEmptyString(input.note),
      p_photo_url: nonEmptyString(input.photoUrl),
      p_sensor_snapshot:
        sensorState === "ok" ? (input.sensorSnapshot as HarvestCureSensorSnapshotInput) : null,
      p_occurred_at: nonEmptyString(input.occurredAt),
      p_details: detailsEnvelope,
    },
    validation,
  };
}
