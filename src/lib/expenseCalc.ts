import {
  G_PER_LB,
  G_PER_OZ,
  cost,
  kwh,
  requireHours,
  requireNonNegative,
  requirePositive,
} from "./unitsCalc";

export interface ElectricityDeviceInput {
  id: string;
  name: string;
  actualWatts: number;
  quantity: number;
  vegHoursPerDay: number;
  flowerHoursPerDay: number;
  vegDays: number;
  flowerDays: number;
  linkedFromLight?: boolean;
}

export interface ElectricityDeviceResult extends ElectricityDeviceInput {
  vegKwh: number;
  flowerKwh: number;
  cycleKwh: number;
  vegCost: number;
  flowerCost: number;
  cycleCost: number;
  dailyAverageKwh: number;
  thirtyDayKwh: number;
  yearlyKwh: number;
  thirtyDayCost: number;
  yearlyCost: number;
  formula: string;
}

export type ConsumableUnit = "ml" | "g";
export type NutrientPricingMode = "package" | "manual_weekly";

export interface NutrientCostInput {
  id: string;
  name: string;
  packagePrice: number;
  usableAmount: number;
  unit: ConsumableUnit;
  usagePerWeek: number;
  pricingMode?: NutrientPricingMode;
  manualWeeklyCost?: number;
  linkedFromRecipe?: boolean;
}

export interface NutrientCostResult extends NutrientCostInput {
  costPerUnit: number | null;
  weeklyCost: number;
  cycleCost: number;
  thirtyDayCost: number;
  yearlyCost: number;
  formula: string;
}

export interface WaterCostInput {
  pricePerGallon: number;
  gallonsPerReservoirChange: number;
  changesPerWeek: number;
}

export interface WaterCostResult extends WaterCostInput {
  weeklyGallons: number;
  cycleCost: number;
  thirtyDayCost: number;
  yearlyCost: number;
  formula: string;
}

export interface SetupCostInput {
  id: string;
  name: string;
  amount: number;
}

export interface RecurringCostInput {
  id: string;
  name: string;
  amount: number;
  basis: "cycle" | "month";
}

export interface ExpenseUnitCosts {
  perGram: number;
  perOunce: number;
  perPound: number;
  perKilogram: number;
  formula: string;
}

export const EXPENSE_COMPARISON_FORMULAS = {
  comparisonValue: "comparison value = user-entered price/g × user-entered dried saleable grams",
  operatingSavings: "operating-cycle savings = comparison value − operating cycle cost",
  operatingRoi:
    "operating ROI % = (comparison value − operating cycle cost) ÷ operating cycle cost × 100",
  setupPayback: "setup payback cycles = setup total ÷ positive operating-cycle savings",
} as const;

export interface ExpenseComparisonInput {
  compareAtPricePerGram: number | null;
  driedSaleableGrams: number | null;
  operatingCycleCost: number;
  setupCost: number;
}

export interface ExpenseComparisonResult {
  comparisonValue: number | null;
  operatingCycleSavings: number | null;
  operatingRoiPercent: number | null;
  setupPaybackCycles: number | null;
}

export interface ExpenseSummaryInput {
  devices: ReadonlyArray<ElectricityDeviceInput>;
  nutrients: ReadonlyArray<NutrientCostInput>;
  water: WaterCostInput;
  setup: ReadonlyArray<SetupCostInput>;
  recurring: ReadonlyArray<RecurringCostInput>;
  electricityRate: number;
  cycleDays: number;
  driedSaleableGrams: number | null;
  amortizationCycles: number;
  compareAtPricePerGram: number | null;
}

