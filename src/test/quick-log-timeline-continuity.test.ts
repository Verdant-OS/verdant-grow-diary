/**
 * Verdant Quick Log Timeline Continuity v1 — pure rule tests for the
 * post-save "Saved to Timeline" confirmation + /timeline link builder.
 *
 * Never tests writes. Never asserts saved-data shape from drafts.
 */
import { describe, it, expect } from "vitest";
import {
  DAILY_CHECK_TIMELINE_CONFIRMATION_BODY,
  DAILY_CHECK_TIMELINE_CONFIRMATION_TITLE,
  DAILY_CHECK_TIMELINE_CTA_LABEL,
  buildDailyCheckTimelineHref,
} from "@/lib/dailyCheckPostSubmitRules";

describe("Quick Log → Timeline continuity copy", () => {
  it("uses calm, non-certainty post-save title and CTA", () => {
    expect(DAILY_CHECK_TIMELINE_CONFIRMATION_TITLE).toBe("Saved to Timeline");
    expect(DAILY_CHECK_TIMELINE_CTA_LABEL).toBe("View on Timeline");
    const all =
      `${DAILY_CHECK_TIMELINE_CONFIRMATION_TITLE} ${DAILY_CHECK_TIMELINE_CONFIRMATION_BODY} ${DAILY_CHECK_TIMELINE_CTA_LABEL}`.toLowerCase();
    expect(all).not.toMatch(/\bhealthy\b/);
    expect(all).not.toMatch(/\bperfect\b/);
    expect(all).not.toMatch(/\blive\b/);
    expect(all).not.toMatch(/guaranteed/);
  });
});

describe("buildDailyCheckTimelineHref · preserves context, invents nothing", () => {
  it("returns bare /timeline when nothing is known", () => {
    expect(buildDailyCheckTimelineHref({ growId: null })).toBe("/timeline");
    expect(
      buildDailyCheckTimelineHref({ growId: "", plantId: "", tentId: "" }),
    ).toBe("/timeline");
    expect(
      buildDailyCheckTimelineHref({ growId: "   ", plantId: "   " }),
    ).toBe("/timeline");
  });

  it("preserves growId when provided", () => {
    expect(buildDailyCheckTimelineHref({ growId: "g-1" })).toBe(
      "/timeline?growId=g-1",
    );
  });

  it("preserves growId + plantId + tentId together", () => {
    expect(
      buildDailyCheckTimelineHref({ growId: "g-1", plantId: "p-2", tentId: "t-3" }),
    ).toBe("/timeline?growId=g-1&plantId=p-2&tentId=t-3");
  });

  it("emits plantId/tentId even without growId — never invents IDs", () => {
    expect(buildDailyCheckTimelineHref({ growId: null, plantId: "p-2" })).toBe(
      "/timeline?plantId=p-2",
    );
    expect(
      buildDailyCheckTimelineHref({ growId: undefined, tentId: "t-3" }),
    ).toBe("/timeline?tentId=t-3");
  });

  it("is deterministic and trims whitespace", () => {
    const a = buildDailyCheckTimelineHref({ growId: " g-1 ", plantId: " p-2 " });
    const b = buildDailyCheckTimelineHref({ growId: "g-1", plantId: "p-2" });
    expect(a).toBe(b);
    expect(a).toBe("/timeline?growId=g-1&plantId=p-2");
  });
});
