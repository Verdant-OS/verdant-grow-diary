/**
 * harvestDetailsRules — pure helpers for optional Harvest Quick Log
 * detail fields (wet weight, dry weight, weight unit).
 *
 * Read-only. No React, no I/O, no Supabase, no writes. Deterministic.
 *
 * Safety rules:
 *  - Empty / missing values are always allowed. A Harvest log with only
 *    a note is valid.
 *  - Negative numeric values are rejected (not stored).
 *  - Non-numeric text is rejected (not stored) so payloads never carry
 *    unbounded free text into `details.harvest`.
 *  - The unit is validated against QUICK_LOG_WEIGHT_UNITS. Unknown
 *    units are dropped, never coerced or invented.
 *  - This module never claims yield, readiness, potency, or quality.
 *  - This module never triggers writes or Action Queue changes.
 */
import {
  QUICK_LOG_WEIGHT_UNITS,
  type QuickLogHarvestDetails,
  type QuickLogWeightUnit,
} from "@/constants/quickLogActivityTypes";

/**
 * Normalize a weight input string into a safe, non-negative numeric
 * string. Returns null for empty / invalid / negative values.
 *
 * We keep the value as a string (not a number) so persisted details
 * preserve the exact grower-entered precision (e.g. "12.50" stays as
 * entered) and so we never invent decimals or units.
 */
export function sanitizeHarvestWeightInput(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (trimmed.length === 0) return null;
  // Reject anything that isn't a simple non-negative decimal.
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  // Reject "0" alone as meaningless for a weight; but allow "0.5" etc.
  // Grower may still be at zero, so accept it — do not editorialize.
  return trimmed;
}

export function sanitizeHarvestWeightUnit(
  raw: string | null | undefined,
): QuickLogWeightUnit | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim() as QuickLogWeightUnit;
  return QUICK_LOG_WEIGHT_UNITS.includes(trimmed) ? trimmed : null;
}

export interface BuildHarvestDetailsInput {
  wetWeight?: string | null;
  dryWeight?: string | null;
  weightUnit?: string | null;
}

/**
 * Build the `details.harvest` sub-object for the RPC payload from
 * grower-entered form inputs. Returns null when every field is empty
 * or invalid — caller should omit `details.harvest` entirely in that
 * case.
 */
export function buildHarvestDetailsPayload(
  input: BuildHarvestDetailsInput | null | undefined,
): QuickLogHarvestDetails | null {
  if (!input) return null;
  const wet = sanitizeHarvestWeightInput(input.wetWeight ?? null);
  const dry = sanitizeHarvestWeightInput(input.dryWeight ?? null);
  const unit = sanitizeHarvestWeightUnit(input.weightUnit ?? null);
  const hasAnyWeight = wet !== null || dry !== null;
  const out: QuickLogHarvestDetails = {};
  if (wet !== null) out.wetWeight = wet;
  if (dry !== null) out.dryWeight = dry;
  // Only include the unit if at least one weight was entered.
  if (unit !== null && hasAnyWeight) out.weightUnit = unit;
  if (Object.keys(out).length === 0) return null;
  return out;
}

/**
 * Read a persisted harvest details blob (from `grow_events.details`
 * or `NormalizedDiaryDetails.extras.harvest`) into the typed shape,
 * dropping unknown / unsafe fields. Never throws.
 */
export function readPersistedHarvestDetails(
  raw: unknown,
): QuickLogHarvestDetails | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const wet =
    typeof r.wetWeight === "string" || typeof r.wetWeight === "number"
      ? sanitizeHarvestWeightInput(String(r.wetWeight))
      : null;
  const dry =
    typeof r.dryWeight === "string" || typeof r.dryWeight === "number"
      ? sanitizeHarvestWeightInput(String(r.dryWeight))
      : null;
  const unit =
    typeof r.weightUnit === "string"
      ? sanitizeHarvestWeightUnit(r.weightUnit)
      : null;
  const out: QuickLogHarvestDetails = {};
  if (wet !== null) out.wetWeight = wet;
  if (dry !== null) out.dryWeight = dry;
  if (unit !== null && (wet !== null || dry !== null)) out.weightUnit = unit;
  if (Object.keys(out).length === 0) return null;
  return out;
}

/**
 * Format a harvest weight for display. Returns null when the value is
 * missing so callers can hide the field entirely. Never invents a unit.
 */
export function formatHarvestWeightForDisplay(
  value: string | null | undefined,
  unit: QuickLogWeightUnit | null | undefined,
): string | null {
  if (!value) return null;
  const safe = sanitizeHarvestWeightInput(value);
  if (safe === null) return null;
  if (!unit) return safe;
  return `${safe} ${unit}`;
}

// ---------------------------------------------------------------------------
// Inline validation (presenter feedback only)
// ---------------------------------------------------------------------------

export const HARVEST_WEIGHT_NEGATIVE_ERROR = "Weight cannot be negative.";
export const HARVEST_WEIGHT_INVALID_ERROR =
  "Enter a number like 12 or 12.5.";

export interface HarvestWeightValidation {
  ok: boolean;
  error: string | null;
}

/**
 * Validate a raw harvest weight input for inline UI feedback.
 *
 *  - Empty / null / whitespace → valid (weights are optional).
 *  - Negative numbers → rejected with a friendly error.
 *  - Non-numeric text → rejected with a friendly error.
 *  - Non-negative decimals → valid.
 *
 * This is presentation-only. Persistence still runs through
 * `sanitizeHarvestWeightInput`, which independently drops any unsafe
 * value — so invalid inputs are never written even if a caller ignores
 * this validator.
 */
export function validateHarvestWeightInput(
  raw: string | null | undefined,
): HarvestWeightValidation {
  if (raw == null) return { ok: true, error: null };
  const t = String(raw).trim();
  if (t.length === 0) return { ok: true, error: null };
  if (/^-/.test(t)) {
    return { ok: false, error: HARVEST_WEIGHT_NEGATIVE_ERROR };
  }
  if (!/^\d+(\.\d+)?$/.test(t)) {
    return { ok: false, error: HARVEST_WEIGHT_INVALID_ERROR };
  }
  return { ok: true, error: null };
}

/**
 * Format a concise saved-breakdown detail suffix for a Harvest item, e.g.
 * "wet 120 g, dry 32 g". Returns null when no valid weight was entered.
 * Unit is only included when at least one valid weight exists. Never
 * infers a missing weight from the other one. Never claims yield.
 */
export function formatHarvestSavedBreakdownDetail(
  input: BuildHarvestDetailsInput | null | undefined,
): string | null {
  if (!input) return null;
  const wet = sanitizeHarvestWeightInput(input.wetWeight ?? null);
  const dry = sanitizeHarvestWeightInput(input.dryWeight ?? null);
  if (wet === null && dry === null) return null;
  const unit = sanitizeHarvestWeightUnit(input.weightUnit ?? null);
  const parts: string[] = [];
  if (wet !== null) parts.push(unit ? `wet ${wet} ${unit}` : `wet ${wet}`);
  if (dry !== null) parts.push(unit ? `dry ${dry} ${unit}` : `dry ${dry}`);
  return parts.join(", ");
}
