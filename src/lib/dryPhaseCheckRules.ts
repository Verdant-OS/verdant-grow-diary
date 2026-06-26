/**
 * dryPhaseCheckRules — pure validation + cautious display copy for the
 * V0 `dry_phase_check` Quick Log event detail.
 *
 * Pure. No I/O. No React. Deterministic. Null-safe.
 *
 * Hard rules:
 *  - All fields optional.
 *  - Numeric bounds reject out-of-range values; this module emits NO
 *    alerts, NO Action Queue items, NO device commands.
 *  - Airflow reuses the Grove Bag taxonomy: strong_direct → caution,
 *    stagnant/fluctuating/unknown → needs_review.
 *  - mold_check === "concern" returns caution copy only.
 *  - Sensor snapshot source labels (if attached at a higher layer) are
 *    preserved verbatim; manual / stale / demo / invalid readings never
 *    count as good evidence.
 */

import {
  GROVE_BAG_AIRFLOW_OBSERVATIONS,
  type GroveBagAirflowObservation,
} from "@/constants/groveBagCureFields";
import {
  DRY_AMBIENT_RH_MAX,
  DRY_AMBIENT_RH_MIN,
  DRY_AMBIENT_TEMP_MAX_C,
  DRY_AMBIENT_TEMP_MIN_C,
  DRY_BUD_FEEL_VALUES,
  DRY_DAY_MAX,
  DRY_PHASE_MOLD_CONCERN_NOTE,
  DRY_PHASE_OUT_OF_RANGE_NOTE,
  DRY_PHASE_RECORDED_NOTE,
  DRY_PHASE_STAGNANT_AIRFLOW_NOTE,
  DRY_PHASE_STRONG_AIRFLOW_NOTE,
  DRY_STEM_SNAP_STATUSES,
  DRY_VPD_MAX_KPA,
  DRY_VPD_MIN_KPA,
  type DryBudFeel,
  type DryStemSnapStatus,
} from "@/constants/dryPhaseCheckFields";
import {
  QUICK_LOG_MOLD_CHECK_STATUSES,
  type QuickLogMoldCheckStatus,
} from "@/constants/quickLogEventTypes";

export type DryPhaseFieldError =
  | "invalid_number"
  | "negative_not_allowed"
  | "invalid_range"
  | "invalid_integer"
  | "invalid_date";

export interface DryPhaseCheckDetailsInput {
  dry_day?: number | string | null;
  ambient_temp_c?: number | string | null;
  ambient_rh?: number | string | null;
  vpd_kpa?: number | string | null;
  airflow_observation?: string | null;
  stem_snap_status?: string | null;
  exterior_bud_feel?: string | null;
  smell_note?: string | null;
  mold_check?: string | null;
  action_taken_note?: string | null;
  next_check_due?: string | null;
}

export interface DryPhaseCheckDetailsValidation {
  ok: boolean;
  errors: Partial<Record<keyof DryPhaseCheckDetailsInput, DryPhaseFieldError>>;
  value: {
    dry_day?: number;
    ambient_temp_c?: number;
    ambient_rh?: number;
    vpd_kpa?: number;
    airflow_observation?: GroveBagAirflowObservation;
    stem_snap_status?: DryStemSnapStatus;
    exterior_bud_feel?: DryBudFeel;
    smell_note?: string;
    mold_check?: QuickLogMoldCheckStatus;
    action_taken_note?: string;
    next_check_due?: string;
  };
}

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

interface NumOk { ok: true; value: number | undefined }
interface NumErr { ok: false; error: DryPhaseFieldError }
type NumResult = NumOk | NumErr;

function coerceNumber(v: number | string | null | undefined): NumResult {
  if (v === null || v === undefined || v === "") return { ok: true, value: undefined };
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return { ok: false, error: "invalid_number" };
  return { ok: true, value: n };
}

