/**
 * Field-level checks for the plant-page Quick Log manual readings (#2159).
 * Pure: no React, no I/O.
 */
import { isExplicitNegativeDecimal } from "@/lib/ecPpm500PairRules";

export const PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE = "EC can't be negative." as const;

/** The inline EC error for raw input, or null when the value may be saved. */
export function plantQuickLogEcError(raw: string | null | undefined): string | null {
  return isExplicitNegativeDecimal(raw) ? PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE : null;
}
