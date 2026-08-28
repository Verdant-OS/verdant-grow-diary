import type {
  CycleInputs,
  ExpenseInputs,
  LightInputs,
  NutrientInputs,
} from "./growHelpToolkitState";

/**
 * Grower-entered measured mixed EC is browser-local manual data only.
 * It is never live sensor / telemetry and must never be labeled as such.
 */
export const MEASURED_MIXED_EC_SOURCE = "manual" as const;
export type MeasuredMixedEcSource = typeof MEASURED_MIXED_EC_SOURCE;

export const MEASURED_MIXED_EC_SOURCE_LABEL =
  "Grower-entered · browser-local manual (not live sensor)" as const;

export interface GrowHelpReadinessResult {
  ready: boolean;
  missing: ReadonlyArray<string>;
}

function result(missing: ReadonlyArray<string>): GrowHelpReadinessResult {
  return { ready: missing.length === 0, missing };
}

function isPresentNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Shared cycle photoperiods required for light DLI/energy and expense hour defaults. */
export function cyclePhotoperiodReadiness(cycle: CycleInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  if (!isPresentNumber(cycle.vegPhotoperiodHours) || cycle.vegPhotoperiodHours <= 0) {
    missing.push("vegPhotoperiodHours");
  }
  if (!isPresentNumber(cycle.flowerPhotoperiodHours) || cycle.flowerPhotoperiodHours <= 0) {
    missing.push("flowerPhotoperiodHours");
  }
  return result(missing);
}

/** Fixture count alone — enough for cycle energy / cost-per-mol (no canopy fudge). */
export function lightFixtureCountReadiness(light: LightInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  if (
    !isPresentNumber(light.fixtureCount) ||
    light.fixtureCount < 1 ||
    !Number.isInteger(light.fixtureCount)
  ) {
    missing.push("fixtureCount");
  }
  return result(missing);
}

/** Canopy efficiency fudge required for planning PPFD / fixtures-needed math. */
export function lightCanopyEfficiencyReadiness(light: LightInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  if (
    !isPresentNumber(light.canopyEfficiencyPercent) ||
    light.canopyEfficiencyPercent < 50 ||
    light.canopyEfficiencyPercent > 100
  ) {
    missing.push("canopyEfficiencyPercent");
  }
  return result(missing);
}

/** Fixture count and canopy efficiency required for planning PPFD / fixture math. */
export function lightFixturePlanningReadiness(light: LightInputs): GrowHelpReadinessResult {
  return result([
    ...lightFixtureCountReadiness(light).missing,
    ...lightCanopyEfficiencyReadiness(light).missing,
  ]);
}

/** Mode-specific target required when the Light tab marks Target PPFD/DLI as required. */
export function lightTargetReadiness(light: LightInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  if (light.targetMode === "ppfd") {
    if (!isPresentNumber(light.targetPpfd) || light.targetPpfd < 0) {
      missing.push("targetPpfd");
    }
  } else if (!isPresentNumber(light.targetDli) || light.targetDli <= 0) {
    missing.push("targetDli");
  }
  return result(missing);
}

/** Selected-stage photoperiod only — direct PPFD targets do not need the other stage. */
export function stagePhotoperiodReadiness(
  cycle: CycleInputs,
  stage: "veg" | "flower",
): GrowHelpReadinessResult {
  const key = stage === "veg" ? "vegPhotoperiodHours" : "flowerPhotoperiodHours";
  const value = stage === "veg" ? cycle.vegPhotoperiodHours : cycle.flowerPhotoperiodHours;
  if (!isPresentNumber(value) || value <= 0) {
    return result([key]);
  }
  return result([]);
}

export function lightCanopyDimensionsReadiness(light: LightInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  if (!isPresentNumber(light.canopyLength) || light.canopyLength <= 0) {
    missing.push("canopyLength");
  }
  if (!isPresentNumber(light.canopyWidth) || light.canopyWidth <= 0) {
    missing.push("canopyWidth");
  }
  return result(missing);
}

export function lightFixturePpfReadiness(light: LightInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  if (light.ppfMode === "ppf") {
    if (!isPresentNumber(light.ppfPerFixture) || light.ppfPerFixture <= 0) {
      missing.push("ppfPerFixture");
    }
  } else {
    if (!isPresentNumber(light.actualWattsPerFixture) || light.actualWattsPerFixture < 0) {
      missing.push("actualWattsPerFixture");
    }
    if (!isPresentNumber(light.efficacy) || light.efficacy <= 0) {
      missing.push("efficacy");
    }
  }
  return result(missing);
}

/** Required inputs for exporting a light plan section (fail closed when incomplete). */
export function lightExportReadiness(
  light: LightInputs,
  cycle: CycleInputs,
): GrowHelpReadinessResult {
  const missing = [
    ...lightCanopyDimensionsReadiness(light).missing,
    ...lightFixturePlanningReadiness(light).missing,
    ...lightFixturePpfReadiness(light).missing,
    ...lightTargetReadiness(light).missing,
    ...cyclePhotoperiodReadiness(cycle).missing,
  ];
  return result(missing);
}

export function expenseAmortizationReadiness(expense: ExpenseInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  if (
    !isPresentNumber(expense.amortizationCycles) ||
    expense.amortizationCycles < 1 ||
    !Number.isInteger(expense.amortizationCycles)
  ) {
    missing.push("amortizationCycles");
  }
  return result(missing);
}

