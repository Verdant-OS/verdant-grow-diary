import { describe, expect, it } from "vitest";
import {
  buildTimelineGrowSwitcher,
  timelineGrowSwitchSearch,
} from "@/lib/timelineGrowSwitcherRules";

describe("timeline grow switcher rules (item 16)", () => {
  const grows = [
    { id: "a", name: "Skunk Gas Run" },
    { id: "b", name: "  " },
  ];
  it("lists grows, labels unnamed ones, and selects the active grow", () => {
    expect(buildTimelineGrowSwitcher({ grows, activeGrowId: "a" })).toEqual({
      value: "a",
      options: [
        { id: "a", label: "Skunk Gas Run" },
        { id: "b", label: "Untitled grow" },
      ],
    });
  });
  it("leaves nothing selected for an unknown active grow, and is null under two grows", () => {
    expect(buildTimelineGrowSwitcher({ grows, activeGrowId: "zz" })?.value).toBe("");
    expect(buildTimelineGrowSwitcher({ grows: [grows[0]], activeGrowId: "a" })).toBeNull();
    expect(buildTimelineGrowSwitcher({ grows: null, activeGrowId: null })).toBeNull();
  });
  it("rewrites only growId and drops grow-specific params", () => {
    const next = timelineGrowSwitchSearch(
      new URLSearchParams("growId=a&plantId=p&tentId=t&entry=e&from=2026-11-01&sources=live"),
      "b",
    );
    expect(Object.fromEntries(next)).toEqual({ growId: "b", from: "2026-11-01", sources: "live" });
  });
});
