import { describe, expect, it } from "vitest";
import {
  calculateElectricityDevice,
  calculateExpenseComparison,
  calculateExpenseSummary,
  calculateNutrientCost,
  calculateUnitCosts,
  calculateWaterCost,
  costPerGram,
} from "@/lib/expenseCalc";

describe("expenseCalc", () => {
  it("calculates the exact requested 300 W energy and cost case", () => {
    const row = calculateElectricityDevice(
      {
        id: "light",
        name: "Light",
        actualWatts: 300,
        quantity: 1,
        vegHoursPerDay: 18,
        flowerHoursPerDay: 18,
        vegDays: 30,
        flowerDays: 0,
      },
      0.16,
    );
    expect(row.cycleKwh).toBe(162);
    expect(row.cycleCost).toBe(25.92);
  });

  it("splits device electricity by veg and flower", () => {
    const row = calculateElectricityDevice(
      {
        id: "light",
        name: "Light",
        actualWatts: 300,
        quantity: 2,
        vegHoursPerDay: 18,
        flowerHoursPerDay: 12,
        vegDays: 30,
        flowerDays: 60,
      },
      0.16,
    );
    expect(row.vegKwh).toBe(324);
    expect(row.flowerKwh).toBe(432);
    expect(row.cycleKwh).toBe(756);
    expect(row.thirtyDayKwh).toBe(252);
    expect(row.yearlyKwh).toBeCloseTo(3066, 10);
  });

  it("uses actual draw and quantity, never HID-equivalent watts", () => {
    const one = calculateElectricityDevice(
      {
        id: "fan",
        name: "Fan",
        actualWatts: 50,
        quantity: 3,
        vegHoursPerDay: 24,
        flowerHoursPerDay: 24,
        vegDays: 10,
        flowerDays: 10,
      },
      0.2,
    );
    expect(one.cycleKwh).toBe(72);
  });

  it("calculates nutrient package cost from usable amount and weekly recipe use", () => {
    const row = calculateNutrientCost(
      {
        id: "a",
        name: "Part A",
        packagePrice: 40,
        usableAmount: 1000,
        unit: "ml",
        usagePerWeek: 100,
      },
      70,
    );
    expect(row.costPerUnit).toBe(0.04);
    expect(row.weeklyCost).toBe(4);
    expect(row.cycleCost).toBe(40);
  });

  it("supports a grower-entered manual nutrient cost per week", () => {
    const row = calculateNutrientCost(
      {
        id: "manual",
        name: "Manual nutrient spend",
        packagePrice: 0,
        usableAmount: 0,
        unit: "ml",
        usagePerWeek: 0,
        pricingMode: "manual_weekly",
        manualWeeklyCost: 12,
      },
      70,
    );
    expect(row.costPerUnit).toBeNull();
    expect(row.weeklyCost).toBe(12);
    expect(row.cycleCost).toBe(120);
  });

  it("calculates water cost from gallons per change and weekly frequency", () => {
    const row = calculateWaterCost(
      { pricePerGallon: 0.01, gallonsPerReservoirChange: 20, changesPerWeek: 2 },
      70,
    );
    expect(row.weeklyGallons).toBe(40);
    expect(row.cycleCost).toBe(4);
  });

  it("calculates the exact requested cost per dried gram case", () => {
    expect(costPerGram(400, 200)).toBe(2);
  });

  it("derives cost per ounce, pound, and kilogram from dried grams", () => {
    const costs = calculateUnitCosts(400, 200);
    expect(costs.perGram).toBe(2);
    expect(costs.perOunce).toBe(56.699);
    expect(costs.perPound).toBe(907.18474);
    expect(costs.perKilogram).toBe(2000);
  });

  it("separates first-cycle, operating-only, and setup-amortized cost", () => {
    const summary = calculateExpenseSummary({
      devices: [],
      nutrients: [],
      water: { pricePerGallon: 0, gallonsPerReservoirChange: 0, changesPerWeek: 0 },
      setup: [{ id: "tent", name: "Tent", amount: 800 }],
      recurring: [{ id: "other", name: "Other", amount: 200, basis: "cycle" }],
      electricityRate: 0.16,
      cycleDays: 90,
      driedSaleableGrams: 200,
      amortizationCycles: 4,
      compareAtPricePerGram: null,
    });
    expect(summary.operatingCycleCost).toBe(200);
    expect(summary.firstCycleCost).toBe(1000);
    expect(summary.amortizedCycleCost).toBe(400);
    expect(summary.firstCycleUnitCosts?.perGram).toBe(5);
    expect(summary.amortizedUnitCosts?.perGram).toBe(2);
  });

  it("normalizes per-month and per-cycle recurring items", () => {
    const summary = calculateExpenseSummary({
      devices: [],
      nutrients: [],
      water: { pricePerGallon: 0, gallonsPerReservoirChange: 0, changesPerWeek: 0 },
      setup: [],
      recurring: [
        { id: "monthly", name: "Monthly", amount: 30, basis: "month" },
        { id: "cycle", name: "Cycle", amount: 90, basis: "cycle" },
      ],
      electricityRate: 0.16,
      cycleDays: 90,
      driedSaleableGrams: null,
      amortizationCycles: 4,
      compareAtPricePerGram: null,
    });
    expect(summary.recurringCycleCost).toBe(180);
    expect(summary.thirtyDayOperatingCost).toBe(60);
  });

  it("uses only the grower's optional comparison price", () => {
    const base = {
      devices: [],
      nutrients: [],
      water: { pricePerGallon: 0, gallonsPerReservoirChange: 0, changesPerWeek: 0 },
      setup: [{ id: "setup", name: "Setup", amount: 100 }],
      recurring: [],
      electricityRate: 0.16,
      cycleDays: 90,
      driedSaleableGrams: 200,
      amortizationCycles: 4,
    } as const;
    const blank = calculateExpenseSummary({ ...base, compareAtPricePerGram: null });
    expect(blank.compareAtHarvestValue).toBeNull();
    expect(blank.operatingCycleSavings).toBeNull();
    expect(blank.operatingRoiPercent).toBeNull();
    expect(blank.setupPaybackCycles).toBeNull();
    const entered = calculateExpenseSummary({ ...base, compareAtPricePerGram: 3 });
    expect(entered.compareAtHarvestValue).toBe(600);
    expect(entered.operatingCycleSavings).toBe(600);
    expect(entered.operatingRoiPercent).toBeNull();
    expect(entered.setupPaybackCycles).toBeCloseTo(1 / 6, 12);
    expect(entered.firstCycleDifferenceFromCompareAt).toBe(500);
  });

  it("calculates operating ROI and setup payback from grower-entered comparison inputs", () => {
    const comparison = calculateExpenseComparison({
      compareAtPricePerGram: 3,
      driedSaleableGrams: 200,
      operatingCycleCost: 200,
      setupCost: 800,
    });

    expect(comparison).toEqual({
      comparisonValue: 600,
      operatingCycleSavings: 400,
      operatingRoiPercent: 200,
      setupPaybackCycles: 2,
    });
  });

  it("omits comparison ratios with missing or non-positive denominators", () => {
    expect(
      calculateExpenseComparison({
        compareAtPricePerGram: null,
        driedSaleableGrams: 200,
        operatingCycleCost: 200,
        setupCost: 800,
      }),
    ).toEqual({
      comparisonValue: null,
      operatingCycleSavings: null,
      operatingRoiPercent: null,
      setupPaybackCycles: null,
    });

    expect(
      calculateExpenseComparison({
        compareAtPricePerGram: 3,
        driedSaleableGrams: 200,
        operatingCycleCost: 0,
        setupCost: 100,
      }),
    ).toEqual({
      comparisonValue: 600,
      operatingCycleSavings: 600,
      operatingRoiPercent: null,
      setupPaybackCycles: 1 / 6,
    });

    expect(
      calculateExpenseComparison({
        compareAtPricePerGram: 1,
        driedSaleableGrams: 200,
        operatingCycleCost: 200,
        setupCost: 100,
      }),
    ).toEqual({
      comparisonValue: 200,
      operatingCycleSavings: 0,
      operatingRoiPercent: 0,
      setupPaybackCycles: null,
    });

    expect(
      calculateExpenseComparison({
        compareAtPricePerGram: 0.5,
        driedSaleableGrams: 200,
        operatingCycleCost: 200,
        setupCost: 0,
      }),
    ).toEqual({
      comparisonValue: 100,
      operatingCycleSavings: -100,
      operatingRoiPercent: -50,
      setupPaybackCycles: null,
    });
  });

  it("does not calculate unit costs without dried saleable harvest weight", () => {
    const summary = calculateExpenseSummary({
      devices: [],
      nutrients: [],
      water: { pricePerGallon: 0, gallonsPerReservoirChange: 0, changesPerWeek: 0 },
      setup: [],
      recurring: [],
      electricityRate: 0.16,
      cycleDays: 90,
      driedSaleableGrams: null,
      amortizationCycles: 4,
      compareAtPricePerGram: null,
    });
    expect(summary.firstCycleUnitCosts).toBeNull();
    expect(summary.amortizedUnitCosts).toBeNull();
  });

  it("is deterministic for identical expense inputs", () => {
    const input = {
      devices: [
        {
          id: "fan",
          name: "Fan",
          actualWatts: 50,
          quantity: 1,
          vegHoursPerDay: 24,
          flowerHoursPerDay: 24,
          vegDays: 30,
          flowerDays: 60,
        },
      ],
      nutrients: [],
      water: { pricePerGallon: 0, gallonsPerReservoirChange: 0, changesPerWeek: 0 },
      setup: [],
      recurring: [],
      electricityRate: 0.16,
      cycleDays: 90,
      driedSaleableGrams: null,
      amortizationCycles: 4,
      compareAtPricePerGram: null,
    } as const;
    expect(calculateExpenseSummary(input)).toEqual(calculateExpenseSummary(input));
  });

  it("rejects wet/zero harvest proxies, invalid hours, and invalid amortization", () => {
    expect(() => costPerGram(400, 0)).toThrow(/greater than 0/i);
    expect(() =>
      calculateElectricityDevice(
        {
          id: "x",
          name: "X",
          actualWatts: 100,
          quantity: 1,
          vegHoursPerDay: 25,
          flowerHoursPerDay: 12,
          vegDays: 1,
          flowerDays: 1,
        },
        0.16,
      ),
    ).toThrow(/24 or less/i);
    expect(() =>
      calculateExpenseSummary({
        devices: [],
        nutrients: [],
        water: { pricePerGallon: 0, gallonsPerReservoirChange: 0, changesPerWeek: 0 },
        setup: [],
        recurring: [],
        electricityRate: 0.16,
        cycleDays: 90,
        driedSaleableGrams: null,
        amortizationCycles: 2.5,
        compareAtPricePerGram: null,
      }),
    ).toThrow(/whole number/i);
  });
});
