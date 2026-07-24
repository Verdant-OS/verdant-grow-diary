import { describe, expect, it } from "vitest";

import { resolveMobileQuickLogTarget } from "@/lib/quickLogRouteTargetRules";

const TENT_ID = "30000000-0000-4000-8000-000000000001";

describe("resolveMobileQuickLogTarget", () => {
  it("returns a tent-scoped target for a real Tent Detail UUID", () => {
    expect(resolveMobileQuickLogTarget(`/tents/${TENT_ID}`)).toBe(`tent:${TENT_ID}`);
    expect(resolveMobileQuickLogTarget(`/tents/${TENT_ID}/`)).toBe(`tent:${TENT_ID}`);
  });

  it.each(["/tents", "/tents/new", "/plants/plant-1", "/", ""])(
    "fails closed for %s",
    (pathname) => {
      expect(resolveMobileQuickLogTarget(pathname)).toBeNull();
    },
  );

  it("rejects malformed, encoded-slash, and non-string inputs", () => {
    expect(resolveMobileQuickLogTarget("/tents/t1")).toBeNull();
    expect(resolveMobileQuickLogTarget("/tents/%2Fetc")).toBeNull();
    expect(resolveMobileQuickLogTarget(null)).toBeNull();
  });
});
