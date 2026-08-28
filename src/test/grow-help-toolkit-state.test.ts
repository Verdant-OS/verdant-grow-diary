import { beforeEach, describe, expect, it } from "vitest";

import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
  setLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";
import {
  clearGrowHelpToolkitState,
  createDefaultGrowHelpToolkitState,
  GROW_HELP_TOOLKIT_STORAGE_KEY,
  loadGrowHelpToolkitState,
  normalizeGrowHelpToolkitState,
  saveGrowHelpToolkitState,
  type GrowHelpToolkitState,
} from "@/lib/growHelpToolkitState";

function createCompletePersistedState(): GrowHelpToolkitState {
  const state = createDefaultGrowHelpToolkitState();
  state.unitSystem = "metric";
  state.cycle = {
    name: "Basement cycle",
    vegDays: 28,
    flowerDays: 63,
    vegPhotoperiodHours: 18,
    flowerPhotoperiodHours: 12,
    electricityRate: 0.18,
    currency: "CAD",
  };
  state.nutrient = {
    ...state.nutrient,
    mode: "ec_target",
    reservoirValue: 40,
    reservoirUnit: "L",
    changesPerWeek: 1.5,
    labelParts: [
      { id: "label-a", name: "Base", dose: 2.5, unit: "ml/L" },
      { id: "label-b", name: "Calcium", dose: 1, unit: "g/gal" },
    ],
    sourceWaterEc: 0.2,
    targetEc: 1.6,
    measuredMixedEc: 1.5,
    ecParts: [{ id: "ec-a", name: "Base", ecPerMlPerL: 0.2, ratio: 2 }],
    elementalTargetsPpm: {
      nitrogen: 150,
      phosphorus: 50,
      potassium: 200,
    },
    c1: 10,
    c2: 2,
    v2: 5,
    c1v1Unit: "L",
    drySaltRows: [
      {
        id: "salt-a",
        name: "Part A",
        gramsPerGallon: 3.6,
        bagSizeGrams: 1_000,
        mixOrder: 1,
      },
    ],
    injectorEnabled: true,
    stockGramsPerGallon: 120,
    injectorRatio: 100,
    converterKind: "ppm700",
    converterValue: 980,
  };
  state.light = {
    ...state.light,
    stage: "veg",
    canopyLength: 1.2,
    canopyWidth: 1.2,
    ppfMode: "watts",
    fixtureCount: 2,
    ppfPerFixture: null,
    actualWattsPerFixture: 300,
    efficacy: 2.7,
    canopyEfficiencyPercent: 85,
    targetMode: "dli",
    targetPpfd: null,
    targetDli: 35,
    chartPpfd: 700,
    chartHeight: 45,
    newHeight: 55,
    heightUnit: "cm",
    fivePoint: {
      center: 710,
      frontLeft: 620,
      frontRight: 640,
      backLeft: 610,
      backRight: 630,
    },
    showHeatmap: true,
  };
  state.expense = {
    devices: [
      {
        id: "device-light",
        name: "Fixture",
        actualWatts: 300,
        quantity: 2,
        vegHoursPerDay: null,
        flowerHoursPerDay: null,
        vegDaysOverride: null,
        flowerDaysOverride: null,
        linkedFromLight: true,
      },
    ],
    nutrients: [
      {
        id: "expense-base",
        name: "Base",
        pricingMode: "package",
        packagePrice: 45,
        usableAmount: 1_000,
        unit: "ml",
        usagePerWeek: 90,
        manualWeeklyCost: null,
        linkedFromRecipe: true,
      },
    ],
    waterPricePerGallon: 0.01,
    waterGallonsPerChange: 10,
    waterChangesPerWeek: 1.5,
    setup: [{ id: "setup-tent", name: "Tent", amount: 180 }],
    recurring: [{ id: "rec-filter", name: "Filter", amount: 12, basis: "month" }],
    driedSaleableGrams: 220,
    amortizationCycles: 6,
    compareAtPricePerGram: 4.25,
  };
  return state;
}

function createFailingStorage(): Storage {
  const fail = () => {
    throw new DOMException("Storage unavailable", "QuotaExceededError");
  };
  return {
    length: 0,
    clear: fail,
    getItem: (_key: string) => fail(),
    key: (_index: number) => null,
    removeItem: (_key: string) => fail(),
    setItem: (_key: string, _value: string) => fail(),
  };
}