export interface ExpenseSummary {
  deviceResults: ElectricityDeviceResult[];
  nutrientResults: NutrientCostResult[];
  waterResult: WaterCostResult;
  electricityVegKwh: number;
  electricityFlowerKwh: number;
  electricityCycleKwh: number;
  electricityThirtyDayKwh: number;
  electricityYearlyKwh: number;
  electricityVegCost: number;
  electricityFlowerCost: number;
  electricityCycleCost: number;
  nutrientCycleCost: number;
  waterCycleCost: number;
  recurringCycleCost: number;
  operatingCycleCost: number;
  setupCost: number;
  firstCycleCost: number;
  amortizedCycleCost: number;
  thirtyDayOperatingCost: number;
  yearlyOperatingCost: number;
  firstCycleUnitCosts: ExpenseUnitCosts | null;
  amortizedUnitCosts: ExpenseUnitCosts | null;
  operatingUnitCosts: ExpenseUnitCosts | null;
  compareAtHarvestValue: number | null;
  operatingCycleSavings: number | null;
  operatingRoiPercent: number | null;
  setupPaybackCycles: number | null;
  firstCycleDifferenceFromCompareAt: number | null;
  formula: string;
}

export function calculateElectricityDevice(
  device: ElectricityDeviceInput,
  ratePerKwh: number,
): ElectricityDeviceResult {
  requireNonNegative(`${device.name || "Device"} actual watts`, device.actualWatts);
  requirePositive(`${device.name || "Device"} quantity`, device.quantity);
  requireHours("Vegetative hours per day", device.vegHoursPerDay);
  requireHours("Flower hours per day", device.flowerHoursPerDay);
  requireNonNegative("Vegetative days", device.vegDays);
  requireNonNegative("Flower days", device.flowerDays);
  requireNonNegative("Electricity rate", ratePerKwh);

  const totalWatts = device.actualWatts * device.quantity;
  const vegKwh = kwh(totalWatts, device.vegHoursPerDay, device.vegDays);
  const flowerKwh = kwh(totalWatts, device.flowerHoursPerDay, device.flowerDays);
  const cycleKwh = vegKwh + flowerKwh;
  const cycleDays = device.vegDays + device.flowerDays;
  const dailyAverageKwh = cycleDays > 0 ? cycleKwh / cycleDays : 0;
  return {
    ...device,
    vegKwh,
    flowerKwh,
    cycleKwh,
    vegCost: cost(vegKwh, ratePerKwh),
    flowerCost: cost(flowerKwh, ratePerKwh),
    cycleCost: cost(cycleKwh, ratePerKwh),
    dailyAverageKwh,
    thirtyDayKwh: dailyAverageKwh * 30,
    yearlyKwh: dailyAverageKwh * 365,
    thirtyDayCost: cost(dailyAverageKwh * 30, ratePerKwh),
    yearlyCost: cost(dailyAverageKwh * 365, ratePerKwh),
    formula: "kWh = (actual watts × quantity ÷ 1,000) × hours/day × days",
  };
}

export function calculateNutrientCost(
  input: NutrientCostInput,
  cycleDays: number,
): NutrientCostResult {
  requirePositive("Cycle days", cycleDays);
  const pricingMode = input.pricingMode ?? "package";
  let costPerUnit: number | null;
  let weeklyCost: number;
  switch (pricingMode) {
    case "package":
      requireNonNegative(`${input.name || "Nutrient"} package price`, input.packagePrice);
      requirePositive(`${input.name || "Nutrient"} usable amount`, input.usableAmount);
      requireNonNegative(`${input.name || "Nutrient"} weekly use`, input.usagePerWeek);
      if (input.unit !== "ml" && input.unit !== "g") {
        throw new RangeError("Nutrient usable unit must be ml or g");
      }
      costPerUnit = input.packagePrice / input.usableAmount;
      weeklyCost = costPerUnit * input.usagePerWeek;
      break;
    case "manual_weekly":
      costPerUnit = null;
      weeklyCost = requireNonNegative(
        `${input.name || "Nutrient"} manual weekly cost`,
        input.manualWeeklyCost ?? 0,
      );
      break;
    default:
      throw new RangeError("Nutrient pricing mode is not supported");
  }
  return {
    ...input,
    pricingMode,
    costPerUnit,
    weeklyCost,
    cycleCost: weeklyCost * (cycleDays / 7),
    thirtyDayCost: weeklyCost * (30 / 7),
    yearlyCost: weeklyCost * (365 / 7),
    formula: "cost = (package price ÷ usable amount) × recipe use per week × cycle weeks",
  };
}

