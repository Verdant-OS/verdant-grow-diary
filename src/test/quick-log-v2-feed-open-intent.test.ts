import { describe, expect, it } from "vitest";

import {
  QUICK_LOG_V2_FEED_OPEN_EVENT,
  buildQuickLogV2FeedOpenIntent,
  isQuickLogV2FeedOpenIntent,
} from "@/lib/quickLogV2FeedOpenIntent";

describe("Quick Log v2 Feed open intent", () => {
  it("builds exact plant and tent Feed intents", () => {
    expect(
      buildQuickLogV2FeedOpenIntent({
        plantId: "plant-1",
        tentId: "tent-1",
      }),
    ).toEqual({ targetKey: "plant:plant-1", action: "feed" });
    expect(
      buildQuickLogV2FeedOpenIntent({
        plantId: null,
        tentId: "tent-1",
      }),
    ).toEqual({ targetKey: "tent:tent-1", action: "feed" });
    expect(QUICK_LOG_V2_FEED_OPEN_EVENT).toBe("verdant:open-quicklog-v2-feed");
  });

  it("prefers the plant target when both identifiers exist", () => {
    expect(
      buildQuickLogV2FeedOpenIntent({
        plantId: "plant-first",
        tentId: "tent-fallback",
      }),
    ).toEqual({ targetKey: "plant:plant-first", action: "feed" });
  });

  it.each([
    null,
    undefined,
    {},
    { targetKey: "plant:", action: "feed" },
    { targetKey: "tent:   ", action: "feed" },
    { targetKey: "grow:g-1", action: "feed" },
    { targetKey: "plant:p:1", action: "feed" },
    { targetKey: "plant:p 1", action: "feed" },
    { targetKey: "plant:p-1", action: "water" },
    { targetKey: "plant:p-1", action: "feed", note: "must not pass through" },
  ])("rejects malformed, unknown, or non-closed detail %#", (detail) => {
    expect(isQuickLogV2FeedOpenIntent(detail)).toBe(false);
  });

  it("accepts only the closed two-field Feed shape", () => {
    expect(isQuickLogV2FeedOpenIntent({ targetKey: "plant:p-1", action: "feed" })).toBe(true);
    expect(isQuickLogV2FeedOpenIntent({ targetKey: "tent:t-9", action: "feed" })).toBe(true);
  });

  it("fails closed when a builder id is invalid", () => {
    expect(buildQuickLogV2FeedOpenIntent({ plantId: " ", tentId: "" })).toBeNull();
    expect(buildQuickLogV2FeedOpenIntent({ plantId: "plant 1", tentId: null })).toBeNull();
    expect(buildQuickLogV2FeedOpenIntent({ plantId: "plant:1", tentId: null })).toBeNull();
  });
});
