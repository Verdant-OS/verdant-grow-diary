import { describe, expect, it, vi } from "vitest";
import {
  calculateWhenReady,
  hasCompleteFivePointReading,
  hasNutrientPrimaryResult,
  hasPositiveCanopyDimensions,
  isExpenseSummaryReady,
} from "@/lib/growHelpToolkitReadiness";
import { createDefaultGrowHelpToolkitState } from "@/lib/growHelpToolkitState";

describe("Grow Help Toolkit calculation readiness", () => {
  it("does not execute a calculation until its required inputs are ready", () => {
    const calculate = vi.fn(() => 42);

    expect(calculateWhenReady(false, calculate)).toEqual({ value: null, error: null });
    expect(calculate).not.toHaveBeenCalled();
    expect(calculateWhenReady(true, calculate)).toEqual({ value: 42, error: null });
  });

  it("returns deterministic calculation errors without throwing through the presenter", () => {
    const result = calculateWhenReady(true, () => {
      throw new RangeError("Target must be positive.");
    });

    expect(result).toEqual({ value: null, error: "Target must be positive." });
  });

  it("requires both positive canopy dimensions and all five optional PAR points", () => {
    const state = createDefaultGrowHelpToolkitState();
    expect(hasPositiveCanopyDimensions(state.light)).toBe(false);
    expect(hasCompleteFivePointReading(state.light)).toBe(false);

    state.light.canopyLength = 4;
    state.light.canopyWidth = 4;
    state.light.fivePoint = {
      center: 700,
      frontLeft: 600,
      frontRight: 610,
      backLeft: 620,
      backRight: 630,
    };
    expect(hasPositiveCanopyDimensions(state.light)).toBe(true);
    expect(hasCompleteFivePointReading(state.light)).toBe(true);
  });

  it("treats a cleared required shared or amortization input as not ready", () => {
    const state = createDefaultGrowHelpToolkitState();
    state.cycle.vegDays = 21;
    state.cycle.flowerDays = 56;
    state.cycle.electricityRate = 0.16;
    expect(isExpenseSummaryReady(state.expense, state.cycle)).toBe(true);

    state.cycle.vegPhotoperiodHours = null;
    expect(isExpenseSummaryReady(state.expense, state.cycle)).toBe(false);
    state.cycle.vegPhotoperiodHours = 18;
    state.expense.amortizationCycles = null;
    expect(isExpenseSummaryReady(state.expense, state.cycle)).toBe(false);
  });

  it("selects only the active nutrient mode's readiness", () => {
    expect(
      hasNutrientPrimaryResult("converter", {
        label: true,
        ec_target: false,
        c1v1: false,
        dry_salt: false,
        converter: false,
      }),
    ).toBe(false);
  });
});
