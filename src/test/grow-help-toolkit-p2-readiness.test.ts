import { describe, expect, it } from "vitest";

import {
  MEASURED_MIXED_EC_SOURCE,
  MEASURED_MIXED_EC_SOURCE_LABEL,
  cyclePhotoperiodReadiness,
  expenseCoreCycleReadiness,
  expenseExportReadiness,
  isManualMeasuredMixedEcSource,
  isValidMeasuredMixedEc,
  lightExportReadiness,
  lightFixtureCountReadiness,
  lightFixturePlanningReadiness,
  lightTargetReadiness,
  measuredMixedEcSourceLabel,
  nutrientInjectorReadiness,
  shouldExportInjectorPlan,
  stagePhotoperiodReadiness,
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
    expect(lightFixtureCountReadiness(light).ready).toBe(false);
  });

  it("requires photoperiods for light and expense export readiness", () => {
    const state = completePlanningState();
    state.cycle.vegPhotoperiodHours = null;
    state.cycle.flowerPhotoperiodHours = null;
    expect(cyclePhotoperiodReadiness(state.cycle).ready).toBe(false);
    expect(lightExportReadiness(state.light, state.cycle).ready).toBe(false);
    expect(expenseExportReadiness(state.expense, state.cycle).ready).toBe(false);
  });

  it("requires the active light target for export readiness", () => {
    const state = completePlanningState();
    state.light.targetMode = "ppfd";
    state.light.targetPpfd = null;
    expect(lightTargetReadiness(state.light).missing).toEqual(["targetPpfd"]);
    expect(lightExportReadiness(state.light, state.cycle).ready).toBe(false);

    state.light.targetMode = "dli";
    state.light.targetDli = null;
    expect(lightTargetReadiness(state.light).missing).toEqual(["targetDli"]);
  });

  it("keeps stage photoperiod independent so direct PPFD does not need the other stage", () => {
    const cycle = createDefaultGrowHelpToolkitState().cycle;
    cycle.vegPhotoperiodHours = 18;
    cycle.flowerPhotoperiodHours = null;
    expect(stagePhotoperiodReadiness(cycle, "veg").ready).toBe(true);
    expect(stagePhotoperiodReadiness(cycle, "flower").ready).toBe(false);
    expect(cyclePhotoperiodReadiness(cycle).ready).toBe(false);
  });

  it("marks a zero-day cycle incomplete for expense readiness", () => {
    const cycle = createDefaultGrowHelpToolkitState().cycle;
    cycle.vegDays = 0;
    cycle.flowerDays = 0;
    cycle.electricityRate = 0.16;
    expect(expenseCoreCycleReadiness(cycle).ready).toBe(false);
    expect(expenseCoreCycleReadiness(cycle).missing).toContain("cycleDays");
  });

  it("labels measured mixed EC as browser-local manual data, never live", () => {
    expect(MEASURED_MIXED_EC_SOURCE).toBe("manual");
    expect(isManualMeasuredMixedEcSource(MEASURED_MIXED_EC_SOURCE)).toBe(true);
    expect(isManualMeasuredMixedEcSource("live")).toBe(false);
    expect(measuredMixedEcSourceLabel(1.4)).toBe(MEASURED_MIXED_EC_SOURCE_LABEL);
    expect(measuredMixedEcSourceLabel(null)).toBeNull();
    expect(measuredMixedEcSourceLabel(-0.1)).toBeNull();
    expect(measuredMixedEcSourceLabel(10.1)).toBeNull();
    expect(isValidMeasuredMixedEc(1.4)).toBe(true);
    expect(isValidMeasuredMixedEc(-0.1)).toBe(false);
    expect(MEASURED_MIXED_EC_SOURCE_LABEL.toLowerCase()).toContain("manual");
    expect(MEASURED_MIXED_EC_SOURCE_LABEL.toLowerCase()).toContain("not live sensor");
  });

  it("does not treat a disabled injector as exportable even with leftover stock values", () => {
    const nutrient = createDefaultGrowHelpToolkitState().nutrient;
    nutrient.mode = "dry_salt";
    nutrient.injectorEnabled = false;
    nutrient.stockGramsPerGallon = 120;
    nutrient.injectorRatio = 100;
    expect(nutrientInjectorReadiness(nutrient).ready).toBe(true);
    expect(shouldExportInjectorPlan(nutrient)).toBe(false);

    nutrient.injectorEnabled = true;
    expect(shouldExportInjectorPlan(nutrient)).toBe(true);

    nutrient.injectorRatio = null;
    expect(shouldExportInjectorPlan(nutrient)).toBe(false);
    expect(nutrientInjectorReadiness(nutrient).missing).toContain("injectorRatio");
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

  it("does not emit expense cost-sheet zeros when cycle days sum to zero", () => {
    const state = completePlanningState();
    state.cycle.vegDays = 0;
    state.cycle.flowerDays = 0;

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(snapshot.rows.filter((row) => row.section === "Cost sheet")).toEqual([]);
    expect(snapshot.rows).toContainEqual(
      expect.objectContaining({
        section: "Notes",
        item: "Cost sheet",
        value: "Incomplete — not exported",
        formula: expect.stringContaining("cycleDays"),
      }),
    );
  });

  it("does not export out-of-range measured mixed EC as legitimate manual data", () => {
    const state = completePlanningState();
    state.nutrient = {
      ...state.nutrient,
      mode: "ec_target",
      reservoirValue: 20,
      reservoirUnit: "gal",
      sourceWaterEc: 0.2,
      targetEc: 1.6,
      measuredMixedEc: 10.1,
      ecParts: [{ id: "a", name: "Part A", ecPerMlPerL: 0.2, ratio: 1 }],
    };

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(snapshot.rows.some((row) => row.item === "Measured mixed EC")).toBe(false);
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

  it("omits injector stock-draw rows when the injector plan is disabled", () => {
    const state = completePlanningState();
    state.nutrient = {
      ...state.nutrient,
      mode: "dry_salt",
      reservoirValue: 20,
      reservoirUnit: "gal",
      drySaltRows: [
        {
          id: "salt-1",
          name: "Dry salt A",
          gramsPerGallon: 2,
          bagSizeGrams: null,
          mixOrder: 1,
        },
      ],
      injectorEnabled: false,
      stockGramsPerGallon: 120,
      injectorRatio: 100,
    };

    const snapshot = createGrowHelpExportSnapshot(state, "Fixed label");
    expect(snapshot.rows.some((row) => String(row.item).includes("stock draw"))).toBe(false);
  });
});
