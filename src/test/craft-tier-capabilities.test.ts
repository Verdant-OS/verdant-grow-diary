/**
 * Craft tier capability invariants. Locks the product decision: Craft is a
 * recurring tier with the Blueprint overlay + a larger AI-credit bucket;
 * the `blueprint` capability is Craft-exclusive plus Founder.
 */
import { describe, it, expect } from "vitest";

import { PLAN_CATALOG, KNOWN_PLAN_IDS, isKnownPlanId } from "@/lib/entitlements/planCatalog";

describe("Craft tier capabilities", () => {
  it("registers both craft plan ids with identical capabilities", () => {
    expect(KNOWN_PLAN_IDS).toContain("craft_monthly");
    expect(KNOWN_PLAN_IDS).toContain("craft_annual");
    expect(isKnownPlanId("craft_monthly")).toBe(true);
    expect(isKnownPlanId("craft_annual")).toBe(true);
    expect(PLAN_CATALOG.craft_monthly).toEqual(PLAN_CATALOG.craft_annual);
  });

  it("Craft grants the Blueprint, everything Pro has, and 300 AI credits/mo", () => {
    const craft = PLAN_CATALOG.craft_monthly;
    expect(craft.blueprint).toBe(true);
    expect(craft.aiMonthlyCredits).toBe(300);
    expect(craft.liveSensors).toBe(true);
    expect(craft.multiTent).toBe(true);
    expect(craft.advancedExports).toBe(true);
    expect(craft.maxActiveGrows).toBeNull();
  });

  it("Blueprint is Craft-exclusive plus Founder — NOT Pro or Free", () => {
    expect(PLAN_CATALOG.craft_monthly.blueprint).toBe(true);
    expect(PLAN_CATALOG.founder_lifetime.blueprint).toBe(true);
    expect(PLAN_CATALOG.pro_monthly.blueprint).toBe(false);
    expect(PLAN_CATALOG.pro_annual.blueprint).toBe(false);
    expect(PLAN_CATALOG.free.blueprint).toBe(false);
  });

  it("keeps the Founder AI-credit hard-pin at 100 (not Craft's 300)", () => {
    expect(PLAN_CATALOG.founder_lifetime.aiMonthlyCredits).toBe(100);
    expect(PLAN_CATALOG.pro_monthly.aiMonthlyCredits).toBe(100);
  });
});