export function calculateWaterCost(input: WaterCostInput, cycleDays: number): WaterCostResult {
  requireNonNegative("Water price per gallon", input.pricePerGallon);
  requireNonNegative("Gallons per reservoir change", input.gallonsPerReservoirChange);
  requireNonNegative("Reservoir changes per week", input.changesPerWeek);
  requirePositive("Cycle days", cycleDays);
  const weeklyGallons = input.gallonsPerReservoirChange * input.changesPerWeek;
  const weeklyCost = weeklyGallons * input.pricePerGallon;
  return {
    ...input,
    weeklyGallons,
    cycleCost: weeklyCost * (cycleDays / 7),
    thirtyDayCost: weeklyCost * (30 / 7),
    yearlyCost: weeklyCost * (365 / 7),
    formula: "water cost = $/gal × gal/change × changes/week × cycle weeks",
  };
}

export function costPerGram(totalCost: number, driedSaleableGrams: number): number {
  requireNonNegative("Total cost", totalCost);
  return totalCost / requirePositive("Dried saleable harvest grams", driedSaleableGrams);
}

export function calculateUnitCosts(
  totalCost: number,
  driedSaleableGrams: number,
): ExpenseUnitCosts {
  const perGram = costPerGram(totalCost, driedSaleableGrams);
  return {
    perGram,
    perOunce: perGram * G_PER_OZ,
    perPound: perGram * G_PER_LB,
    perKilogram: perGram * 1000,
    formula: "cost/g = total cost ÷ dried saleable grams",
  };
}

/**
 * Scenario math based only on grower-entered price and dried saleable weight.
 * Ratios with non-positive denominators are omitted rather than guessed.
 */
export function calculateExpenseComparison(input: ExpenseComparisonInput): ExpenseComparisonResult {
  requireNonNegative("Operating cycle cost", input.operatingCycleCost);
  requireNonNegative("Setup cost", input.setupCost);
  if (input.driedSaleableGrams !== null) {
    requirePositive("Dried saleable harvest grams", input.driedSaleableGrams);
  }
  if (input.compareAtPricePerGram !== null) {
    requireNonNegative("User-entered comparison price", input.compareAtPricePerGram);
  }
  if (input.driedSaleableGrams === null || input.compareAtPricePerGram === null) {
    return {
      comparisonValue: null,
      operatingCycleSavings: null,
      operatingRoiPercent: null,
      setupPaybackCycles: null,
    };
  }

  const comparisonValue = input.driedSaleableGrams * input.compareAtPricePerGram;
  const operatingCycleSavings = comparisonValue - input.operatingCycleCost;
  return {
    comparisonValue,
    operatingCycleSavings,
    operatingRoiPercent:
      input.operatingCycleCost > 0
        ? (operatingCycleSavings / input.operatingCycleCost) * 100
        : null,
    setupPaybackCycles:
      input.setupCost > 0 && operatingCycleSavings > 0
        ? input.setupCost / operatingCycleSavings
        : null,
  };
}

function sum(values: ReadonlyArray<number>): number {
  return values.reduce((total, value) => total + value, 0);
}

