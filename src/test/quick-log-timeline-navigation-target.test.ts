/**
 * QuickLog "View in Timeline" confirmation — pure helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogTimelineNavTarget,
  QUICK_LOG_TIMELINE_CTA_LABEL,
} from "@/lib/quickLogTimelineNavigationTarget";

describe("buildQuickLogTimelineNavTarget", () => {
  it("plant scope without event id → /plants/<id>#timeline", () => {
    const t = buildQuickLogTimelineNavTarget({
      targetType: "plant",
      targetId: "plant-1",
    });
    expect(t).toEqual({
      path: "/plants/plant-1",
      hash: "timeline",
      href: "/plants/plant-1#timeline",
    });
  });

  it("tent scope without event id → /tents/<id>#timeline", () => {
    const t = buildQuickLogTimelineNavTarget({
      targetType: "tent",
      targetId: "tent-9",
    });
    expect(t.href).toBe("/tents/tent-9#timeline");
  });

  it("uses stable entry anchor when growEventId is supplied", () => {
    const t = buildQuickLogTimelineNavTarget({
      targetType: "plant",
      targetId: "plant-1",
      growEventId: "ge-abc",
    });
    expect(t.hash).toBe("timeline-entry-ge-abc");
    expect(t.href).toBe("/plants/plant-1#timeline-entry-ge-abc");
  });

  it("falls back to /timeline section when scope is missing", () => {
    const t = buildQuickLogTimelineNavTarget({
      targetType: null,
      targetId: null,
    });
    expect(t).toEqual({
      path: "/timeline",
      hash: "timeline",
      href: "/timeline#timeline",
    });
  });

  it("does not invent an entry anchor when growEventId is blank", () => {
    const t = buildQuickLogTimelineNavTarget({
      targetType: "plant",
      targetId: "plant-1",
      growEventId: "   ",
    });
    expect(t.hash).toBe("timeline");
  });

  it("exposes a stable, user-facing CTA label", () => {
    expect(QUICK_LOG_TIMELINE_CTA_LABEL).toBe("View in Timeline");
  });
});
