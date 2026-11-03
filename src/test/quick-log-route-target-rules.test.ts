import { describe, expect, it } from "vitest";

import {
  didQuickLogDetailRouteChange,
  resolveMobileQuickLogTarget,
  resolvePlantQuickLogRouteTarget,
  resolveQuickLogDetailRouteIdentity,
} from "@/lib/quickLogRouteTargetRules";

const TENT_ID = "30000000-0000-4000-8000-000000000001";
const PLANT_ID = "40000000-0000-4000-8000-000000000001";
const OTHER_TENT_ID = "30000000-0000-4000-8000-000000000002";
const OTHER_PLANT_ID = "40000000-0000-4000-8000-000000000002";

describe("Quick Log detail route identity", () => {
  it("identifies authenticated plant and tent detail resources", () => {
    expect(resolveQuickLogDetailRouteIdentity(`/plants/${PLANT_ID}`)).toBe(`plant:${PLANT_ID}`);
    expect(resolveQuickLogDetailRouteIdentity(`/tents/${TENT_ID}/`)).toBe(`tent:${TENT_ID}`);
  });

  it("fails closed for malformed or non-detail paths", () => {
    expect(resolveQuickLogDetailRouteIdentity("/plants/plant-1")).toBeNull();
    expect(resolveQuickLogDetailRouteIdentity("/tents/%2Fetc")).toBeNull();
    expect(resolveQuickLogDetailRouteIdentity("/tents")).toBeNull();
    expect(resolveQuickLogDetailRouteIdentity(null)).toBeNull();
  });

  it("detects a different UUID within plant and tent detail routes", () => {
    expect(didQuickLogDetailRouteChange(`plant:${PLANT_ID}`, `plant:${OTHER_PLANT_ID}`)).toBe(true);
    expect(didQuickLogDetailRouteChange(`tent:${TENT_ID}`, `tent:${OTHER_TENT_ID}`)).toBe(true);
  });

  it("does not treat a stable route identity or an unrecognized path as a change", () => {
    expect(didQuickLogDetailRouteChange(`plant:${PLANT_ID}`, `plant:${PLANT_ID}`)).toBe(false);
    expect(didQuickLogDetailRouteChange(`tent:${TENT_ID}`, `tent:${TENT_ID}`)).toBe(false);
    expect(didQuickLogDetailRouteChange(null, `plant:${PLANT_ID}`)).toBe(false);
    expect(didQuickLogDetailRouteChange(`plant:${PLANT_ID}`, null)).toBe(false);
  });
});

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
