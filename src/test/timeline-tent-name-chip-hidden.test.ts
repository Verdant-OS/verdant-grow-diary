/**
 * A friendly tent chip already shows details.tent_name. The same value must
 * not also render as a raw tent_name chip.
 *
 * Presenter-only. No Supabase writes, no AI calls, no Action Queue writes.
 */
import { describe, expect, it } from "vitest";
import { presentTimelineDiaryEntryDetails } from "@/lib/timelineDiaryEntryDetailPresentationRules";
import { resolveTimelineCardPlaceLabels } from "@/lib/timelineEvidenceFilterRules";

describe("timeline tent chip hides the raw tent_name key", () => {
  it("keeps the named tent and drops the raw tent_name chip", () => {
    const details = { event_type: "photo", tent_name: "Veg tent" };
    expect(
      resolveTimelineCardPlaceLabels({
        tentId: "tent-1",
        details,
        tentNamesById: new Map([["tent-1", "Flower tent"]]),
      }).tentName,
    ).toBe("Veg tent");
    expect(presentTimelineDiaryEntryDetails(details, "fahrenheit").extra).toEqual([]);
  });
});
