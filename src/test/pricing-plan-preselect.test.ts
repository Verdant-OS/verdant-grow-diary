/**
 * Pure unit tests for pricingPlanPreselect helpers.
 */
import { describe, it, expect } from "vitest";
import {
  resolvePricingPlanPreselect,
  isPreselectPlanId,
} from "@/lib/pricingPlanPreselect";

describe("resolvePricingPlanPreselect", () => {
  it("maps canonical plan ids to preselect + billing", () => {
    expect(resolvePricingPlanPreselect("pro_monthly")).toEqual({
      plan: "pro_monthly",
      billing: "monthly",
    });
    expect(resolvePricingPlanPreselect("pro_annual")).toEqual({
      plan: "pro_annual",
      billing: "annual",
    });
    expect(resolvePricingPlanPreselect("founder_lifetime")).toEqual({
      plan: "founder_lifetime",
      billing: null,
    });
  });

  it("normalizes case", () => {
    expect(resolvePricingPlanPreselect("Pro_Monthly").plan).toBe("pro_monthly");
    expect(resolvePricingPlanPreselect("FOUNDER_LIFETIME").plan).toBe(
      "founder_lifetime",
    );
  });

  it("returns null preselect for unknown / missing / empty input", () => {
    for (const v of [null, undefined, "", "free", "enterprise", "pro-monthly"]) {
      expect(resolvePricingPlanPreselect(v)).toEqual({ plan: null, billing: null });
    }
  });

  it("never returns a paid preselect for unrelated values", () => {
    for (const v of ["basic", "team", "pro", "annual", "monthly"]) {
      expect(resolvePricingPlanPreselect(v).plan).toBeNull();
    }
  });
});

describe("isPreselectPlanId", () => {
  it("accepts canonical PlanIds only", () => {
    expect(isPreselectPlanId("pro_monthly")).toBe(true);
    expect(isPreselectPlanId("pro_annual")).toBe(true);
    expect(isPreselectPlanId("founder_lifetime")).toBe(true);
  });
  it("rejects everything else", () => {
    for (const v of [null, undefined, "", "free", "pro-monthly", 42]) {
      expect(isPreselectPlanId(v)).toBe(false);
    }
  });
});
