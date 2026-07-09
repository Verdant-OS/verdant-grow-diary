/**
 * quickLogActionSwitchResetRules — pure rules for clearing stale
 * event-specific Quick Log draft state when the grower switches
 * activity / action / event type.
 *
 * Pure. No React. No I/O. No Supabase. No AI. No Action Queue.
 *
 * Ownership rule (scoped resets):
 *   - Harvest-specific fields clear only when leaving a harvest event.
 *   - Feeding-specific fields clear only when leaving a feeding event.
 *   - Maturity-evidence-specific fields clear only when leaving an
 *     event that owns the maturity evidence surface.
 *   - Environment-specific fields clear only when leaving an
 *     environment event.
 *   - Stale save-status / saved-summary / save-error / watering-error
 *     always clear on any event-type change (they belonged to the
 *     previous event's save attempt).
 *
 * Preserves across every switch:
 *   - selected target (plant/grow/tent)
 *   - occurred_at / remindAt
 *   - note (Quick Log UX treats note as global per A1)
 *   - stage (grower-touched stage is preserved by upstream ref;
 *     this helper does NOT touch stage)
 *   - sensor snapshot toggle (Quick Log UX treats it as global)
 */

/** Family classification of an event type for scoped resets. */
export type QuickLogActionFamily =
  | "harvest"
  | "feeding"
  | "environment"
  | "maturity"
  | "other";

/**
 * Classify a raw event-type string into a scoped-reset family.
 * Unknown / empty values map to "other".
 */
export function classifyQuickLogActionFamily(
  eventType: string | null | undefined,
): QuickLogActionFamily {
  const v = (eventType ?? "").toLowerCase().trim();
  if (v === "harvest" || v === "cure_check") return "harvest";
  if (v === "feeding") return "feeding";
  if (v === "environment") return "environment";
  if (v === "maturity_evidence" || v === "maturity") return "maturity";
  return "other";
}

export interface QuickLogActionSwitchResetPlan {
  /** True when the switch actually changes the event family. */
  changed: boolean;
  /** Clear harvest-only fields (photo angle/lighting, weights, unit). */
  clearHarvest: boolean;
  /** Clear feeding-only fields (line, products, defaults-applied flag). */
  clearFeeding: boolean;
  /** Clear environment-only fields (temp, RH, VPD, water temp, EC). */
  clearEnvironment: boolean;
  /** Clear maturity-evidence-only fields. */
  clearMaturity: boolean;
  /**
   * Clear stale save status / saved summary / save + watering errors.
   * Always true when `changed` is true — they belong to the previous
   * event's save attempt.
   */
  clearSaveStatus: boolean;
}

const NO_RESET: QuickLogActionSwitchResetPlan = {
  changed: false,
  clearHarvest: false,
  clearFeeding: false,
  clearEnvironment: false,
  clearMaturity: false,
  clearSaveStatus: false,
};

/**
 * Compute which draft slices to clear when the grower switches the
 * Quick Log action / event type.
 *
 * Returns a no-op plan if the family is unchanged (e.g. the user
 * re-selects the same event, or two event types share a family).
 */
export function planQuickLogActionSwitchReset(
  prev: string | null | undefined,
  next: string | null | undefined,
): QuickLogActionSwitchResetPlan {
  const from = classifyQuickLogActionFamily(prev);
  const to = classifyQuickLogActionFamily(next);
  if (from === to) return NO_RESET;

  return {
    changed: true,
    clearHarvest: from === "harvest",
    clearFeeding: from === "feeding",
    clearEnvironment: from === "environment",
    clearMaturity: from === "maturity",
    clearSaveStatus: true,
  };
}
