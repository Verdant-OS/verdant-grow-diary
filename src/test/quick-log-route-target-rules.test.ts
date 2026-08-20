import { describe, expect, it } from "vitest";

import {
  resolveMobileQuickLogTarget,
  resolvePlantQuickLogRouteTarget,
} from "@/lib/quickLogRouteTargetRules";

const TENT_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "40000000-0000-4000-8000-000000000001";

describe("resolveMobileQuickLogTarget", () => {
  it("returns a tent-scoped target for a real Tent Detail UUID", () => {
    expect(resolveMobileQuickLogTarget(`/tents/${TENT_ID}`)).toBe(`tent:${TENT_ID}`);
    expect(resolveMobileQuickLogTarget(`/tents/${TENT_ID}/`)).toBe(`tent:${TENT_ID}`);
  });

  it("uses matching sole-active-plant evidence", () => {
    expect(
      resolveMobileQuickLogTarget(`/tents/${TENT_ID}`, {
        tentId: TENT_ID,
        soleActivePlantId: PLANT_ID,
      }),
    ).toBe(`plant:${PLANT_ID}`);
  });

  it("never guesses a plant when the current tent has zero or several", () => {
    expect(
      resolveMobileQuickLogTarget(`/tents/${TENT_ID}`, {
        tentId: TENT_ID,
        soleActivePlantId: null,
      }),
    ).toBe(`tent:${TENT_ID}`);
  });

  it("fails back to the tent for malformed or stale sole-plant evidence", () => {
    expect(
      resolveMobileQuickLogTarget(`/tents/${TENT_ID}`, {
        tentId: TENT_ID,
        soleActivePlantId: "not-a-uuid",
      }),
    ).toBe(`tent:${TENT_ID}`);
    expect(
      resolveMobileQuickLogTarget(`/tents/${TENT_ID}`, {
        tentId: "30000000-0000-4000-8000-000000000002",
        soleActivePlantId: PLANT_ID,
      }),
    ).toBe(`tent:${TENT_ID}`);
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

describe("resolvePlantQuickLogRouteTarget", () => {
  it("returns the exact plant UUID from Plant Detail", () => {
    expect(resolvePlantQuickLogRouteTarget(`/plants/${PLANT_ID}`)).toBe(PLANT_ID);
    expect(resolvePlantQuickLogRouteTarget(`/plants/${PLANT_ID}/`)).toBe(PLANT_ID);
  });

  it.each(["/plants", "/plants/new", "/tents/plant-1", "/plants/%2Fetc", "/plants/%E0%A4%A"])(
    "fails closed for %s",
    (pathname) => {
      expect(resolvePlantQuickLogRouteTarget(pathname)).toBeNull();
    },
  );

  it("fails closed for non-string input", () => {
    expect(resolvePlantQuickLogRouteTarget(null)).toBeNull();
  });
});
