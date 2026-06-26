/**
 * cureSpaceSetupRules — pure validation + cautious display copy for the
 * V0 `cure_space_setup` Quick Log event detail.
 *
 * Pure. No I/O. No React. Deterministic. Null-safe.
 *
 * Hard rules:
 *  - All fields optional. Absence is preserved as absence.
 *  - Numeric bounds reject negative / out-of-range values, but this
 *    module emits NO alerts, NO Action Queue items, NO device commands.
 *  - Setup measurements are operator-entered context. They never count
 *    as a "live" sensor snapshot unless a labeled snapshot source is
 *    attached at a higher layer (the snapshot source label is not
 *    inferred here).
 *  - This module performs NO vent-sizing calculation and NO stack-effect
 *    scoring. Numeric fields are stored verbatim for grow memory only.
 */

import {
  CURE_BAG_ARRANGEMENTS,
  CURE_BAG_SIZE_TYPES,
  CURE_BUFFERING_METHODS,
  CURE_SPACE_BAG_COUNT_MAX,
  CURE_SPACE_BUFFER_RH_MAX,
  CURE_SPACE_BUFFER_RH_MIN,
  CURE_SPACE_DELTA_T_MAX_C,
  CURE_SPACE_DELTA_T_MIN_C,
  CURE_SPACE_FLOOR_PCT_MAX,
  CURE_SPACE_FLOOR_PCT_MIN,
  CURE_SPACE_OPEN_AREA_MAX_CM2,
  CURE_SPACE_PACKS_PER_BAG_MAX,
  CURE_SPACE_SETUP_HIGH_FLOOR_USE_NOTE,
  CURE_SPACE_SETUP_MISSING_SOURCE_NOTE,
  CURE_SPACE_SETUP_RECORDED_NOTE,
  CURE_SPACE_SETUP_STRONG_VENTILATION_NOTE,
  CURE_SPACE_SETUP_TIGHT_ARRANGEMENT_NOTE,
  CURE_SPACE_TEMP_MAX_C,
  CURE_SPACE_TEMP_MIN_C,
  CURE_SPACE_VOLUME_MAX_M3,
  CURE_VENTILATION_METHODS,
  type CureBagArrangement,
  type CureBagSizeType,
  type CureBufferingMethod,
  type CureVentilationMethod,
} from "@/constants/cureSpaceSetupFields";

export type CureSpaceFieldError =
  | "invalid_number"
  | "negative_not_allowed"
  | "invalid_range"
  | "invalid_integer"
  | "invalid_date";

export interface CureSpaceSetupDetailsInput {
  tent_or_space_label?: string | null;
  usable_curing_volume_m3?: number | string | null;
  floor_space_used_percent?: number | string | null;
  bag_count?: number | string | null;
  bag_size_type?: string | null;
  bag_arrangement?: string | null;
  intake_effective_area_cm2?: number | string | null;
  exhaust_effective_area_cm2?: number | string | null;
  total_effective_open_area_cm2?: number | string | null;
  mesh_filter_present?: boolean | string | null;
  ventilation_method?: string | null;
  bottom_sensor_temp_c?: number | string | null;
  top_sensor_temp_c?: number | string | null;
  stack_delta_t_c?: number | string | null;
  buffering_method?: string | null;
  buffer_pack_rh?: number | string | null;
  packs_per_bag?: number | string | null;
  buffer_install_date?: string | null;
  setup_note?: string | null;
  /**
   * Optional caller-supplied sensor snapshot source label
   * (live/manual/csv/demo/stale/invalid). Preserved verbatim if a known
   * value; otherwise dropped. This module does NOT infer it.
   */
  sensor_snapshot_source?: string | null;
}

export interface CureSpaceSetupDetailsValidation {
  ok: boolean;
  errors: Partial<Record<keyof CureSpaceSetupDetailsInput, CureSpaceFieldError>>;
  value: {
    tent_or_space_label?: string;
    usable_curing_volume_m3?: number;
    floor_space_used_percent?: number;
    bag_count?: number;
    bag_size_type?: CureBagSizeType;
    bag_arrangement?: CureBagArrangement;
    intake_effective_area_cm2?: number;
    exhaust_effective_area_cm2?: number;
    total_effective_open_area_cm2?: number;
    mesh_filter_present?: boolean;
    ventilation_method?: CureVentilationMethod;
    bottom_sensor_temp_c?: number;
    top_sensor_temp_c?: number;
    stack_delta_t_c?: number;
    buffering_method?: CureBufferingMethod;
    buffer_pack_rh?: number;
    packs_per_bag?: number;
    buffer_install_date?: string;
    setup_note?: string;
    sensor_snapshot_source?:
      | "live"
      | "manual"
      | "csv"
      | "demo"
      | "stale"
      | "invalid";
  };
}