describe("Grow Help Toolkit state", () => {
  beforeEach(() => {
    clearLocalStorageForTest();
  });

  it("starts with honest defaults and no invented cycle, yield, or market inputs", () => {
    const state = createDefaultGrowHelpToolkitState();

    expect(state.unitSystem).toBe("us");
    expect(state.cycle).toMatchObject({
      name: "My grow cycle",
      vegDays: null,
      flowerDays: null,
      vegPhotoperiodHours: 18,
      flowerPhotoperiodHours: 12,
      electricityRate: null,
      currency: "USD",
    });
    expect(state.nutrient).toMatchObject({
      mode: "label",
      reservoirValue: null,
      reservoirUnit: "gal",
      injectorEnabled: false,
      injectorRatio: 100,
      converterKind: "ec",
      converterValue: null,
    });
    expect(state.nutrient.ecParts).toEqual([
      { id: "ec-1", name: "Part A", ecPerMlPerL: null, ratio: 1 },
    ]);
    expect(state.nutrient.elementalTargetsPpm).toEqual({
      nitrogen: null,
      phosphorus: null,
      potassium: null,
    });
    expect(state.light).toMatchObject({
      stage: "flower",
      ppfMode: "ppf",
      fixtureCount: 1,
      canopyEfficiencyPercent: 80,
      targetMode: "ppfd",
      showHeatmap: false,
    });
    expect(state.expense.driedSaleableGrams).toBeNull();
    expect(state.expense.compareAtPricePerGram).toBeNull();
    expect(state.expense.amortizationCycles).toBe(4);
  });

  it("round-trips a valid complete state through the versioned localStorage key", () => {
    const state = createCompletePersistedState();

    expect(saveGrowHelpToolkitState(state)).toBe(true);
    const raw = getLocalStorageItemForTest(GROW_HELP_TOOLKIT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual(state);
    expect(loadGrowHelpToolkitState()).toEqual(state);
  });

  it("falls back to fresh defaults when persisted JSON is corrupt", () => {
    setLocalStorageItemForTest(GROW_HELP_TOOLKIT_STORAGE_KEY, "{not-valid-json");

    expect(loadGrowHelpToolkitState()).toEqual(createDefaultGrowHelpToolkitState());
  });

  it("sanitizes unknown persisted calculation discriminants to safe defaults", () => {
    const normalized = normalizeGrowHelpToolkitState({
      unitSystem: "nautical",
      nutrient: {
        mode: "alchemy",
        reservoirUnit: "bucket",
        converterKind: "ppm1000",
        labelParts: [{ id: "unknown-label", name: "Unknown", dose: 1, unit: "cups/gal" }],
        ecParts: [
          { id: "legacy-ec", name: "Legacy", ecPerMlPerL: 0.2 },
          { id: "blank-ratio", name: "Blank ratio", ecPerMlPerL: 0.1, ratio: null },
        ],
        elementalTargetsPpm: {
          nitrogen: "not-a-number",
          phosphorus: null,
          potassium: 180,
        },
      },
      light: {
        stage: "transition",
        ppfMode: "marketing-watts",
        targetMode: "lux",
        heightUnit: "furlong",
      },
      expense: {
        nutrients: [
          {
            id: "unknown-price",
            name: "Unknown",
            pricingMode: "subscription",
            unit: "oz",
          },
        ],
        recurring: [{ id: "unknown-recurring", name: "Unknown", amount: 5, basis: "year" }],
      },
    });

    expect(normalized.unitSystem).toBe("us");
    expect(normalized.nutrient.mode).toBe("label");
    expect(normalized.nutrient.reservoirUnit).toBe("gal");
    expect(normalized.nutrient.converterKind).toBe("ec");
    expect(normalized.nutrient.labelParts[0].unit).toBe("ml/gal");
    expect(normalized.nutrient.ecParts.map((row) => row.ratio)).toEqual([1, null]);
    expect(normalized.nutrient.elementalTargetsPpm).toEqual({
      nitrogen: null,
      phosphorus: null,
      potassium: 180,
    });
    expect(normalized.light).toMatchObject({
      stage: "flower",
      ppfMode: "ppf",
      targetMode: "ppfd",
      heightUnit: "in",
    });
    expect(normalized.expense.nutrients[0]).toMatchObject({
      pricingMode: "package",
      unit: "ml",
    });
    expect(normalized.expense.recurring[0].basis).toBe("cycle");
  });

  it("fails closed without throwing when storage reads, writes, or removals fail", () => {
    const storage = createFailingStorage();
    const state = createCompletePersistedState();

    expect(loadGrowHelpToolkitState(storage)).toEqual(createDefaultGrowHelpToolkitState());
    expect(saveGrowHelpToolkitState(state, storage)).toBe(false);
    expect(clearGrowHelpToolkitState(storage)).toBe(false);
  });
});
