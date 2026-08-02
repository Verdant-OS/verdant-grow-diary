/**
 * QuickLog "View diary" confirmation — pure helper tests.
 *
 * Contract (#675): every confirmed save routes to the grow-scoped
 * global Timeline. Plant/Tent Detail destinations are forbidden.
 * Missing growId never enables a CTA.
 */
import { describe, it, expect } from "vitest";
import {
  buildQuickLogTimelineNavTarget,
  QUICK_LOG_TIMELINE_CTA_LABEL,
} from "@/lib/quickLogTimelineNavigationTarget";

describe("buildQuickLogTimelineNavTarget", () => {
  it("plant target with growId emits grow-scoped Timeline + plantId filter", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
    });
    expect(t).toEqual({
      path: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1",
      hash: "",
      href: "/timeline?growId=grow-1&plantId=plant-1&tentId=tent-1",
    });
  });

  it("tent target with growId emits grow-scoped Timeline + tentId filter", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-9",
      targetType: "tent",
      targetId: "tent-9",
    });
    expect(t?.href).toBe("/timeline?growId=grow-9&tentId=tent-9");
    expect(t?.path).not.toMatch(/^\/tents\//);
    expect(t?.path).not.toMatch(/^\/plants\//);
  });

  it("uses stable entry anchor when growEventId is supplied", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      growEventId: "ge-abc",
    });
    expect(t?.hash).toBe("timeline-entry-ge-abc");
    expect(t?.href).toBe("/timeline?growId=grow-1&plantId=plant-1#timeline-entry-ge-abc");
  });

  it("feed handoff retains the verified grow (never unscoped)", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-feed",
      targetType: "plant",
      targetId: "plant-1",
      tentId: "tent-1",
      growEventId: "ge-feed",
    });
    expect(t).not.toBeNull();
    expect(t!.path).toContain("growId=grow-feed");
    expect(t!.path).toMatch(/^\/timeline\?/);
    expect(t!.href).not.toBe("/timeline");
    expect(t!.href).not.toMatch(/^\/timeline#/);
  });

  it("returns null when growId is missing so CTA stays disabled", () => {
    expect(
      buildQuickLogTimelineNavTarget({
        growId: null,
        targetType: "plant",
        targetId: "plant-1",
      }),
    ).toBeNull();
    expect(
      buildQuickLogTimelineNavTarget({
        growId: "   ",
        targetType: "tent",
        targetId: "tent-1",
      }),
    ).toBeNull();
    expect(
      buildQuickLogTimelineNavTarget({
        growId: undefined,
        targetType: null,
        targetId: null,
      }),
    ).toBeNull();
  });

  it("does not invent an entry anchor when growEventId is blank", () => {
    const t = buildQuickLogTimelineNavTarget({
      growId: "grow-1",
      targetType: "plant",
      targetId: "plant-1",
      growEventId: "   ",
    });
    expect(t?.hash).toBe("");
    expect(t?.href).not.toContain("#");
  });

  it("URL-encodes ids and is deterministic", () => {
    const scope = {
      growId: "grow/a b",
      plantId: "plant&1",
      tentId: "tent=2",
      growEventId: "ge-1",
    };
    const a = buildQuickLogTimelineNavTarget(scope);
    const b = buildQuickLogTimelineNavTarget(scope);
    expect(a).toEqual(b);
    expect(a?.path).toContain(encodeURIComponent("grow/a b"));
    expect(a?.path).toContain(encodeURIComponent("plant&1"));
    expect(a?.path).toContain(encodeURIComponent("tent=2"));
  });

  it("never routes to plant or tent detail", () => {
    for (const scope of [
      { growId: "g1", targetType: "plant" as const, targetId: "p1" },
      { growId: "g1", targetType: "tent" as const, targetId: "t1" },
      { growId: "g1", plantId: "p1", tentId: "t1", growEventId: "e1" },
    ]) {
      const t = buildQuickLogTimelineNavTarget(scope);
      expect(t?.path.startsWith("/timeline?")).toBe(true);
      expect(t?.href).not.toMatch(/^\/plants\//);
      expect(t?.href).not.toMatch(/^\/tents\//);
    }
  });

  it("exposes a stable, user-facing CTA label", () => {
    expect(QUICK_LOG_TIMELINE_CTA_LABEL).toBe("View diary");
  });
});
