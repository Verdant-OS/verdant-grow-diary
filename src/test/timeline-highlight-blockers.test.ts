import { describe, it, expect } from "vitest";
import {
  detectTimelineHighlightBlockers,
  formatTimelineHighlightBlockersLine,
  TIMELINE_HIGHLIGHT_NO_BLOCKERS_COPY,
} from "@/lib/timelineHighlightRules";

describe("detectTimelineHighlightBlockers", () => {
  it("returns [] for null/empty input and default filters", () => {
    expect(detectTimelineHighlightBlockers(null)).toEqual([]);
    expect(
      detectTimelineHighlightBlockers({
        searchQuery: "",
        stageFilter: "all",
        eventFilter: "all",
        plantFilter: "",
        tentFilter: "",
        sensorSourceCount: 0,
      }),
    ).toEqual([]);
  });

  it("flags every active blocker in stable order", () => {
    expect(
      detectTimelineHighlightBlockers({
        searchQuery: "rust",
        stageFilter: "flower",
        eventFilter: "photo",
        plantFilter: "plant-1",
        tentFilter: "tent-1",
        sensorSourceCount: 2,
      }),
    ).toEqual(["search", "stage", "event type", "plant", "tent", "sensor source"]);
  });

  it("treats whitespace-only search as inactive", () => {
    expect(
      detectTimelineHighlightBlockers({ searchQuery: "   " }),
    ).toEqual([]);
  });
});

describe("formatTimelineHighlightBlockersLine", () => {
  it("returns null when no blockers and copy fallback is calm", () => {
    expect(formatTimelineHighlightBlockersLine([])).toBeNull();
    expect(formatTimelineHighlightBlockersLine(null)).toBeNull();
    expect(TIMELINE_HIGHLIGHT_NO_BLOCKERS_COPY).toMatch(/No active filters/i);
  });

  it("formats blockers into a single human-readable line", () => {
    expect(
      formatTimelineHighlightBlockersLine(["search", "stage"]),
    ).toBe("Active filters: search, stage.");
  });

  it("never includes raw UUIDs", () => {
    const line = formatTimelineHighlightBlockersLine([
      "search",
      "plant",
      "tent",
    ]) ?? "";
    expect(line).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
  });
});
