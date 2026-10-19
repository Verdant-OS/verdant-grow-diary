import { describe, expect, it } from "vitest";

import {
  calculateWhenReady,
  expenseDeviceRowsReadiness,
  expenseExportReadiness,
  expenseNutrientRowsReadiness,
  expenseWaterReadiness,
  isValidMeasuredMixedEc,
  lightCanopyEfficiencyReadiness,
  lightExportReadiness,
  lightFixtureCountReadiness,
  lightFixturePpfReadiness,
  nutrientInjectorReadiness,
  shouldExportInjectorPlan,
} from "@/lib/growHelpToolkitReadiness";
import { createDefaultGrowHelpToolkitState } from "@/lib/growHelpToolkitState";

describe("Grow Help Toolkit readiness boundaries", () => {
  it("returns the generic input message when a calculator throws a non-Error", () => {
    expect(
      calculateWhenReady(true, () => {
        throw "Target must be positive.";
      }),
    ).toEqual({ value: null, error: "Check the inputs." });
  });

  it("keeps light planning closed at the canopy, fixture, and watt boundaries", () => {
    const state = createDefaultGrowHelpToolkitState();

    expect(
      lightCanopyEfficiencyReadiness({ ...state.light, canopyEfficiencyPercent: 50 }).ready,
    ).toBe(true);
    expect(
      lightCanopyEfficiencyReadiness({ ...state.light, canopyEfficiencyPercent: 100 }).ready,
    ).toBe(true);
    for (const canopyEfficiencyPercent of [49.999, 100.001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        lightCanopyEfficiencyReadiness({ ...state.light, canopyEfficiencyPercent }).missing,
      ).toEqual(["canopyEfficiencyPercent"]);
    }

    expect(lightFixtureCountReadiness({ ...state.light, fixtureCount: 1 }).ready).toBe(true);
    expect(lightFixtureCountReadiness({ ...state.light, fixtureCount: 0 }).missing).toEqual([
      "fixtureCount",
    ]);
    expect(lightFixtureCountReadiness({ ...state.light, fixtureCount: 1.5 }).missing).toEqual([
      "fixtureCount",
    ]);

    const watts = {
      ...state.light,
      ppfMode: "watts" as const,
      actualWattsPerFixture: 0,
      efficacy: 2.7,
    };
    expect(lightFixturePpfReadiness(watts).ready).toBe(true);
    expect(
      lightFixturePpfReadiness({ ...watts, actualWattsPerFixture: -1, efficacy: 0 }).missing,
    ).toEqual(["actualWattsPerFixture", "efficacy"]);

    state.cycle.vegDays = 21;
    state.cycle.flowerDays = 56;
    expect(lightExportReadiness(state.light, state.cycle).missing).toEqual([
      "canopyLength",
      "canopyWidth",
      "ppfPerFixture",
      "targetPpfd",
    ]);
  });

  it("fails partial water, device, nutrient, or a zero-length cycle", () => {
    const state = createDefaultGrowHelpToolkitState();

    expect(expenseWaterReadiness(state.expense).ready).toBe(true);
    state.expense.waterPricePerGallon = 0;
    expect(expenseWaterReadiness(state.expense).missing).toEqual([
      "waterGallonsPerChange",
      "waterChangesPerWeek",
    ]);
    state.expense.waterGallonsPerChange = 0;
    state.expense.waterChangesPerWeek = 0;
    expect(expenseWaterReadiness(state.expense).ready).toBe(true);

    expect(
      expenseDeviceRowsReadiness({
        ...state.expense,
        devices: [
          {
            id: "light",
            name: "Light",
            actualWatts: null,
            quantity: 1.5,
            vegHoursPerDay: null,
            flowerHoursPerDay: null,
            vegDaysOverride: null,
            flowerDaysOverride: null,
          },
        ],
      }).missing,
    ).toEqual(["devices[0].actualWatts", "devices[0].quantity"]);

    expect(
      expenseNutrientRowsReadiness({
        ...state.expense,
        nutrients: [
          {
            id: "part-a",
            name: "Part A",
            pricingMode: "manual_weekly",
            packagePrice: null,
            usableAmount: null,
            unit: "ml",
            usagePerWeek: null,
            manualWeeklyCost: null,
          },
          {
            id: "part-b",
            name: "Part B",
            pricingMode: "package",
            packagePrice: null,
            usableAmount: null,
            unit: "ml",
            usagePerWeek: null,
            manualWeeklyCost: 4,
          },
        ],
      }).missing,
    ).toEqual([
      "nutrients[0].manualWeeklyCost",
      "nutrients[1].packagePrice",
      "nutrients[1].usableAmount",
      "nutrients[1].usagePerWeek",
    ]);

    state.cycle.vegDays = 0;
    state.cycle.flowerDays = 0;
    state.cycle.electricityRate = 0;
    expect(expenseExportReadiness(state.expense, state.cycle).missing).toEqual(["cycleDays"]);
  });

  it("exports an injector plan only when it is enabled and its ratio and stock are usable", () => {
    const nutrient = createDefaultGrowHelpToolkitState().nutrient;
    expect(nutrientInjectorReadiness(nutrient).ready).toBe(true);
    expect(shouldExportInjectorPlan(nutrient)).toBe(false);

    const enabled = {
      ...nutrient,
      injectorEnabled: true,
      stockGramsPerGallon: 10,
      injectorRatio: 100,
    };
    expect(shouldExportInjectorPlan(enabled)).toBe(true);
    expect(
      nutrientInjectorReadiness({ ...enabled, stockGramsPerGallon: 0, injectorRatio: 100.5 })
        .missing,
    ).toEqual(["stockGramsPerGallon", "injectorRatio"]);

    expect(isValidMeasuredMixedEc(0)).toBe(true);
    expect(isValidMeasuredMixedEc(10)).toBe(true);
    expect(isValidMeasuredMixedEc(10.001)).toBe(false);
    expect(isValidMeasuredMixedEc(Number.NaN)).toBe(false);
    expect(isValidMeasuredMixedEc(null)).toBe(false);
  });
});
