import { describe, it, expect } from "vitest";
import {
  classifyQuickLogActionFamily,
  planQuickLogActionSwitchReset,
} from "@/lib/quickLogActionSwitchResetRules";

describe("classifyQuickLogActionFamily", () => {
  it("maps harvest and cure_check to the harvest family", () => {
    expect(classifyQuickLogActionFamily("harvest")).toBe("harvest");
    expect(classifyQuickLogActionFamily("cure_check")).toBe("harvest");
  });

  it("maps feeding / environment / maturity families", () => {
    expect(classifyQuickLogActionFamily("feeding")).toBe("feeding");
    expect(classifyQuickLogActionFamily("environment")).toBe("environment");
    expect(classifyQuickLogActionFamily("maturity_evidence")).toBe("maturity");
    expect(classifyQuickLogActionFamily("maturity")).toBe("maturity");
  });

  it("treats unknown / empty / null as 'other'", () => {
    expect(classifyQuickLogActionFamily("observation")).toBe("other");
    expect(classifyQuickLogActionFamily("")).toBe("other");
    expect(classifyQuickLogActionFamily(null)).toBe("other");
    expect(classifyQuickLogActionFamily(undefined)).toBe("other");
  });

  it("is case + whitespace tolerant", () => {
    expect(classifyQuickLogActionFamily("  HARVEST ")).toBe("harvest");
  });
});

describe("planQuickLogActionSwitchReset", () => {
  it("is a no-op when the family does not change", () => {
    const plan = planQuickLogActionSwitchReset("observation", "photo");
    expect(plan.changed).toBe(false);
    expect(plan.clearHarvest).toBe(false);
    expect(plan.clearFeeding).toBe(false);
    expect(plan.clearEnvironment).toBe(false);
    expect(plan.clearMaturity).toBe(false);
    expect(plan.clearSaveStatus).toBe(false);
  });

  it("harvest → observation clears harvest + save status only", () => {
    const plan = planQuickLogActionSwitchReset("harvest", "observation");
    expect(plan.changed).toBe(true);
    expect(plan.clearHarvest).toBe(true);
    expect(plan.clearFeeding).toBe(false);
    expect(plan.clearEnvironment).toBe(false);
    expect(plan.clearMaturity).toBe(false);
    expect(plan.clearSaveStatus).toBe(true);
  });

  it("feeding → observation clears feeding + save status only", () => {
    const plan = planQuickLogActionSwitchReset("feeding", "observation");
    expect(plan.clearFeeding).toBe(true);
    expect(plan.clearHarvest).toBe(false);
    expect(plan.clearSaveStatus).toBe(true);
  });

  it("maturity → observation clears maturity + save status only", () => {
    const plan = planQuickLogActionSwitchReset("maturity_evidence", "observation");
    expect(plan.clearMaturity).toBe(true);
    expect(plan.clearHarvest).toBe(false);
    expect(plan.clearFeeding).toBe(false);
    expect(plan.clearSaveStatus).toBe(true);
  });

  it("environment → observation clears environment fields", () => {
    const plan = planQuickLogActionSwitchReset("environment", "observation");
    expect(plan.clearEnvironment).toBe(true);
    expect(plan.clearFeeding).toBe(false);
    expect(plan.clearHarvest).toBe(false);
  });

  it("observation → harvest does NOT clear harvest fields (entering harvest fresh)", () => {
    const plan = planQuickLogActionSwitchReset("observation", "harvest");
    expect(plan.changed).toBe(true);
    expect(plan.clearHarvest).toBe(false);
    expect(plan.clearSaveStatus).toBe(true);
  });

  it("harvest → cure_check is a no-op (same family)", () => {
    const plan = planQuickLogActionSwitchReset("harvest", "cure_check");
    expect(plan.changed).toBe(false);
    expect(plan.clearSaveStatus).toBe(false);
  });

  it("switching always clears save status when family changes", () => {
    for (const [a, b] of [
      ["harvest", "feeding"],
      ["feeding", "environment"],
      ["environment", "harvest"],
      ["observation", "feeding"],
    ] as const) {
      expect(planQuickLogActionSwitchReset(a, b).clearSaveStatus).toBe(true);
    }
  });

  it("never returns fields outside the scoped-reset contract", () => {
    // The plan shape does not include target/note/stage/snapshot — those
    // must be preserved by callers. This test locks the surface area.
    const plan = planQuickLogActionSwitchReset("harvest", "feeding");
    expect(Object.keys(plan).sort()).toEqual(
      [
        "changed",
        "clearEnvironment",
        "clearFeeding",
        "clearHarvest",
        "clearMaturity",
        "clearSaveStatus",
      ].sort(),
    );
  });
});
