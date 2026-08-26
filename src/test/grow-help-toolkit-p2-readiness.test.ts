import { describe, expect, it } from "vitest";

import {
  MEASURED_MIXED_EC_SOURCE,
  MEASURED_MIXED_EC_SOURCE_LABEL,
  cyclePhotoperiodReadiness,
  expenseExportReadiness,
  isManualMeasuredMixedEcSource,
  lightExportReadiness,
  lightFixturePlanningReadiness,
  measuredMixedEcSourceLabel,
} from "@/lib/growHelpToolkitReadiness";
import {
  createDefaultGrowHelpToolkitState,
  normalizeGrowHelpToolkitState,
  saveGrowHelpToolkitState,
  loadGrowHelpToolkitState,
  type GrowHelpToolkitState,
} from "@/lib/growHelpToolkitState";
import { createGrowHelpExportSnapshot } from "@/lib/growHelpToolkitExport";
import {
  clearLocalStorageForTest,
  getLocalStorageItemForTest,
} from "@/test/helpers/localStorageTestHelper";
import { GROW_HELP_TOOLKIT_STORAGE_KEY } from "@/lib/growHelpToolkitState";

function completePlanningState(): GrowHelpToolkitState {
  const state = createDefaultGrowHelpToolkitState();
  state.cycle = {
    ...state.cycle,
    vegDays: 28,
    flowerDays: 56,
    vegPhotoperiodHours: 18,
    flowerPhotoperiodHours: 12,
    electricityRate: 0.16,
  };
  state.light = {
    ...state.light,
    canopyLength: 4,
    canopyWidth: 4,
    fixtureCount: 2,
    ppfPerFixture: 800,
    actualWattsPerFixture: 300,
    canopyEfficiencyPercent: 85,
    targetPpfd: 800,
  };
  state.expense = {
    ...state.expense,
    amortizationCycles: 4,
  };
  return state;
}

describe("Grow Help Toolkit readiness helpers", () => {
  it("reports missing fixture count and canopy efficiency as not ready", () => {
    const light = createDefaultGrowHelpToolkitState().light;
    light.fixtureCount = null;
    light.canopyEfficiencyPercent = null;
    expect(lightFixturePlanningReadiness(light)).toEqual({
      ready: false,
      missing: ["fixtureCount", "canopyEfficiencyPercent"],
    });
  });

  it("requires photoperiods for light and expense export readiness", () => {
    const state = completePlanningState();
    state.cycle.vegPhotoperiodHours = null;
    state.cycle.flowerPhotoperiodHours = null;
    expect(cyclePhotoperiodReadiness(state.cycle).ready).toBe(false);
    expect(lightExportReadiness(state.light, state.cycle).ready).toBe(false);
    expect(expenseExportReadiness(state.expense, state.cycle).ready).toBe(false);
  });

  it("labels measured mixed EC as browser-local manual data, never live", () => {
    expect(MEASURED_MIXED_EC_SOURCE).toBe("manual");
    expect(isManualMeasuredMixedEcSource(MEASURED_MIXED_EC_SOURCE)).toBe(true);
    expect(isManualMeasuredMixedEcSource("live")).toBe(false);
    expect(measuredMixedEcSourceLabel(1.4)).toBe(MEASURED_MIXED_EC_SOURCE_LABEL);
    expect(measuredMixedEcSourceLabel(null)).toBeNull();
    expect(MEASURED_MIXED_EC_SOURCE_LABEL.toLowerCase()).toContain("manual");
    expect(MEASURED_MIXED_EC_SOURCE_LABEL.toLowerCase()).toContain("not live sensor");
  });
});

