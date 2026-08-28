import type {
  NutrientDoseUnit,
  NutrientStrengthInputKind,
  ReservoirVolumeUnit,
} from "./nutrientCalc";
import type { ConsumableUnit, NutrientPricingMode } from "./expenseCalc";

export const GROW_HELP_TOOLKIT_STORAGE_KEY = "verdant:growHelpToolkit:v1" as const;
export const GROW_HELP_TOOLKIT_PATH = "/tools/grow-help-toolkit" as const;

export type UnitSystem = "us" | "metric";
export type NutrientMode = "label" | "ec_target" | "c1v1" | "dry_salt" | "converter";

export interface CycleInputs {
  name: string;
  vegDays: number | null;
  flowerDays: number | null;
  vegPhotoperiodHours: number;
  flowerPhotoperiodHours: number;
  electricityRate: number | null;
  currency: string;
}

export interface LabelPartInput {
  id: string;
  name: string;
  dose: number | null;
  unit: NutrientDoseUnit;
}

export interface EcPartInput {
  id: string;
  name: string;
  ecPerMlPerL: number | null;
  /** Missing legacy values normalize to 1; null represents an editable blank draft. */
  ratio?: number | null;
}

export interface ElementalTargetsPpmInput {
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
}

export interface DrySaltInput {
  id: string;
  name: string;
  gramsPerGallon: number | null;
  bagSizeGrams: number | null;
  mixOrder: number;
}

export interface NutrientInputs {
  mode: NutrientMode;
  reservoirValue: number | null;
  reservoirUnit: ReservoirVolumeUnit;
  changesPerWeek: number | null;
  labelParts: LabelPartInput[];
  sourceWaterEc: number | null;
  targetEc: number | null;
  measuredMixedEc: number | null;
  ecParts: EcPartInput[];
  /** Grower-entered planning notes only; never used to infer nutrient dose. */
  elementalTargetsPpm: ElementalTargetsPpmInput;
  c1: number | null;
  c2: number | null;
  v2: number | null;
  c1v1Unit: string;
  drySaltRows: DrySaltInput[];
  injectorEnabled: boolean;
  stockGramsPerGallon: number | null;
  injectorRatio: number;
  converterKind: NutrientStrengthInputKind;
  converterValue: number | null;
}

export interface FivePointInputs {
  center: number | null;
  frontLeft: number | null;
  frontRight: number | null;
  backLeft: number | null;
  backRight: number | null;
}

export interface LightInputs {
  stage: "veg" | "flower";
  canopyLength: number | null;
  canopyWidth: number | null;
  ppfMode: "ppf" | "watts";
  fixtureCount: number;
  ppfPerFixture: number | null;
  actualWattsPerFixture: number | null;
  efficacy: number | null;
  canopyEfficiencyPercent: number;
  targetMode: "ppfd" | "dli";
  targetPpfd: number | null;
  targetDli: number | null;
  chartPpfd: number | null;
  chartHeight: number | null;
  newHeight: number | null;
  heightUnit: "in" | "cm";
  fivePoint: FivePointInputs;
  showHeatmap: boolean;
}

export interface ExpenseDeviceInputState {
  id: string;
  name: string;
  actualWatts: number | null;
  quantity: number;
  vegHoursPerDay: number | null;
  flowerHoursPerDay: number | null;
  vegDaysOverride: number | null;
  flowerDaysOverride: number | null;
  linkedFromLight?: boolean;
}

export interface ExpenseNutrientInputState {
  id: string;
  name: string;
  pricingMode: NutrientPricingMode;
  packagePrice: number | null;
  usableAmount: number | null;
  unit: ConsumableUnit;
  usagePerWeek: number | null;
  manualWeeklyCost: number | null;
  linkedFromRecipe?: boolean;
}

export interface SimpleCostInputState {
  id: string;
  name: string;
  amount: number | null;
}

export interface RecurringCostInputState extends SimpleCostInputState {
  basis: "cycle" | "month";
}

export interface ExpenseInputs {
  devices: ExpenseDeviceInputState[];
  nutrients: ExpenseNutrientInputState[];
  waterPricePerGallon: number | null;
  waterGallonsPerChange: number | null;
  waterChangesPerWeek: number | null;
  setup: SimpleCostInputState[];
  recurring: RecurringCostInputState[];
  driedSaleableGrams: number | null;
  amortizationCycles: number;
  compareAtPricePerGram: number | null;
}

export interface GrowHelpToolkitState {
  unitSystem: UnitSystem;
  cycle: CycleInputs;
  nutrient: NutrientInputs;
  light: LightInputs;
  expense: ExpenseInputs;
}

