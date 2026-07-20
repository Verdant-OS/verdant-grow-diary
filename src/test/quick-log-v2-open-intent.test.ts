import { describe, expect, it } from "vitest";

import {
  QUICK_LOG_V2_OPEN_EVENT,
  buildQuickLogV2OpenIntent,
  isQuickLogV2OpenIntent,
} from "@/lib/quickLogV2OpenIntent";

describe("Quick Log v2 open intent", () => {
  it("builds exact plant and tent Water intents", () => {
    expect(
      buildQuickLogV2OpenIntent({
        plantId: "plant-1",
        tentId: "tent-1",
        action: "water",
      }),
    ).toEqual({ targetKey: "plant:plant-1", action: "water" });
    expect(
      buildQuickLogV2OpenIntent({
        plantId: null,
        tentId: "tent-1",
        action: "water",
      }),
    ).toEqual({ targetKey: "tent:tent-1", action: "water" });
    expect(QUICK_LOG_V2_OPEN_EVENT).toBe("verdant:open-quicklog-v2");
  });

  it("prefers the plant target when both identifiers exist", () => {
    expect(
      buildQuickLogV2OpenIntent({
        plantId: "plant-first",
        tentId: "tent-fallback",
        action: "water",
      }),
    ).toEqual({ targetKey: "plant:plant-first", action: "water" });
  });

  it.each([
    null,
    undefined,
    {},
    { targetKey: "plant:", action: "water" },
    { targetKey: "tent:   ", action: "water" },
    { targetKey: "grow:g-1", action: "water" },
    { targetKey: "plant:p:1", action: "water" },
    { targetKey: "plant:p 1", action: "water" },
    { targetKey: "plant:p-1", action: "feed" },
    { targetKey: "plant:p-1", action: "water", note: "must not pass through" },
  ])("rejects malformed, unknown, or non-closed detail %#", (detail) => {
    expect(isQuickLogV2OpenIntent(detail)).toBe(false);
  });

  it("fails closed when a builder id or action is invalid", () => {
    expect(
      buildQuickLogV2OpenIntent({ plantId: " ", tentId: "", action: "water" }),
    ).toBeNull();
    expect(
      buildQuickLogV2OpenIntent({ plantId: "plant 1", tentId: null, action: "water" }),
    ).toBeNull();
    expect(
      buildQuickLogV2OpenIntent({ plantId: "plant-1", tentId: null, action: "feed" }),
    ).toBeNull();
  });
});