const SENSOR_SOURCES = [
  "live",
  "manual",
  "csv",
  "demo",
  "stale",
  "invalid",
] as const;
type SensorSource = (typeof SENSOR_SOURCES)[number];

function trimOrUndef(v: string | null | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

function enumOrUndef<T extends string>(
  v: string | null | undefined,
  allowed: readonly T[],
): T | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  return (allowed as readonly string[]).includes(t) ? (t as T) : undefined;
}

interface NumOk { ok: true; value: number | undefined; error?: undefined }
interface NumErr { ok: false; value?: undefined; error: CureSpaceFieldError }
type NumResult = NumOk | NumErr;

function coerceNumber(v: number | string | null | undefined): NumResult {
  if (v === null || v === undefined || v === "") return { ok: true, value: undefined };
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return { ok: false, error: "invalid_number" };
  return { ok: true, value: n };
}

function coerceBoolean(v: boolean | string | null | undefined): boolean | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "boolean") return v;
  const t = v.trim().toLowerCase();
  if (["true", "yes", "1"].includes(t)) return true;
  if (["false", "no", "0"].includes(t)) return false;
  return undefined;
}

function validateNonNegBounded(
  field: keyof CureSpaceSetupDetailsInput,
  raw: number | string | null | undefined,
  max: number,
  errors: CureSpaceSetupDetailsValidation["errors"],
  value: CureSpaceSetupDetailsValidation["value"],
  asInteger = false,
) {
  const c = coerceNumber(raw);
  if (!c.ok) {
    errors[field] = c.error;
    return;
  }
  if (c.value === undefined) return;
  if (c.value < 0) {
    errors[field] = "negative_not_allowed";
    return;
  }
  if (asInteger && !Number.isInteger(c.value)) {
    errors[field] = "invalid_integer";
    return;
  }
  if (c.value > max) {
    errors[field] = "invalid_range";
    return;
  }
  (value as Record<string, number>)[field as string] = c.value;
}

function validateBoundedTemp(
  field: keyof CureSpaceSetupDetailsInput,
  raw: number | string | null | undefined,
  min: number,
  max: number,
  errors: CureSpaceSetupDetailsValidation["errors"],
  value: CureSpaceSetupDetailsValidation["value"],
) {
  const c = coerceNumber(raw);
  if (!c.ok) {
    errors[field] = c.error;
    return;
  }
  if (c.value === undefined) return;
  if (c.value < min || c.value > max) {
    errors[field] = "invalid_range";
    return;
  }
  (value as Record<string, number>)[field as string] = c.value;
}

function isValidIsoDate(s: string): boolean {
  // Accept YYYY-MM-DD or full ISO; reject anything Date.parse can't handle.
  const t = Date.parse(s);
  return Number.isFinite(t);
}

