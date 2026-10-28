/**
 * Field-level checks for the plant-page Quick Log manual readings (#2159).
 * Pure: no React, no I/O.
 */
export const PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE = "EC can't be negative." as const;

/** Save-button helper while the EC error blocks the save, so it never reads "Ready to save". */
export const PLANT_QUICK_LOG_EC_SAVE_BLOCKED_HELPER = "Fix the EC reading before saving." as const;

/**
 * The inline EC error for raw input, or null when the value may be saved.
 * Judged on the parsed number, as the save path parses it, so exponent forms
 * such as "-1e2" are caught too.
 */
export function plantQuickLogEcError(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value < 0 ? PLANT_QUICK_LOG_NEGATIVE_EC_MESSAGE : null;
}