export function createDefaultGrowHelpToolkitState(): GrowHelpToolkitState {
  return {
    unitSystem: "us",
    cycle: {
      name: "My grow cycle",
      vegDays: null,
      flowerDays: null,
      vegPhotoperiodHours: 18,
      flowerPhotoperiodHours: 12,
      electricityRate: null,
      currency: "USD",
    },
    nutrient: {
      mode: "label",
      reservoirValue: null,
      reservoirUnit: "gal",
      changesPerWeek: null,
      labelParts: [{ id: "label-1", name: "Part A", dose: null, unit: "ml/gal" }],
      sourceWaterEc: null,
      targetEc: null,
      measuredMixedEc: null,
      ecParts: [{ id: "ec-1", name: "Part A", ecPerMlPerL: null, ratio: 1 }],
      elementalTargetsPpm: {
        nitrogen: null,
        phosphorus: null,
        potassium: null,
      },
      c1: null,
      c2: null,
      v2: null,
      c1v1Unit: "same volume unit",
      drySaltRows: [
        {
          id: "salt-1",
          name: "Dry salt A",
          gramsPerGallon: null,
          bagSizeGrams: null,
          mixOrder: 1,
        },
      ],
      injectorEnabled: false,
      stockGramsPerGallon: null,
      injectorRatio: 100,
      converterKind: "ec",
      converterValue: null,
    },
    light: {
      stage: "flower",
      canopyLength: null,
      canopyWidth: null,
      ppfMode: "ppf",
      fixtureCount: 1,
      ppfPerFixture: null,
      actualWattsPerFixture: null,
      efficacy: null,
      canopyEfficiencyPercent: 80,
      targetMode: "ppfd",
      targetPpfd: null,
      targetDli: null,
      chartPpfd: null,
      chartHeight: null,
      newHeight: null,
      heightUnit: "in",
      fivePoint: {
        center: null,
        frontLeft: null,
        frontRight: null,
        backLeft: null,
        backRight: null,
      },
      showHeatmap: false,
    },
    expense: {
      devices: [],
      nutrients: [],
      waterPricePerGallon: null,
      waterGallonsPerChange: null,
      waterChangesPerWeek: null,
      setup: [],
      recurring: [],
      driedSaleableGrams: null,
      amortizationCycles: 4,
      compareAtPricePerGram: null,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNullableNumber(value: unknown, fallback: number | null): number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value)) ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asEnum<T extends string>(value: unknown, allowed: ReadonlyArray<T>, fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/**
 * Treat localStorage as untrusted input. Unknown discriminants fall back to
 * safe defaults instead of silently choosing a calculation branch.
 */
export function normalizeGrowHelpToolkitState(value: unknown): GrowHelpToolkitState {
  const defaults = createDefaultGrowHelpToolkitState();
  if (!isRecord(value)) return defaults;
  const cycle = isRecord(value.cycle) ? value.cycle : {};
  const nutrient = isRecord(value.nutrient) ? value.nutrient : {};
  const elementalTargetsPpm = isRecord(nutrient.elementalTargetsPpm)
    ? nutrient.elementalTargetsPpm
    : {};
  const light = isRecord(value.light) ? value.light : {};
  const fivePoint = isRecord(light.fivePoint) ? light.fivePoint : {};
  const expense = isRecord(value.expense) ? value.expense : {};

  const labelParts = arrayOfRecords(nutrient.labelParts)
    .slice(0, 12)
    .map((row, index) => ({
      id: asString(row.id, `label-${index + 1}`),
      name: asString(row.name, `Part ${index + 1}`),
      dose: asNullableNumber(row.dose, null),
      unit: asEnum(row.unit, ["ml/L", "ml/gal", "g/gal", "tsp/gal"] as const, "ml/gal"),
    }));
  const ecParts = arrayOfRecords(nutrient.ecParts)
    .slice(0, 3)
    .map((row, index) => ({
      id: asString(row.id, `ec-${index + 1}`),
      name: asString(row.name, `Part ${index + 1}`),
      ecPerMlPerL: asNullableNumber(row.ecPerMlPerL, null),
      ratio: asNullableNumber(row.ratio, 1),
    }));
  const drySaltRows = arrayOfRecords(nutrient.drySaltRows)
    .slice(0, 12)
    .map((row, index) => ({
      id: asString(row.id, `salt-${index + 1}`),
      name: asString(row.name, `Dry salt ${index + 1}`),
      gramsPerGallon: asNullableNumber(row.gramsPerGallon, null),
      bagSizeGrams: asNullableNumber(row.bagSizeGrams, null),
      mixOrder: asNumber(row.mixOrder, index + 1),
    }));

  const devices = arrayOfRecords(expense.devices)
    .slice(0, 24)
    .map((row, index) => ({
      id: asString(row.id, `device-${index + 1}`),
      name: asString(row.name, `Device ${index + 1}`),
      actualWatts: asNullableNumber(row.actualWatts, null),
      quantity: asNumber(row.quantity, 1),
      vegHoursPerDay: asNullableNumber(row.vegHoursPerDay, null),
      flowerHoursPerDay: asNullableNumber(row.flowerHoursPerDay, null),
      vegDaysOverride: asNullableNumber(row.vegDaysOverride, null),
      flowerDaysOverride: asNullableNumber(row.flowerDaysOverride, null),
      linkedFromLight: asBoolean(row.linkedFromLight, false),
    }));
  const nutrients = arrayOfRecords(expense.nutrients)
    .slice(0, 24)
    .map((row, index) => ({
      id: asString(row.id, `expense-nutrient-${index + 1}`),
      name: asString(row.name, `Nutrient ${index + 1}`),
      pricingMode: asEnum(row.pricingMode, ["package", "manual_weekly"] as const, "package"),
      packagePrice: asNullableNumber(row.packagePrice, null),
      usableAmount: asNullableNumber(row.usableAmount, null),
      unit: asEnum(row.unit, ["ml", "g"] as const, "ml"),
      usagePerWeek: asNullableNumber(row.usagePerWeek, null),
      manualWeeklyCost: asNullableNumber(row.manualWeeklyCost, null),
      linkedFromRecipe: asBoolean(row.linkedFromRecipe, false),
    }));
  const setup = arrayOfRecords(expense.setup)
    .slice(0, 24)
    .map((row, index) => ({
      id: asString(row.id, `setup-${index + 1}`),
      name: asString(row.name, `Setup item ${index + 1}`),
      amount: asNullableNumber(row.amount, null),
    }));
  const recurring = arrayOfRecords(expense.recurring)
    .slice(0, 24)
    .map((row, index) => ({
      id: asString(row.id, `recurring-${index + 1}`),
      name: asString(row.name, `Recurring item ${index + 1}`),
      amount: asNullableNumber(row.amount, null),
      basis: asEnum(row.basis, ["cycle", "month"] as const, "cycle"),
    }));

  return {
    unitSystem: asEnum(value.unitSystem, ["us", "metric"] as const, defaults.unitSystem),
    cycle: {
      name: asString(cycle.name, defaults.cycle.name),
      vegDays: asNullableNumber(cycle.vegDays, defaults.cycle.vegDays),
      flowerDays: asNullableNumber(cycle.flowerDays, defaults.cycle.flowerDays),
      vegPhotoperiodHours: asNumber(cycle.vegPhotoperiodHours, defaults.cycle.vegPhotoperiodHours),
      flowerPhotoperiodHours: asNumber(
        cycle.flowerPhotoperiodHours,
        defaults.cycle.flowerPhotoperiodHours,
      ),
      electricityRate: asNullableNumber(cycle.electricityRate, defaults.cycle.electricityRate),
      currency: asString(cycle.currency, defaults.cycle.currency).slice(0, 3).toUpperCase(),
    },
    nutrient: {
      mode: asEnum(
        nutrient.mode,
        ["label", "ec_target", "c1v1", "dry_salt", "converter"] as const,
        defaults.nutrient.mode,
      ),
      reservoirValue: asNullableNumber(nutrient.reservoirValue, defaults.nutrient.reservoirValue),
      reservoirUnit: asEnum(
        nutrient.reservoirUnit,
        ["gal", "L"] as const,
        defaults.nutrient.reservoirUnit,
      ),
      changesPerWeek: asNullableNumber(nutrient.changesPerWeek, defaults.nutrient.changesPerWeek),
      labelParts: labelParts.length > 0 ? labelParts : defaults.nutrient.labelParts,
      sourceWaterEc: asNullableNumber(nutrient.sourceWaterEc, null),
      targetEc: asNullableNumber(nutrient.targetEc, null),
      measuredMixedEc: asNullableNumber(nutrient.measuredMixedEc, null),
      ecParts: ecParts.length > 0 ? ecParts : defaults.nutrient.ecParts,
      elementalTargetsPpm: {
        nitrogen: asNullableNumber(elementalTargetsPpm.nitrogen, null),
        phosphorus: asNullableNumber(elementalTargetsPpm.phosphorus, null),
        potassium: asNullableNumber(elementalTargetsPpm.potassium, null),
      },
      c1: asNullableNumber(nutrient.c1, null),
      c2: asNullableNumber(nutrient.c2, null),
      v2: asNullableNumber(nutrient.v2, null),
      c1v1Unit: asString(nutrient.c1v1Unit, defaults.nutrient.c1v1Unit),
      drySaltRows: drySaltRows.length > 0 ? drySaltRows : defaults.nutrient.drySaltRows,
      injectorEnabled: asBoolean(nutrient.injectorEnabled, defaults.nutrient.injectorEnabled),
      stockGramsPerGallon: asNullableNumber(nutrient.stockGramsPerGallon, null),
      injectorRatio: asNumber(nutrient.injectorRatio, defaults.nutrient.injectorRatio),
      converterKind: asEnum(
        nutrient.converterKind,
        ["ec", "ppm500", "ppm700", "cf"] as const,
        defaults.nutrient.converterKind,
      ),
      converterValue: asNullableNumber(nutrient.converterValue, null),
    },
    light: {
      stage: asEnum(light.stage, ["veg", "flower"] as const, defaults.light.stage),
      canopyLength: asNullableNumber(light.canopyLength, null),
      canopyWidth: asNullableNumber(light.canopyWidth, null),
      ppfMode: asEnum(light.ppfMode, ["ppf", "watts"] as const, defaults.light.ppfMode),
      fixtureCount: asNumber(light.fixtureCount, defaults.light.fixtureCount),
      ppfPerFixture: asNullableNumber(light.ppfPerFixture, null),
      actualWattsPerFixture: asNullableNumber(light.actualWattsPerFixture, null),
      efficacy: asNullableNumber(light.efficacy, null),
      canopyEfficiencyPercent: asNumber(
        light.canopyEfficiencyPercent,
        defaults.light.canopyEfficiencyPercent,
      ),
      targetMode: asEnum(light.targetMode, ["ppfd", "dli"] as const, defaults.light.targetMode),
      targetPpfd: asNullableNumber(light.targetPpfd, null),
      targetDli: asNullableNumber(light.targetDli, null),
      chartPpfd: asNullableNumber(light.chartPpfd, null),
      chartHeight: asNullableNumber(light.chartHeight, null),
      newHeight: asNullableNumber(light.newHeight, null),
      heightUnit: asEnum(light.heightUnit, ["in", "cm"] as const, defaults.light.heightUnit),
      fivePoint: {
        center: asNullableNumber(fivePoint.center, null),
        frontLeft: asNullableNumber(fivePoint.frontLeft, null),
        frontRight: asNullableNumber(fivePoint.frontRight, null),
        backLeft: asNullableNumber(fivePoint.backLeft, null),
        backRight: asNullableNumber(fivePoint.backRight, null),
      },
      showHeatmap: asBoolean(light.showHeatmap, defaults.light.showHeatmap),
    },
    expense: {
      devices,
      nutrients,
      waterPricePerGallon: asNullableNumber(expense.waterPricePerGallon, null),
      waterGallonsPerChange: asNullableNumber(expense.waterGallonsPerChange, null),
      waterChangesPerWeek: asNullableNumber(expense.waterChangesPerWeek, null),
      setup,
      recurring,
      driedSaleableGrams: asNullableNumber(expense.driedSaleableGrams, null),
      amortizationCycles: asNumber(expense.amortizationCycles, defaults.expense.amortizationCycles),
      compareAtPricePerGram: asNullableNumber(expense.compareAtPricePerGram, null),
    },
  };
}

export function loadGrowHelpToolkitState(storage?: Storage | null): GrowHelpToolkitState {
  const fallback = createDefaultGrowHelpToolkitState();
  try {
    const resolvedStorage = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    const raw = resolvedStorage?.getItem(GROW_HELP_TOOLKIT_STORAGE_KEY);
    return raw ? normalizeGrowHelpToolkitState(JSON.parse(raw)) : fallback;
  } catch {
    return fallback;
  }
}

export function saveGrowHelpToolkitState(
  state: GrowHelpToolkitState,
  storage?: Storage | null,
): boolean {
  try {
    const resolvedStorage = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!resolvedStorage) return false;
    const serialized = JSON.stringify(normalizeGrowHelpToolkitState(state));
    resolvedStorage.setItem(GROW_HELP_TOOLKIT_STORAGE_KEY, serialized);
    return resolvedStorage.getItem(GROW_HELP_TOOLKIT_STORAGE_KEY) === serialized;
  } catch {
    return false;
  }
}

export function clearGrowHelpToolkitState(storage?: Storage | null): boolean {
  try {
    const resolvedStorage = storage ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!resolvedStorage) return false;
    resolvedStorage.removeItem(GROW_HELP_TOOLKIT_STORAGE_KEY);
    return resolvedStorage.getItem(GROW_HELP_TOOLKIT_STORAGE_KEY) === null;
  } catch {
    return false;
  }
}