export function validateDryPhaseCheckDetails(
  input: DryPhaseCheckDetailsInput | null | undefined,
): DryPhaseCheckDetailsValidation {
  const errors: DryPhaseCheckDetailsValidation["errors"] = {};
  const value: DryPhaseCheckDetailsValidation["value"] = {};
  const i = input ?? {};

  const smell = trimOrUndef(i.smell_note);
  if (smell) value.smell_note = smell;
  const action = trimOrUndef(i.action_taken_note);
  if (action) value.action_taken_note = action;

  const mold = enumOrUndef(i.mold_check, QUICK_LOG_MOLD_CHECK_STATUSES);
  if (mold) value.mold_check = mold;
  const snap = enumOrUndef(i.stem_snap_status, DRY_STEM_SNAP_STATUSES);
  if (snap) value.stem_snap_status = snap;
  const feel = enumOrUndef(i.exterior_bud_feel, DRY_BUD_FEEL_VALUES);
  if (feel) value.exterior_bud_feel = feel;

  if (i.airflow_observation !== undefined && i.airflow_observation !== null && i.airflow_observation !== "") {
    const af = enumOrUndef(i.airflow_observation, GROVE_BAG_AIRFLOW_OBSERVATIONS);
    if (af && af !== "unknown") value.airflow_observation = af;
  }

  // dry_day: non-negative integer up to DRY_DAY_MAX
  {
    const c = coerceNumber(i.dry_day);
    if (!c.ok) errors.dry_day = c.error;
    else if (c.value !== undefined) {
      if (c.value < 0) errors.dry_day = "negative_not_allowed";
      else if (!Number.isInteger(c.value)) errors.dry_day = "invalid_integer";
      else if (c.value > DRY_DAY_MAX) errors.dry_day = "invalid_range";
      else value.dry_day = c.value;
    }
  }

  // ambient_temp_c
  {
    const c = coerceNumber(i.ambient_temp_c);
    if (!c.ok) errors.ambient_temp_c = c.error;
    else if (c.value !== undefined) {
      if (c.value < DRY_AMBIENT_TEMP_MIN_C || c.value > DRY_AMBIENT_TEMP_MAX_C) {
        errors.ambient_temp_c = "invalid_range";
      } else value.ambient_temp_c = c.value;
    }
  }

  // ambient_rh
  {
    const c = coerceNumber(i.ambient_rh);
    if (!c.ok) errors.ambient_rh = c.error;
    else if (c.value !== undefined) {
      if (c.value < DRY_AMBIENT_RH_MIN || c.value > DRY_AMBIENT_RH_MAX) {
        errors.ambient_rh = "invalid_range";
      } else value.ambient_rh = c.value;
    }
  }

  // vpd_kpa: non-negative, bounded
  {
    const c = coerceNumber(i.vpd_kpa);
    if (!c.ok) errors.vpd_kpa = c.error;
    else if (c.value !== undefined) {
      if (c.value < 0) errors.vpd_kpa = "negative_not_allowed";
      else if (c.value < DRY_VPD_MIN_KPA || c.value > DRY_VPD_MAX_KPA) {
        errors.vpd_kpa = "invalid_range";
      } else value.vpd_kpa = c.value;
    }
  }

  if (i.next_check_due) {
    const s = String(i.next_check_due).trim();
    if (s) {
      if (Number.isFinite(Date.parse(s))) value.next_check_due = s;
      else errors.next_check_due = "invalid_date";
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, value };
}

// ---------- Status / cautious display copy ----------

export type DryPhaseStatus = "recorded" | "needs_review" | "caution";

export interface DryPhaseStatusNote {
  status: DryPhaseStatus;
  copy: string;
}

export function getDryPhaseStatusNotes(
  v: DryPhaseCheckDetailsValidation["value"],
): DryPhaseStatusNote[] {
  const notes: DryPhaseStatusNote[] = [];

  if (v.mold_check === "concern") {
    notes.push({ status: "caution", copy: DRY_PHASE_MOLD_CONCERN_NOTE });
  }

  if (v.airflow_observation === "strong_direct") {
    notes.push({ status: "caution", copy: DRY_PHASE_STRONG_AIRFLOW_NOTE });
  } else if (v.airflow_observation === "stagnant") {
    notes.push({ status: "needs_review", copy: DRY_PHASE_STAGNANT_AIRFLOW_NOTE });
  }

  const tempOut =
    v.ambient_temp_c !== undefined &&
    (v.ambient_temp_c < 10 || v.ambient_temp_c > 27);
  const rhOut =
    v.ambient_rh !== undefined && (v.ambient_rh < 45 || v.ambient_rh > 70);
  const vpdOut =
    v.vpd_kpa !== undefined && (v.vpd_kpa < 0.8 || v.vpd_kpa > 1.6);
  if (tempOut || rhOut || vpdOut) {
    notes.push({ status: "needs_review", copy: DRY_PHASE_OUT_OF_RANGE_NOTE });
  }

  if (notes.length === 0) {
    notes.push({ status: "recorded", copy: DRY_PHASE_RECORDED_NOTE });
  }

  return notes;
}
