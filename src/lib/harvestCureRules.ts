/**
 * harvestCureRules — pure validation + normalization for V0 harvest and
 * cure_check Quick Log event details.
 *
 * Pure. No I/O. No React. Deterministic. Null-safe.
 *
 * Hard rules:
 *  - All fields optional. Absence is preserved as absence.
 *  - Numeric weights reject negative / non-finite values.
 *  - Cure RH must be 0..100 if present.
 *  - Cure temperature must be in a realistic Fahrenheit band (32..120 F)
 *    if present. Out-of-band values are rejected with `invalid_range`.
 *  - Keeper status is never inferred — only what the grower entered.
 *  - mold_check === "concern" returns a caution view state; this module
 *    NEVER emits alerts, Action Queue items, or device commands.
 *  - This module makes no AI claims and no yield estimates.
 */

import {
  QUICK_LOG_BURPED_VALUES,
  QUICK_LOG_CURE_MOLD_CONCERN_NOTE,
  QUICK_LOG_KEEPER_STATUSES,
  QUICK_LOG_MOLD_CHECK_STATUSES,
  QUICK_LOG_TRIM_STYLES,
  type QuickLogBurpedValue,
  type QuickLogKeeperStatus,
  type QuickLogMoldCheckStatus,
  type QuickLogTrimStyle,
} from "@/constants/quickLogEventTypes";

export const CURE_TEMP_MIN_F = 32;
export const CURE_TEMP_MAX_F = 120;
export const CURE_RH_MIN = 0;
export const CURE_RH_MAX = 100;

export type FieldError =
  | "invalid_number"
  | "negative_not_allowed"
  | "invalid_range";

export interface HarvestDetailsInput {
  harvest_stage_note?: string | null;
  trichome_note?: string | null;
  trim_style?: string | null;
  wet_weight_grams?: number | string | null;
  dry_weight_grams?: number | string | null;
  quality_note?: string | null;
  pheno_label?: string | null;
  keeper_candidate?: string | null;
}

export interface HarvestDetailsValidation {
  ok: boolean;
  errors: Partial<Record<keyof HarvestDetailsInput, FieldError>>;
  value: {
    harvest_stage_note?: string;
    trichome_note?: string;
    trim_style?: QuickLogTrimStyle;
    wet_weight_grams?: number;
    dry_weight_grams?: number;
    quality_note?: string;
    pheno_label?: string;
    keeper_candidate?: QuickLogKeeperStatus;
  };
}

export interface CureCheckDetailsInput {
  container_label?: string | null;
  cure_day?: number | string | null;
  jar_or_bag_rh?: number | string | null;
  cure_temp_f?: number | string | null;
  smell_note?: string | null;
  moisture_note?: string | null;
  mold_check?: string | null;
  burped?: string | null;
  action_taken_note?: string | null;
}

export interface CureCheckDetailsValidation {
  ok: boolean;
  errors: Partial<Record<keyof CureCheckDetailsInput, FieldError>>;
  value: {
    container_label?: string;
    cure_day?: number;
    jar_or_bag_rh?: number;
    cure_temp_f?: number;
    smell_note?: string;
    moisture_note?: string;
    mold_check?: QuickLogMoldCheckStatus;
    burped?: QuickLogBurpedValue;
    action_taken_note?: string;
  };
}

function trimOrUndef(v: string | null | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

type CoerceResult =
  | { ok: true; value: number | undefined }
  | { ok: false; error: FieldError };

function coerceNumber(v: number | string | null | undefined): CoerceResult {
  if (v === null || v === undefined || v === "") {
    return { ok: true, value: undefined } as CoerceResult;
  }
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return { ok: false, error: "invalid_number" };
  return { ok: true, value: n } as CoerceResult;
}

function enumOrUndef<T extends string>(
  v: string | null | undefined,
  allowed: readonly T[],
): T | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim().toLowerCase();
  return (allowed as readonly string[]).includes(t) ? (t as T) : undefined;
}

