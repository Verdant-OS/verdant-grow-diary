import { describe, expect, it } from "vitest";
import {
  timelineClearFiltersEnabled,
  timelineDateParamsAfterSync,
  timelineEnteredDateKeepsClearEnabled,
} from "@/lib/timelineEvidenceFilterRules";

describe("timeline clear with an invalid date range", () => {
  it("keeps Clear enabled when both dates are entered but the range is inverted", () => {
    expect(timelineEnteredDateKeepsClearEnabled("2026-10-20")).toBe(true);
    expect(timelineEnteredDateKeepsClearEnabled("")).toBe(false);
    expect(
      timelineClearFiltersEnabled({
        evidenceActive: false,
        chipFiltersActive: false,
        enteredStartDate: "2026-10-20",
        enteredEndDate: "2026-10-01",
      }),
    ).toBe(true);
  });

  it("keeps Clear enabled for a non-ISO date the field still holds", () => {
    expect(
      timelineClearFiltersEnabled({
        evidenceActive: false,
        chipFiltersActive: false,
        enteredStartDate: "not-a-date",
        enteredEndDate: "",
      }),
    ).toBe(true);
  });

  it("leaves Clear disabled when no dates and no other filters are set", () => {
    expect(
      timelineClearFiltersEnabled({
        evidenceActive: false,
        chipFiltersActive: false,
        enteredStartDate: "",
        enteredEndDate: "   ",
      }),
    ).toBe(false);
  });

  it("clears both start and end URL params", () => {
    const params = new URLSearchParams("start=2026-10-20&end=2026-10-01&plantId=keep");
    const next = timelineDateParamsAfterSync(params, "", "");
    expect(next.get("start")).toBeNull();
    expect(next.get("end")).toBeNull();
    expect(next.get("plantId")).toBe("keep");
  });
});
