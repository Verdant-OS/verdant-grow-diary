/**
 * Extra pure-rule matrix for Daily Check guided in-flow submit (#2167).
 * Complements daily-check-guided-flow-stay-2167.test.tsx without editing locked pins.
 */
import { describe, expect, it } from "vitest";
import {
  DAILY_GROW_CHECK_EMPTY_MANUAL_STEP_WARNING,
  INITIAL_DAILY_GROW_CHECK_STATE,
  shouldAdvanceGuidedDailyCheckOnSubmit,
  shouldWarnOnEmptyManualStepNext,
} from "@/lib/dailyGrowCheckRules";

describe("dailyGrowCheckRules — guided submit matrix (#2167)", () => {
  it("pins empty-manual warning copy", () => {
    expect(DAILY_GROW_CHECK_EMPTY_MANUAL_STEP_WARNING).toMatch(/no manual snapshot saved/i);
  });

  it("only advances note saves on quicklog or handheld, and sensor saves on manual", () => {
    expect(
      shouldAdvanceGuidedDailyCheckOnSubmit({
        method: "note",
        renderedStep: "manual",
        methodHint: null,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceGuidedDailyCheckOnSubmit({
        method: "sensor",
        renderedStep: "quicklog",
        methodHint: null,
      }),
    ).toBe(false);
    expect(
      shouldAdvanceGuidedDailyCheckOnSubmit({
        method: "sensor",
        renderedStep: "manual",
        methodHint: null,
      }),
    ).toBe(true);
  });

  it("does not warn on manual Next after skip or visit outcomes", () => {
    expect(
      shouldWarnOnEmptyManualStepNext({
        renderedStep: "manual",
        state: { ...INITIAL_DAILY_GROW_CHECK_STATE, manual: "skipped" },
      }),
    ).toBe(false);
    expect(
      shouldWarnOnEmptyManualStepNext({
        renderedStep: "manual",
        state: { ...INITIAL_DAILY_GROW_CHECK_STATE, manual: "visited" },
      }),
    ).toBe(false);
  });
});
