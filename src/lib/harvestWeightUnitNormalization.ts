/**
 * harvestWeightUnitNormalization — pure helper that canonicalizes a
 * grower-entered harvest weight (value + unit) into grams, while
 * preserving the ORIGINAL value + unit for display.
 *
 * This module is the single source of truth for unit → grams conversion
 * in the Quick Log Harvest surface. It never mutates schemas, never
 * writes, never calls Supabase, never touches Action Queue / AI / device
 * control, and never invents a unit.
 *
 * Why a dedicated helper?
 *  Verdant currently has two harvest vocabularies:
 *   A) `harvestDetailsRules` — {wetWeight:string, dryWeight:string,
 *      weightUnit:g|oz|lb|kg} — preserves the grower's original unit.
 *   B) `harvestCureRules` — {wet_weight_grams:number,
 *      dry_weight_grams:number} — numeric grams, no unit.
 *  Without a canonical conversion helper any consumer that reads a raw
 *  number and treats it as grams silently mislabels a lb/oz/kg entry as
 *  grams. This helper closes that gap without touching either
 *  vocabulary's persisted shape.
 *
 * Pure. Deterministic. Null-safe. No I/O.
 */
import {
  QUICK_LOG_WEIGHT_UNITS,
  type QuickLogWeightUnit,
} from "@/constants/quickLogActivityTypes";

/**
 * Conversion factors to grams. Source: SI / imperial-avoirdupois defs.
 *  - 1 oz (avoirdupois) = 28.349523125 g
 *  - 1 lb (avoirdupois) = 453.59237     g
 *  - 1 kg               = 1000          g
 * These are exact by definition and never rounded here — rounding is
 * a presenter decision, not a storage decision.
 */
export const GRAMS_PER_UNIT: Readonly<Record<QuickLogWeightUnit, number>> = {
  g: 1,
  oz: 28.349523125,
  lb: 453.59237,
  kg: 1000,
};

export interface NormalizedHarvestWeight {
  /** Original grower-entered value, trimmed. Preserved for display. */
  originalValue: string;
  /** Original grower-entered unit. Preserved for display. */
  originalUnit: QuickLogWeightUnit;
  /** Canonical grams, finite non-negative number. */
  grams: number;
}

function sanitizeUnit(
  raw: string | null | undefined,
): QuickLogWeightUnit | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim() as QuickLogWeightUnit;
  return QUICK_LOG_WEIGHT_UNITS.includes(t) ? t : null;
}

function sanitizeNumericValue(
  raw: string | number | null | undefined,
): { text: string; num: number } | null {
  if (raw == null) return null;
  const text =
    typeof raw === "number"
      ? Number.isFinite(raw)
        ? String(raw)
        : ""
      : String(raw).trim();
  if (text.length === 0) return null;
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const num = Number(text);
  if (!Number.isFinite(num) || num < 0) return null;
  return { text, num };
}

/**
 * Convert a grower-entered {value, unit} pair into a normalized record
 * that carries BOTH the original display value and the canonical grams.
 *
 * Returns null for empty / invalid / negative / unknown-unit inputs.
 * Never invents a unit. Never rounds. Never persists.
 */
export function normalizeHarvestWeightToGrams(input: {
  value: string | number | null | undefined;
  unit: string | null | undefined;
}): NormalizedHarvestWeight | null {
  const value = sanitizeNumericValue(input?.value);
  if (value === null) return null;
  const unit = sanitizeUnit(input?.unit);
  if (unit === null) return null;
  const factor = GRAMS_PER_UNIT[unit];
  const grams = value.num * factor;
  if (!Number.isFinite(grams) || grams < 0) return null;
  return {
    originalValue: value.text,
    originalUnit: unit,
    grams,
  };
}

/**
 * Convenience: return canonical grams only, or null on any invalid input.
 * Callers that need to display "12 lb (5443.11 g)" should use
 * `normalizeHarvestWeightToGrams` instead so the original value + unit
 * are preserved.
 */
export function harvestWeightAsGrams(input: {
  value: string | number | null | undefined;
  unit: string | null | undefined;
}): number | null {
  return normalizeHarvestWeightToGrams(input)?.grams ?? null;
}

/**
 * Format grams for display. Rounds to 2 decimals and strips trailing
 * zeros so "5443.10" → "5443.1" and "1000.00" → "1000". Presenter-only.
 */
export function formatGramsForDisplay(grams: number | null | undefined): string | null {
  if (grams == null || !Number.isFinite(grams) || grams < 0) return null;
  const rounded = Math.round(grams * 100) / 100;
  // Fixed 2 decimals then strip trailing zeros (and trailing dot).
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}
