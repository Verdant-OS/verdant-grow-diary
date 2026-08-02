/**
 * Quick Log → canonical grow-scoped Timeline navigation target.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogTimelineNavTarget,
  QUICK_LOG_TIMELINE_CTA_LABEL,
} from "@/lib/quickLogTimelineNavigationTarget";

describe("buildQuickLogTimelineNavTarget", () => {
  it("builds the exact grow + plant + tent + event deep link", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
      growEventId: "event-1",
    });

    expect(target).toEqual({
      path: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1",
      hash: "timeline-entry-event-1",
      href: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1#timeline-entry-event-1",
    });
  });

  it("builds a grow-scoped tent target without a plant filter", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "tent",
      targetId: "tent-9",
      growEventId: "event-9",
    });

    expect(target?.href).toBe("/timeline?growId=grow-1&tentId=tent-9#timeline-entry-event-9");
    expect(target?.href).not.toContain("plantId=");
  });

  it("keeps a feed-style grow target scoped even when only tent context remains", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: null,
      targetId: null,
      tentId: "tent-1",
      growEventId: "feeding-event",
    });

    expect(target?.href).toBe("/timeline?growId=grow-1&tentId=tent-1#timeline-entry-feeding-event");
  });

  it("does not invent a hash when the writer returns no event id", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
      growEventId: null,
    });

    expect(target).toMatchObject({
      path: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1",
      hash: "",
      href: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1",
    });
    expect(target?.href).not.toContain("#timeline");
  });

  it("fails closed when the confirmed grow id is missing or blank", () => {
    for (const growId of [null, undefined, "", "   "]) {
      expect(
        buildQuickLogTimelineNavTarget({
          growId,
          targetType: "plant",
          targetId: "plant-1",
          growEventId: "event-1",
        }),
      ).toBeNull();
    }
  });

  it("emits a grow-only Timeline path when no entity filter is known", () => {
    expect(
      buildQuickLogTimelineNavTarget({
        growId: "grow-1",
        targetType: null,
        targetId: null,
      }),
    ).toEqual({
      path: "/timeline?growId=grow-1",
      hash: "",
      href: "/timeline?growId=grow-1",
    });
  });

  it("drops an unsafe event anchor instead of emitting an invalid fragment", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      growEventId: "not safe / event",
    });

    expect(target?.hash).toBe("");
    expect(target?.href).toBe("/timeline?growId=grow-1&plantId=plant-1");
  });

  it("URL-encodes every id deterministically", () => {
    const target = buildQuickLogTimelineNavTarget({
      growId: "grow / 1",
      targetType: "plant",
      targetId: "plant/1",
      tentId: "tent one",
    });

    expect(target?.href).toBe("/timeline?growId=grow%20%2F%201&plantId=plant%2F1&tentId=tent+one");
  });

  it("exposes the approved post-save CTA label", () => {
    expect(QUICK_LOG_TIMELINE_CTA_LABEL).toBe("View diary");
  });
});