export function calculateExpenseSummary(input: ExpenseSummaryInput): ExpenseSummary {
  requireNonNegative("Electricity rate", input.electricityRate);
  requirePositive("Cycle days", input.cycleDays);
  requirePositive("Amortization cycles", input.amortizationCycles);
  if (!Number.isInteger(input.amortizationCycles)) {
    throw new RangeError("Amortization cycles must be a whole number");
  }

  const deviceResults = input.devices.map((device) =>
    calculateElectricityDevice(device, input.electricityRate),
  );
  const nutrientResults = input.nutrients.map((nutrient) =>
    calculateNutrientCost(nutrient, input.cycleDays),
  );
  const waterResult = calculateWaterCost(input.water, input.cycleDays);
  const electricityCycleCost = sum(deviceResults.map((row) => row.cycleCost));
  const nutrientCycleCost = sum(nutrientResults.map((row) => row.cycleCost));
  const waterCycleCost = waterResult.cycleCost;

  const recurringCycleCost = sum(
    input.recurring.map((row) => {
      requireNonNegative(`${row.name || "Recurring item"} amount`, row.amount);
      switch (row.basis) {
        case "cycle":
          return row.amount;
        case "month":
          return row.amount * (input.cycleDays / 30);
        default:
          throw new RangeError("Recurring cost basis is not supported");
      }
    }),
  );
  const recurringThirtyDayCost = sum(
    input.recurring.map((row) => {
      switch (row.basis) {
        case "month":
          return row.amount;
        case "cycle":
          return row.amount * (30 / input.cycleDays);
        default:
          throw new RangeError("Recurring cost basis is not supported");
      }
    }),
  );
  const recurringYearlyCost = sum(
    input.recurring.map((row) => {
      switch (row.basis) {
        case "month":
          return row.amount * (365 / 30);
        case "cycle":
          return row.amount * (365 / input.cycleDays);
        default:
          throw new RangeError("Recurring cost basis is not supported");
      }
    }),
  );
  const setupCost = sum(
    input.setup.map((row) => {
      requireNonNegative(`${row.name || "Setup item"} amount`, row.amount);
      return row.amount;
    }),
  );

  const operatingCycleCost =
    electricityCycleCost + nutrientCycleCost + waterCycleCost + recurringCycleCost;
  const firstCycleCost = operatingCycleCost + setupCost;
  const amortizedCycleCost = operatingCycleCost + setupCost / input.amortizationCycles;
  const thirtyDayOperatingCost =
    sum(deviceResults.map((row) => row.thirtyDayCost)) +
    sum(nutrientResults.map((row) => row.thirtyDayCost)) +
    waterResult.thirtyDayCost +
    recurringThirtyDayCost;
  const yearlyOperatingCost =
    sum(deviceResults.map((row) => row.yearlyCost)) +
    sum(nutrientResults.map((row) => row.yearlyCost)) +
    waterResult.yearlyCost +
    recurringYearlyCost;

  const driedGrams = input.driedSaleableGrams;
  const comparison = calculateExpenseComparison({
    compareAtPricePerGram: input.compareAtPricePerGram,
    driedSaleableGrams: driedGrams,
    operatingCycleCost,
    setupCost,
  });

  return {
    deviceResults,
    nutrientResults,
    waterResult,
    electricityVegKwh: sum(deviceResults.map((row) => row.vegKwh)),
    electricityFlowerKwh: sum(deviceResults.map((row) => row.flowerKwh)),
    electricityCycleKwh: sum(deviceResults.map((row) => row.cycleKwh)),
    electricityThirtyDayKwh: sum(deviceResults.map((row) => row.thirtyDayKwh)),
    electricityYearlyKwh: sum(deviceResults.map((row) => row.yearlyKwh)),
    electricityVegCost: sum(deviceResults.map((row) => row.vegCost)),
    electricityFlowerCost: sum(deviceResults.map((row) => row.flowerCost)),
    electricityCycleCost,
    nutrientCycleCost,
    waterCycleCost,
    recurringCycleCost,
    operatingCycleCost,
    setupCost,
    firstCycleCost,
    amortizedCycleCost,
    thirtyDayOperatingCost,
    yearlyOperatingCost,
    firstCycleUnitCosts:
      driedGrams === null ? null : calculateUnitCosts(firstCycleCost, driedGrams),
    amortizedUnitCosts:
      driedGrams === null ? null : calculateUnitCosts(amortizedCycleCost, driedGrams),
    operatingUnitCosts:
      driedGrams === null ? null : calculateUnitCosts(operatingCycleCost, driedGrams),
    compareAtHarvestValue: comparison.comparisonValue,
    operatingCycleSavings: comparison.operatingCycleSavings,
    operatingRoiPercent: comparison.operatingRoiPercent,
    setupPaybackCycles: comparison.setupPaybackCycles,
    firstCycleDifferenceFromCompareAt:
      comparison.comparisonValue === null ? null : comparison.comparisonValue - firstCycleCost,
    formula: "first cycle = operating + all setup; amortized cycle = operating + setup ÷ cycles",
  };
}
