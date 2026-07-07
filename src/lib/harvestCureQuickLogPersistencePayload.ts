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
import { normalizeHarvestWeightToGrams } from "./harvestWeightUnitNormalization";
import {
  QUICK_LOG_WEIGHT_UNITS,
  type QuickLogWeightUnit,
} from "@/constants/quickLogActivityTypes";

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

/**
 * Slice A3.1 — Vocab A (grower-entered value + unit) input on the harvest
 * persistence boundary. Optional. When present, the builder canonicalizes
 * to grams via `normalizeHarvestWeightToGrams` and stamps the ORIGINAL
 * value + unit into `details.harvest` (jsonb passthrough — additive, no
 * schema change) so the timeline can display "2 lb (907.18 g)".
 *
 * If Vocab A input is present but invalid (non-numeric / negative /
 * unknown unit), the builder rejects with `invalid_harvest_details`
 * rather than silently persisting the numeric value as grams.
 */
export interface HarvestVocabAInput {
  /** Grower-entered wet weight text (e.g. "2", "12.5"). */
  wet_weight_input?: string | number | null;
  /** Grower-entered dry weight text. */
  dry_weight_input?: string | number | null;
  /** Grower-selected unit for the two values above. */
  weight_unit?: string | null;
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
  /**
   * Operator-entered details for the chosen event_type. Extends
   * `HarvestDetailsInput` with the optional Vocab A fields so a single
   * `harvest` object can carry either grams-numeric input (legacy) or
   * value+unit input (Slice A3.1) — never both meaningfully for the same
   * weight, since Vocab A takes precedence when present.
   */
  harvest?: (HarvestDetailsInput & HarvestVocabAInput) | null;
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

function isVocabAWeightPresent(v: string | number | null | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "number") return Number.isFinite(v);
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Slice A3.1 — merge Vocab A (value+unit) into Vocab B (grams) on the
 * harvest details input, returning both the grams-shaped input the
 * validator expects AND a bag of `original_*` passthrough keys to stamp
 * into `details.harvest`. Never mutates the caller's object.
 *
 *  - Absent Vocab A input → pass through unchanged.
 *  - Vocab A input present but invalid (non-numeric / negative /
 *    unknown unit) → return an error validation so the RPC boundary
 *    rejects rather than silently persisting the numeric value as grams.
 *  - Vocab A input present and valid → set `wet_weight_grams`/
 *    `dry_weight_grams` to canonical grams and expose originals.
 *  - When both Vocab A weight input AND numeric grams are provided for
 *    the same side, Vocab A wins (single source of truth). Callers must
 *    not mix them for the same weight.
 */
function applyHarvestVocabAConversion(
  raw: (HarvestDetailsInput & HarvestVocabAInput) | null | undefined,
): {
  harvest: HarvestDetailsInput;
  originals: Record<string, unknown>;
  error?: HarvestDetailsValidation;
} {
  if (!raw) return { harvest: {} as HarvestDetailsInput, originals: {} };
  const {
    wet_weight_input,
    dry_weight_input,
    weight_unit,
    ...rest
  } = raw as HarvestDetailsInput & HarvestVocabAInput;

  const hasWet = isVocabAWeightPresent(wet_weight_input);
  const hasDry = isVocabAWeightPresent(dry_weight_input);
  const hasUnit =
    typeof weight_unit === "string" &&
    (QUICK_LOG_WEIGHT_UNITS as readonly string[]).includes(weight_unit.trim());

  // No Vocab A input at all → passthrough. This preserves 100% of the
  // legacy grams-only behavior for existing callers.
  if (!hasWet && !hasDry) return { harvest: { ...rest }, originals: {} };

  // Vocab A weight given but no valid unit → reject at the boundary.
  if (!hasUnit) {
    return {
      harvest: {} as HarvestDetailsInput,
      originals: {},
      error: {
        ok: false,
        errors: {
          ...(hasWet ? { wet_weight_grams: "invalid_number" as const } : {}),
          ...(hasDry ? { dry_weight_grams: "invalid_number" as const } : {}),
        },
        value: {},
      },
    };
  }

  const unit = (weight_unit as string).trim() as QuickLogWeightUnit;
  const harvest: HarvestDetailsInput = { ...rest };
  const originals: Record<string, unknown> = { original_weight_unit: unit };

  if (hasWet) {
    const n = normalizeHarvestWeightToGrams({ value: wet_weight_input!, unit });
    if (!n) {
      return {
        harvest: {} as HarvestDetailsInput,
        originals: {},
        error: {
          ok: false,
          errors: { wet_weight_grams: "invalid_number" as const },
          value: {},
        },
      };
    }
    harvest.wet_weight_grams = n.grams;
    originals.original_wet_weight = n.originalValue;
  }
  if (hasDry) {
    const n = normalizeHarvestWeightToGrams({ value: dry_weight_input!, unit });
    if (!n) {
      return {
        harvest: {} as HarvestDetailsInput,
        originals: {},
        error: {
          ok: false,
          errors: { dry_weight_grams: "invalid_number" as const },
          value: {},
        },
      };
    }
    harvest.dry_weight_grams = n.grams;
    originals.original_dry_weight = n.originalValue;
  }

  return { harvest, originals };
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
    // Slice A3.1 — Vocab A → Vocab B conversion at the RPC boundary.
    // If the caller passed grower-entered value+unit, canonicalize to
    // grams via the single-source-of-truth helper BEFORE validation, so
    // an "oz"/"lb"/"kg" entry never lands in `wet_weight_grams` as a
    // raw number. Non-empty invalid input is rejected — never coerced.
    const vocabAResult = applyHarvestVocabAConversion(input.harvest);
    if (vocabAResult.error) {
      return {
        ok: false,
        reason: "invalid_harvest_details",
        validation: vocabAResult.error,
      };
    }
    const v = validateHarvestDetails(vocabAResult.harvest);
    if (!v.ok) {
      return { ok: false, reason: "invalid_harvest_details", validation: v };
    }
    validation = v;
    detailsKey = "harvest";
    // Stamp original value+unit alongside canonical grams. jsonb keys
    // are additive; no schema change. Timeline view-model consumes them
    // to display "2 lb (907.18 g)" honestly.
    detailsValue = { ...v.value, ...vocabAResult.originals };
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