export function validateHarvestDetails(
  input: HarvestDetailsInput | null | undefined,
): HarvestDetailsValidation {
  const errors: HarvestDetailsValidation["errors"] = {};
  const value: HarvestDetailsValidation["value"] = {};
  const i = input ?? {};

  const stage = trimOrUndef(i.harvest_stage_note);
  if (stage) value.harvest_stage_note = stage;
  const trich = trimOrUndef(i.trichome_note);
  if (trich) value.trichome_note = trich;
  const quality = trimOrUndef(i.quality_note);
  if (quality) value.quality_note = quality;
  const pheno = trimOrUndef(i.pheno_label);
  if (pheno) value.pheno_label = pheno;

  const trim = enumOrUndef(i.trim_style, QUICK_LOG_TRIM_STYLES);
  if (trim) value.trim_style = trim;

  const keeper = enumOrUndef(i.keeper_candidate, QUICK_LOG_KEEPER_STATUSES);
  if (keeper) value.keeper_candidate = keeper;

  for (const field of ["wet_weight_grams", "dry_weight_grams"] as const) {
    const c = coerceNumber(i[field]);
    if (!c.ok) {
      errors[field] = c.error;
      continue;
    }
    if (c.value === undefined) continue;
    if (c.value < 0) {
      errors[field] = "negative_not_allowed";
      continue;
    }
    value[field] = c.value;
  }

  return { ok: Object.keys(errors).length === 0, errors, value };
}

export function validateCureCheckDetails(
  input: CureCheckDetailsInput | null | undefined,
): CureCheckDetailsValidation {
  const errors: CureCheckDetailsValidation["errors"] = {};
  const value: CureCheckDetailsValidation["value"] = {};
  const i = input ?? {};

  const container = trimOrUndef(i.container_label);
  if (container) value.container_label = container;
  const smell = trimOrUndef(i.smell_note);
  if (smell) value.smell_note = smell;
  const moisture = trimOrUndef(i.moisture_note);
  if (moisture) value.moisture_note = moisture;
  const action = trimOrUndef(i.action_taken_note);
  if (action) value.action_taken_note = action;

  const mold = enumOrUndef(i.mold_check, QUICK_LOG_MOLD_CHECK_STATUSES);
  if (mold) value.mold_check = mold;
  const burped = enumOrUndef(i.burped, QUICK_LOG_BURPED_VALUES);
  if (burped) value.burped = burped;

  const day = coerceNumber(i.cure_day);
  if (!day.ok) errors.cure_day = day.error;
  else if (day.value !== undefined) {
    if (day.value < 0 || !Number.isInteger(day.value)) errors.cure_day = "invalid_range";
    else value.cure_day = day.value;
  }

  const rh = coerceNumber(i.jar_or_bag_rh);
  if (!rh.ok) errors.jar_or_bag_rh = rh.error;
  else if (rh.value !== undefined) {
    if (rh.value < CURE_RH_MIN || rh.value > CURE_RH_MAX) {
      errors.jar_or_bag_rh = "invalid_range";
    } else value.jar_or_bag_rh = rh.value;
  }

  const tempF = coerceNumber(i.cure_temp_f);
  if (!tempF.ok) errors.cure_temp_f = tempF.error;
  else if (tempF.value !== undefined) {
    if (tempF.value < CURE_TEMP_MIN_F || tempF.value > CURE_TEMP_MAX_F) {
      errors.cure_temp_f = "invalid_range";
    } else value.cure_temp_f = tempF.value;
  }

  return { ok: Object.keys(errors).length === 0, errors, value };
}

export type CureCautionState = "none" | "caution";

/**
 * Pure helper: returns "caution" only when mold_check is explicitly
 * "concern". Never escalates to alerts or Action Queue.
 */
export function cureCheckCautionState(
  mold: QuickLogMoldCheckStatus | null | undefined,
): CureCautionState {
  return mold === "concern" ? "caution" : "none";
}

export function cureCheckCautionCopy(state: CureCautionState): string | null {
  return state === "caution" ? QUICK_LOG_CURE_MOLD_CONCERN_NOTE : null;
}
