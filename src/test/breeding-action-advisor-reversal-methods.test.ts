/**
 * breeding-action-advisor — reversal-method coverage. Every chemical
 * reversal method the BreedingEventForm offers (sts_spray, colloidal_silver,
 * ga3) must produce the early-pollen isolation follow-up; an unknown method
 * gets only the base 9-day shed check. Regression for GA3, which the form
 * exposed while the advisor branch still recognised only the first two.
 */
import { describe, expect, it } from "vitest";
import { suggestBreedingFollowUpActions } from "@/lib/genetics/breedingActionAdvisor";

function reversalEvent(method: string) {
  return {
    id: "ev1",
    event_type: "reversal_application",
    occurred_at: "2026-08-01T00:00:00Z",
    details: { method },
  };
}

describe("suggestBreedingFollowUpActions — reversal methods", () => {
  it.each(["sts_spray", "colloidal_silver", "ga3"])(
    "adds the early-isolation follow-up for chemical method %s",
    (method) => {
      const suggestions = suggestBreedingFollowUpActions(reversalEvent(method));
      expect(suggestions.some((s) => /isolation status of nearby receivers/i.test(s.title))).toBe(
        true,
      );
    },
  );

  it("an unknown method gets only the base pollen-shed check, no chemical follow-up", () => {
    const suggestions = suggestBreedingFollowUpActions(reversalEvent("manual_stress"));
    expect(suggestions.some((s) => /visible pollen shed/i.test(s.title))).toBe(true);
    expect(suggestions.some((s) => /isolation status of nearby receivers/i.test(s.title))).toBe(
      false,
    );
  });
});
