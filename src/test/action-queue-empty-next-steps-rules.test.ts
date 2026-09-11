/**
 * Pure contract for /actions empty-state next-step CTA destinations.
 *
 * Pins grower-intended Timeline + Sensors snapshot routes and fences the
 * adversarial FAIL destinations (/onboarding, /plants).
 */
import { describe, expect, it } from "vitest";
import {
  ACTION_QUEUE_EMPTY_FORBIDDEN_HREFS,
  ACTION_QUEUE_EMPTY_SENSORS_CTA_LABEL,
  ACTION_QUEUE_EMPTY_SENSORS_SNAPSHOT_HASH,
  ACTION_QUEUE_EMPTY_TIMELINE_CTA_LABEL,
  buildActionQueueEmptySensorsHref,
  buildActionQueueEmptyTimelineHref,
  isForbiddenActionQueueEmptyHref,
} from "@/lib/actionQueueEmptyNextStepsRules";

describe("actionQueueEmptyNextStepsRules", () => {
  it("labels match the empty-state CTA copy", () => {
    expect(ACTION_QUEUE_EMPTY_TIMELINE_CTA_LABEL).toBe("View Timeline");
    expect(ACTION_QUEUE_EMPTY_SENSORS_CTA_LABEL).toBe("Add Sensor Snapshot");
  });

  it("View Timeline targets grow-scoped /timeline, never /onboarding", () => {
    expect(buildActionQueueEmptyTimelineHref()).toBe("/timeline");
    expect(buildActionQueueEmptyTimelineHref({ growId: "g1" })).toBe("/timeline?growId=g1");
    expect(buildActionQueueEmptyTimelineHref({ growId: "  " })).toBe("/timeline");
    expect(
      isForbiddenActionQueueEmptyHref(buildActionQueueEmptyTimelineHref({ growId: "g1" })),
    ).toBe(false);
    expect(buildActionQueueEmptyTimelineHref({ growId: "g1" })).not.toContain("/onboarding");
  });

  it("Add Sensor Snapshot targets /sensors#manual-reading, never /plants", () => {
    expect(buildActionQueueEmptySensorsHref()).toBe(
      `/sensors#${ACTION_QUEUE_EMPTY_SENSORS_SNAPSHOT_HASH}`,
    );
    expect(buildActionQueueEmptySensorsHref({ growId: "g1" })).toBe(
      `/sensors?growId=g1#${ACTION_QUEUE_EMPTY_SENSORS_SNAPSHOT_HASH}`,
    );
    expect(
      isForbiddenActionQueueEmptyHref(buildActionQueueEmptySensorsHref({ growId: "g1" })),
    ).toBe(false);
    expect(buildActionQueueEmptySensorsHref({ growId: "g1" })).not.toContain("/plants");
  });

  it("fences the adversarial FAIL destinations", () => {
    expect(ACTION_QUEUE_EMPTY_FORBIDDEN_HREFS).toEqual(["/onboarding", "/plants"]);
    for (const href of ACTION_QUEUE_EMPTY_FORBIDDEN_HREFS) {
      expect(isForbiddenActionQueueEmptyHref(href)).toBe(true);
    }
    expect(isForbiddenActionQueueEmptyHref("/onboarding?x=1")).toBe(true);
    expect(isForbiddenActionQueueEmptyHref("/plants?growId=g1")).toBe(true);
    expect(isForbiddenActionQueueEmptyHref("")).toBe(true);
  });
});
