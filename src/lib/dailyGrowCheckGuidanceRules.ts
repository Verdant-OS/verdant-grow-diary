/**
 * Pure copy/state rules for Daily Grow Check onboarding and empty-state
 * guidance on Plant Detail.
 *
 * Read-only. No persistence. No writes. Reuses the existing
 * ConsistencySummary as its only input — never re-derives activity from
 * raw data and never claims plant health from check frequency.
 *
 * Forbidden wording is enforced by guidance tests — see
 * src/test/daily-grow-check-guidance.test.ts.
 */
import type { ConsistencySummary } from "@/lib/dailyGrowCheckConsistencyRules";

export type DailyCheckGuidanceState =
  | "empty"
  | "today-unchecked"
  | "today-unchecked-inconsistent"
  | "today-checked";

export interface DailyCheckGuidance {
  state: DailyCheckGuidanceState;
  /** Short headline shown above the body copy. */
  headline: string;
  /** One-sentence supporting copy. */
  body: string;
  /** One clear next step shown as a separate hint line. */
  nextStep: string;
  /** Primary CTA label. */
  ctaLabel: string;
  /** Always-shown explanation of what counts as a check. */
  whatCountsHint: string;
  /** True when guidance should be styled as positive confirmation. */
  isPositive: boolean;
}

export const WHAT_COUNTS_HINT =
  "A Daily Grow Check counts when you add a quick note or a manual sensor snapshot for this plant's tent.";

export const CTA_START_TODAY = "Start today's check";
export const CTA_KEEP_RHYTHM = "Open today's check";

/**
 * Derive guidance from an existing ConsistencySummary. Deterministic.
 */
export function deriveDailyGrowCheckGuidance(
  summary: Pick<
    ConsistencySummary,
    "checkedDays" | "missedDays" | "todayHasActivity" | "hasAnyActivity" | "windowDays"
  >,
): DailyCheckGuidance {
  if (!summary.hasAnyActivity) {
    return {
      state: "empty",
      headline: "No checks logged yet",
      body: `No check activity in the last ${summary.windowDays} days.`,
      nextStep:
        "Start with one quick note or a manual sensor snapshot today.",
      ctaLabel: CTA_START_TODAY,
      whatCountsHint: WHAT_COUNTS_HINT,
      isPositive: false,
    };
  }

  if (summary.todayHasActivity) {
    return {
      state: "today-checked",
      headline: "Today's check is in",
      body: `Checked ${summary.checkedDays} of last ${summary.windowDays} days.`,
      nextStep: "Keep your daily rhythm going tomorrow.",
      ctaLabel: CTA_KEEP_RHYTHM,
      whatCountsHint: WHAT_COUNTS_HINT,
      isPositive: true,
    };
  }

  const inconsistent = summary.missedDays > summary.checkedDays;
  if (inconsistent) {
    return {
      state: "today-unchecked-inconsistent",
      headline: `Checked ${summary.checkedDays} of last ${summary.windowDays} days`,
      body: `Missed ${summary.missedDays} day${
        summary.missedDays === 1 ? "" : "s"
      } in this window.`,
      nextStep:
        "Start with one quick note or sensor snapshot today — small is fine.",
      ctaLabel: CTA_START_TODAY,
      whatCountsHint: WHAT_COUNTS_HINT,
      isPositive: false,
    };
  }

  return {
    state: "today-unchecked",
    headline: "Today isn't checked yet",
    body: `Checked ${summary.checkedDays} of last ${summary.windowDays} days.`,
    nextStep:
      "Add one quick note or a manual sensor snapshot to mark today.",
    ctaLabel: CTA_START_TODAY,
    whatCountsHint: WHAT_COUNTS_HINT,
    isPositive: false,
  };
}