export function validateCureSpaceSetupDetails(
  input: CureSpaceSetupDetailsInput | null | undefined,
): CureSpaceSetupDetailsValidation {
  const errors: CureSpaceSetupDetailsValidation["errors"] = {};
  const value: CureSpaceSetupDetailsValidation["value"] = {};
  const i = input ?? {};

  const label = trimOrUndef(i.tent_or_space_label);
  if (label) value.tent_or_space_label = label;
  const note = trimOrUndef(i.setup_note);
  if (note) value.setup_note = note;

  const bagSize = enumOrUndef(i.bag_size_type, CURE_BAG_SIZE_TYPES);
  if (bagSize) value.bag_size_type = bagSize;
  const bagArr = enumOrUndef(i.bag_arrangement, CURE_BAG_ARRANGEMENTS);
  if (bagArr) value.bag_arrangement = bagArr;
  const vent = enumOrUndef(i.ventilation_method, CURE_VENTILATION_METHODS);
  if (vent) value.ventilation_method = vent;
  const buf = enumOrUndef(i.buffering_method, CURE_BUFFERING_METHODS);
  if (buf) value.buffering_method = buf;

  const mesh = coerceBoolean(i.mesh_filter_present);
  if (mesh !== undefined) value.mesh_filter_present = mesh;

  validateNonNegBounded("usable_curing_volume_m3", i.usable_curing_volume_m3, CURE_SPACE_VOLUME_MAX_M3, errors, value);
  validateNonNegBounded("bag_count", i.bag_count, CURE_SPACE_BAG_COUNT_MAX, errors, value, true);
  validateNonNegBounded("packs_per_bag", i.packs_per_bag, CURE_SPACE_PACKS_PER_BAG_MAX, errors, value, true);
  validateNonNegBounded("intake_effective_area_cm2", i.intake_effective_area_cm2, CURE_SPACE_OPEN_AREA_MAX_CM2, errors, value);
  validateNonNegBounded("exhaust_effective_area_cm2", i.exhaust_effective_area_cm2, CURE_SPACE_OPEN_AREA_MAX_CM2, errors, value);
  validateNonNegBounded("total_effective_open_area_cm2", i.total_effective_open_area_cm2, CURE_SPACE_OPEN_AREA_MAX_CM2, errors, value);

  // Floor pct: bounded 0..100
  {
    const c = coerceNumber(i.floor_space_used_percent);
    if (!c.ok) errors.floor_space_used_percent = c.error;
    else if (c.value !== undefined) {
      if (c.value < CURE_SPACE_FLOOR_PCT_MIN || c.value > CURE_SPACE_FLOOR_PCT_MAX) {
        errors.floor_space_used_percent = "invalid_range";
      } else value.floor_space_used_percent = c.value;
    }
  }

  // Buffer RH: bounded 0..100
  {
    const c = coerceNumber(i.buffer_pack_rh);
    if (!c.ok) errors.buffer_pack_rh = c.error;
    else if (c.value !== undefined) {
      if (c.value < CURE_SPACE_BUFFER_RH_MIN || c.value > CURE_SPACE_BUFFER_RH_MAX) {
        errors.buffer_pack_rh = "invalid_range";
      } else value.buffer_pack_rh = c.value;
    }
  }

  validateBoundedTemp("bottom_sensor_temp_c", i.bottom_sensor_temp_c, CURE_SPACE_TEMP_MIN_C, CURE_SPACE_TEMP_MAX_C, errors, value);
  validateBoundedTemp("top_sensor_temp_c", i.top_sensor_temp_c, CURE_SPACE_TEMP_MIN_C, CURE_SPACE_TEMP_MAX_C, errors, value);

  // Stack delta T: negative/zero/positive allowed within realistic bounds.
  {
    const c = coerceNumber(i.stack_delta_t_c);
    if (!c.ok) errors.stack_delta_t_c = c.error;
    else if (c.value !== undefined) {
      if (c.value < CURE_SPACE_DELTA_T_MIN_C || c.value > CURE_SPACE_DELTA_T_MAX_C) {
        errors.stack_delta_t_c = "invalid_range";
      } else value.stack_delta_t_c = c.value;
    }
  }

  // Date
  if (i.buffer_install_date) {
    const s = String(i.buffer_install_date).trim();
    if (s) {
      if (isValidIsoDate(s)) value.buffer_install_date = s;
      else errors.buffer_install_date = "invalid_date";
    }
  }

  // Sensor snapshot source — preserve verbatim from caller, never inferred.
  if (typeof i.sensor_snapshot_source === "string") {
    const t = i.sensor_snapshot_source.trim().toLowerCase();
    if ((SENSOR_SOURCES as readonly string[]).includes(t)) {
      value.sensor_snapshot_source = t as SensorSource;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, value };
}

// ---------- Status / cautious display copy ----------

export type CureSpaceSetupStatus = "recorded" | "needs_review" | "caution";

export interface CureSpaceSetupStatusNote {
  status: CureSpaceSetupStatus;
  copy: string;
}

const HIGH_FLOOR_USE_THRESHOLD = 80; // %

/**
 * Pure helper: derives cautious display notes from validated setup
 * detail. Returns at most one note per concern. Never emits alerts or
 * Action Queue items.
 */
export function getCureSpaceSetupStatusNotes(
  v: CureSpaceSetupDetailsValidation["value"],
): CureSpaceSetupStatusNote[] {
  const notes: CureSpaceSetupStatusNote[] = [];

  if (v.bag_arrangement === "tight" || v.bag_arrangement === "stacked") {
    notes.push({ status: "needs_review", copy: CURE_SPACE_SETUP_TIGHT_ARRANGEMENT_NOTE });
  }

  if (
    v.floor_space_used_percent !== undefined &&
    v.floor_space_used_percent >= HIGH_FLOOR_USE_THRESHOLD
  ) {
    notes.push({ status: "needs_review", copy: CURE_SPACE_SETUP_HIGH_FLOOR_USE_NOTE });
  }

  if (v.ventilation_method === "strong_direct_fan") {
    notes.push({ status: "caution", copy: CURE_SPACE_SETUP_STRONG_VENTILATION_NOTE });
  }

  // If the caller supplied any temp/sensor readings but no snapshot
  // source label, flag as needs_review — measurements without a labeled
  // source are operator-entered context only.
  const hasSensorReading =
    v.bottom_sensor_temp_c !== undefined ||
    v.top_sensor_temp_c !== undefined ||
    v.stack_delta_t_c !== undefined;
  if (hasSensorReading && !v.sensor_snapshot_source) {
    notes.push({ status: "needs_review", copy: CURE_SPACE_SETUP_MISSING_SOURCE_NOTE });
  }

  if (notes.length === 0) {
    notes.push({ status: "recorded", copy: CURE_SPACE_SETUP_RECORDED_NOTE });
  }

  return notes;
}