export function expenseCoreCycleReadiness(cycle: CycleInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  if (!isPresentNumber(cycle.vegDays) || cycle.vegDays < 0) missing.push("vegDays");
  if (!isPresentNumber(cycle.flowerDays) || cycle.flowerDays < 0) missing.push("flowerDays");
  if (!isPresentNumber(cycle.electricityRate)) missing.push("electricityRate");
  // calculateExpenseSummary requires a positive combined cycle; 0+0 must stay not-ready.
  if (
    isPresentNumber(cycle.vegDays) &&
    cycle.vegDays >= 0 &&
    isPresentNumber(cycle.flowerDays) &&
    cycle.flowerDays >= 0 &&
    cycle.vegDays + cycle.flowerDays <= 0
  ) {
    missing.push("cycleDays");
  }
  return result(missing);
}

export function expenseWaterReadiness(expense: ExpenseInputs): GrowHelpReadinessResult {
  const waterStarted =
    expense.waterPricePerGallon !== null ||
    expense.waterGallonsPerChange !== null ||
    expense.waterChangesPerWeek !== null;
  if (!waterStarted) return result([]);
  const missing: string[] = [];
  if (!isPresentNumber(expense.waterPricePerGallon)) missing.push("waterPricePerGallon");
  if (!isPresentNumber(expense.waterGallonsPerChange)) missing.push("waterGallonsPerChange");
  if (!isPresentNumber(expense.waterChangesPerWeek)) missing.push("waterChangesPerWeek");
  return result(missing);
}

export function expenseDeviceRowsReadiness(expense: ExpenseInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  expense.devices.forEach((row, index) => {
    if (!isPresentNumber(row.actualWatts)) missing.push(`devices[${index}].actualWatts`);
    if (!isPresentNumber(row.quantity) || row.quantity < 1 || !Number.isInteger(row.quantity)) {
      missing.push(`devices[${index}].quantity`);
    }
  });
  return result(missing);
}

export function expenseNutrientRowsReadiness(expense: ExpenseInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  expense.nutrients.forEach((row, index) => {
    if (row.pricingMode === "manual_weekly") {
      if (!isPresentNumber(row.manualWeeklyCost)) {
        missing.push(`nutrients[${index}].manualWeeklyCost`);
      }
      return;
    }
    if (!isPresentNumber(row.packagePrice)) missing.push(`nutrients[${index}].packagePrice`);
    if (!isPresentNumber(row.usableAmount)) missing.push(`nutrients[${index}].usableAmount`);
    if (!isPresentNumber(row.usagePerWeek)) missing.push(`nutrients[${index}].usagePerWeek`);
  });
  return result(missing);
}

export function expenseLineItemsReadiness(expense: ExpenseInputs): GrowHelpReadinessResult {
  const missing: string[] = [];
  expense.setup.forEach((row, index) => {
    if (!isPresentNumber(row.amount)) missing.push(`setup[${index}].amount`);
  });
  expense.recurring.forEach((row, index) => {
    if (!isPresentNumber(row.amount)) missing.push(`recurring[${index}].amount`);
  });
  return result(missing);
}

/**
 * Expense summary / cost-sheet export readiness. Fail closed when any required
 * planning input is explicitly missing — do not fabricate zero results.
 */
export function expenseExportReadiness(
  expense: ExpenseInputs,
  cycle: CycleInputs,
): GrowHelpReadinessResult {
  const missing = [
    ...expenseCoreCycleReadiness(cycle).missing,
    ...cyclePhotoperiodReadiness(cycle).missing,
    ...expenseAmortizationReadiness(expense).missing,
    ...expenseWaterReadiness(expense).missing,
    ...expenseDeviceRowsReadiness(expense).missing,
    ...expenseNutrientRowsReadiness(expense).missing,
    ...expenseLineItemsReadiness(expense).missing,
  ];
  return result(missing);
}

/** Alias used by the expense calculator tab for on-screen summary gating. */
export function expenseSummaryReadiness(
  expense: ExpenseInputs,
  cycle: CycleInputs,
): GrowHelpReadinessResult {
  return expenseExportReadiness(expense, cycle);
}

/** Same 0–10 finite range the Nutrient tab accepts before treating measured EC as usable. */
export function isValidMeasuredMixedEc(value: number | null | undefined): value is number {
  return isPresentNumber(value) && value >= 0 && value <= 10;
}

export function measuredMixedEcSourceLabel(value: number | null): string | null {
  if (!isValidMeasuredMixedEc(value)) return null;
  return MEASURED_MIXED_EC_SOURCE_LABEL;
}

export function isManualMeasuredMixedEcSource(source: string | null | undefined): boolean {
  return source === MEASURED_MIXED_EC_SOURCE;
}

/** Injector ratio is a required planning input when the injector plan is enabled. */
export function nutrientInjectorReadiness(nutrient: NutrientInputs): GrowHelpReadinessResult {
  if (!nutrient.injectorEnabled) return result([]);
  const missing: string[] = [];
  if (!isPresentNumber(nutrient.stockGramsPerGallon) || nutrient.stockGramsPerGallon <= 0) {
    missing.push("stockGramsPerGallon");
  }
  if (
    !isPresentNumber(nutrient.injectorRatio) ||
    nutrient.injectorRatio < 1 ||
    !Number.isInteger(nutrient.injectorRatio)
  ) {
    missing.push("injectorRatio");
  }
  return result(missing);
}
