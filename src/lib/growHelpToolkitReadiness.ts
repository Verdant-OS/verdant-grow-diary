import type {
  CycleInputs,
  ExpenseInputs,
  LightInputs,
  NutrientInputs,
} from "./growHelpToolkitState";

export interface CalculationResult<T> {
  value: T | null;
  error: string | null;
}

/** Run a pure calculation only after its required inputs are present. */
export function calculateWhenReady<T>(ready: boolean, calculate: () => T): CalculationResult<T> {
  if (!ready) return { value: null, error: null };
  try {
    return { value: calculate(), error: null };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : "Check the inputs." };
  }
}

export function hasPositiveCanopyDimensions(inputs: LightInputs): boolean {
  return (
    inputs.canopyLength !== null &&
    inputs.canopyLength > 0 &&
    inputs.canopyWidth !== null &&
    inputs.canopyWidth > 0
  );
}

export function hasCompleteFivePointReading(inputs: LightInputs): boolean {
  return Object.values(inputs.fivePoint).every((value) => value !== null);
}

export function isExpenseSummaryReady(inputs: ExpenseInputs, cycle: CycleInputs): boolean {
  const waterStarted =
    inputs.waterPricePerGallon !== null ||
    inputs.waterGallonsPerChange !== null ||
    inputs.waterChangesPerWeek !== null;
  const waterReady =
    !waterStarted ||
    (inputs.waterPricePerGallon !== null &&
      inputs.waterGallonsPerChange !== null &&
      inputs.waterChangesPerWeek !== null);
  const nutrientsReady = inputs.nutrients.every((row) =>
    row.pricingMode === "manual_weekly"
      ? row.manualWeeklyCost !== null
      : row.packagePrice !== null && row.usableAmount !== null && row.usagePerWeek !== null,
  );

  return (
    cycle.vegDays !== null &&
    cycle.flowerDays !== null &&
    cycle.vegPhotoperiodHours !== null &&
    cycle.flowerPhotoperiodHours !== null &&
    cycle.electricityRate !== null &&
    inputs.amortizationCycles !== null &&
    waterReady &&
    inputs.devices.every((row) => row.actualWatts !== null) &&
    nutrientsReady &&
    inputs.setup.every((row) => row.amount !== null) &&
    inputs.recurring.every((row) => row.amount !== null)
  );
}

export function hasNutrientPrimaryResult(
  mode: NutrientInputs["mode"],
  results: Readonly<Record<NutrientInputs["mode"], boolean>>,
): boolean {
  return results[mode];
}
