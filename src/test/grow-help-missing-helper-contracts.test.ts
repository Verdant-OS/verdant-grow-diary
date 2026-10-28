import { describe, expect, it, vi } from "vitest";
import {
  calculateWhenReady,
  hasCompleteFivePointReading,
  hasNutrientPrimaryResult,
  hasPositiveCanopyDimensions,
  isExpenseSummaryReady,
} from "@/lib/growHelpToolkitReadiness";
import { createDefaultGrowHelpToolkitState } from "@/lib/growHelpToolkitState";

describe("missing helpers that the grow help toolkit imports", () => {
  it("returns a null result without calling the calculator when inputs are not ready", () => {
    const calculate = vi.fn(() => 7);
    expect(calculateWhenReady(false, calculate)).toEqual({ value: null, error: null });
    expect(calculate).not.toHaveBeenCalled();
  });

  it("returns the calculator value or a caught error message", () => {
    expect(calculateWhenReady(true, () => 7)).toEqual({ value: 7, error: null });
    expect(
      calculateWhenReady(true, () => {
        throw new Error("Target must be positive.");
      }),
    ).toEqual({ value: null, error: "Target must be positive." });
  });

  it("requires positive canopy dimensions and all five PAR points", () => {
    const state = createDefaultGrowHelpToolkitState();
    expect(hasPositiveCanopyDimensions(state.light)).toBe(false);
    expect(hasCompleteFivePointReading(state.light)).toBe(false);

    state.light.canopyLength = 4;
    expect(hasPositiveCanopyDimensions(state.light)).toBe(false);
    state.light.canopyWidth = 2;
    state.light.fivePoint = {
      center: 1,
      frontLeft: 1,
      frontRight: 1,
      backLeft: 1,
      backRight: null,
    };
    expect(hasPositiveCanopyDimensions(state.light)).toBe(true);
    expect(hasCompleteFivePointReading(state.light)).toBe(false);
    state.light.fivePoint.backRight = 1;
    expect(hasCompleteFivePointReading(state.light)).toBe(true);
  });

  it("keeps the expense summary closed when a required shared input is cleared", () => {
    const state = createDefaultGrowHelpToolkitState();
    state.cycle.vegDays = 21;
    state.cycle.flowerDays = 56;
    state.cycle.electricityRate = 0.16;
    expect(isExpenseSummaryReady(state.expense, state.cycle)).toBe(true);
    state.expense.amortizationCycles = null;
    expect(isExpenseSummaryReady(state.expense, state.cycle)).toBe(false);
  });

  it("uses only the active nutrient mode", () => {
    expect(
      hasNutrientPrimaryResult("label", {
        label: false,
        ec_target: true,
        c1v1: true,
        dry_salt: true,
        converter: true,
      }),
    ).toBe(false);
    expect(
      hasNutrientPrimaryResult("converter", {
        label: false,
        ec_target: false,
        c1v1: false,
        dry_salt: false,
        converter: true,
      }),
    ).toBe(true);
  });
});