describe("Grow Help Toolkit clear-to-missing persistence", () => {
  it("keeps cleared planning fields null through normalize, save, reload, and export", () => {
    clearLocalStorageForTest();
    const state = completePlanningState();
    state.cycle.vegPhotoperiodHours = null;
    state.cycle.flowerPhotoperiodHours = null;
    state.light.fixtureCount = null;
    state.light.canopyEfficiencyPercent = null;
    state.expense.amortizationCycles = null;
    state.nutrient.injectorRatio = null;
    state.expense.devices = [
      {
        id: "device-1",
        name: "Fan",
        actualWatts: 40,
        quantity: null,
        vegHoursPerDay: null,
        flowerHoursPerDay: null,
        vegDaysOverride: null,
        flowerDaysOverride: null,
      },
    ];

    const normalized = normalizeGrowHelpToolkitState(state);
    expect(normalized.cycle.vegPhotoperiodHours).toBeNull();
    expect(normalized.cycle.flowerPhotoperiodHours).toBeNull();
    expect(normalized.light.fixtureCount).toBeNull();
    expect(normalized.light.canopyEfficiencyPercent).toBeNull();
    expect(normalized.expense.amortizationCycles).toBeNull();
    expect(normalized.nutrient.injectorRatio).toBeNull();
    expect(normalized.expense.devices[0]?.quantity).toBeNull();

    expect(saveGrowHelpToolkitState(normalized)).toBe(true);
    const raw = getLocalStorageItemForTest(GROW_HELP_TOOLKIT_STORAGE_KEY);
    expect(raw).toContain('"vegPhotoperiodHours":null');
    expect(raw).toContain('"fixtureCount":null');
    expect(raw).toContain('"canopyEfficiencyPercent":null');
    expect(raw).toContain('"amortizationCycles":null');
    expect(raw).toContain('"injectorRatio":null');
    expect(raw).toContain('"quantity":null');

    const reloaded = loadGrowHelpToolkitState();
    expect(reloaded.cycle.vegPhotoperiodHours).toBeNull();
    expect(reloaded.light.fixtureCount).toBeNull();
    expect(reloaded.light.canopyEfficiencyPercent).toBeNull();
    expect(reloaded.expense.amortizationCycles).toBeNull();
    expect(reloaded.nutrient.injectorRatio).toBeNull();
    expect(reloaded.expense.devices[0]?.quantity).toBeNull();

    const snapshot = createGrowHelpExportSnapshot(reloaded, "Fixed label");
    expect(snapshot.rows).toContainEqual({
      section: "Cycle",
      item: "Vegetative photoperiod",
      value: "Not entered",
      unit: "h/day",
      formula: "shared Cycle bar",
    });
    expect(snapshot.rows.some((row) => row.section === "Light plan")).toBe(false);
    expect(snapshot.rows.some((row) => row.section === "Cost sheet")).toBe(false);
    expect(snapshot.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "Notes",
          item: "Light plan",
          value: "Incomplete — not exported",
        }),
        expect.objectContaining({
          section: "Notes",
          item: "Cost sheet",
          value: "Incomplete — not exported",
        }),
      ]),
    );
  });
});

describe("Grow Help Toolkit export fail-closed on incomplete required inputs", () => {
  it("does not emit fabricated light plan numbers when fixture count is missing", () => {
    const state = completePlanningState();
    state.light.fixtureCount = null;

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(snapshot.rows.filter((row) => row.section === "Light plan")).toEqual([]);
    expect(snapshot.rows).toContainEqual(
      expect.objectContaining({
        section: "Notes",
        item: "Light plan",
        value: "Incomplete — not exported",
      }),
    );
    expect(
      snapshot.rows.some(
        (row) =>
          row.section === "Light plan" &&
          (row.value === 0 || row.item.toLowerCase().includes("ppfd")),
      ),
    ).toBe(false);
  });

  it("does not emit expense cost-sheet zeros when amortization is missing", () => {
    const state = completePlanningState();
    state.expense.amortizationCycles = null;
    state.expense.devices = [
      {
        id: "d1",
        name: "Light",
        actualWatts: 300,
        quantity: 1,
        vegHoursPerDay: null,
        flowerHoursPerDay: null,
        vegDaysOverride: null,
        flowerDaysOverride: null,
      },
    ];

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(snapshot.rows.filter((row) => row.section === "Cost sheet")).toEqual([]);
    expect(snapshot.rows).toContainEqual(
      expect.objectContaining({
        section: "Notes",
        item: "Cost sheet",
        value: "Incomplete — not exported",
        formula: expect.stringContaining("amortizationCycles"),
      }),
    );
  });

  it("exports measured mixed EC with an explicit manual source distinction", () => {
    const state = completePlanningState();
    state.nutrient = {
      ...state.nutrient,
      mode: "ec_target",
      reservoirValue: 20,
      reservoirUnit: "gal",
      sourceWaterEc: 0.2,
      targetEc: 1.6,
      measuredMixedEc: 1.45,
      ecParts: [{ id: "a", name: "Part A", ecPerMlPerL: 0.2, ratio: 1 }],
    };

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(snapshot.rows).toContainEqual({
      section: "Nutrient recipe",
      item: "Measured mixed EC",
      value: 1.45,
      unit: "mS/cm EC",
      formula: `${MEASURED_MIXED_EC_SOURCE_LABEL}; source=${MEASURED_MIXED_EC_SOURCE}`,
    });
    const formula = snapshot.rows.find((row) => row.item === "Measured mixed EC")?.formula ?? "";
    expect(formula).toContain("source=manual");
    expect(formula.toLowerCase()).toContain("not live sensor");
    expect(formula.toLowerCase().startsWith("live")).toBe(false);
  });
});
