/**
 * QuickLog "View in Timeline" confirmation — pure helper tests.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogTimelineNavTarget,
  QUICK_LOG_TIMELINE_CTA_LABEL,
} from "@/lib/quickLogTimelineNavigationTarget";

describe("buildQuickLogTimelineNavTarget", () => {
  it("builds the canonical grow-scoped Timeline URL with plant and tent context", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
      growEventId: "ge-abc",
    });
    expect(t).toEqual({
      path: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1",
      hash: "timeline-entry-ge-abc",
      href: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-ge-abc",
    });
  });

  it("uses a tent target as optional Timeline context", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "tent",
      targetId: "tent-9",
    });
    expect(t).toEqual({
      path: "/timeline?growId=grow-1&tentId=tent-9",
      hash: null,
      href: "/timeline?growId=grow-1&tentId=tent-9",
    });
  });

  it("supports explicit plant/tent context and encodes both opaque ids", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow / one",
      plantId: "plant / one",
      tentId: "tent & two",
    });
    expect(t?.path).toBe(
      "/timeline?growId=grow%20%2F%20one&plantId=plant%20%2F%20one&tentId=tent%20%26%20two",
    );
  });

  it("adds an anchor only when the save returned a real grow event id", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      growEventId: "ge-abc",
    });
    expect(t).toEqual({
      path: "/timeline?growId=grow-1",
      hash: "timeline-entry-ge-abc",
      href: "/timeline?growId=grow-1#timeline-entry-ge-abc",
    });
  });

  it("never creates a synthetic section anchor when the grow event id is missing", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      growEventId: "   ",
    });
    expect(t).toEqual({
      path: "/timeline?growId=grow-1",
      hash: null,
      href: "/timeline?growId=grow-1",
    });
    expect(t?.href).not.toContain("#timeline");
  });

  it("does not turn an unsafe grow event id into a URL fragment", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      growEventId: "bad/event?id",
    });
    expect(t).toEqual({
      path: "/timeline?growId=grow-1",
      hash: null,
      href: "/timeline?growId=grow-1",
    });
  });

  it.each([null, undefined, "", "   "])("fails closed when growId is %p", (growId) => {
    expect(
      buildQuickLogTimelineNavTarget({
        growId,
        targetType: "plant",
        targetId: "plant-1",
      }),
    ).toBeNull();
  });

  it("exposes a stable, user-facing CTA label", () => {
    expect(QUICK_LOG_TIMELINE_CTA_LABEL).toBe("View diary");
  });
});
