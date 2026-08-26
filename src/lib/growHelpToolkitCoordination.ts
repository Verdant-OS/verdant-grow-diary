import type {
  ExpenseDeviceInputState,
  ExpenseNutrientInputState,
  GrowHelpToolkitState,
  UnitSystem,
} from "./growHelpToolkitState";
import { L_PER_GAL } from "./unitsCalc";

const METERS_PER_FOOT = 0.3048;
const CENTIMETERS_PER_INCH = 2.54;

function convertNullable(value: number | null, factor: number): number | null {
  return value === null ? null : Number((value * factor).toFixed(6));
}

/** Convert visible dimensions so a unit toggle never reinterprets the same number. */
export function convertGrowHelpUnitSystem(
  state: GrowHelpToolkitState,
  nextUnitSystem: UnitSystem,
): GrowHelpToolkitState {
  if (state.unitSystem === nextUnitSystem) return state;
  const toMetric = nextUnitSystem === "metric";
  const reservoirFactor = toMetric ? L_PER_GAL : 1 / L_PER_GAL;
  const canopyFactor = toMetric ? METERS_PER_FOOT : 1 / METERS_PER_FOOT;
  const heightFactor = toMetric ? CENTIMETERS_PER_INCH : 1 / CENTIMETERS_PER_INCH;
  const waterPriceFactor = toMetric ? 1 / L_PER_GAL : L_PER_GAL;
  const waterVolumeFactor = toMetric ? L_PER_GAL : 1 / L_PER_GAL;
  return {
    ...state,
    unitSystem: nextUnitSystem,
    nutrient: {
      ...state.nutrient,
      reservoirValue: convertNullable(state.nutrient.reservoirValue, reservoirFactor),
      reservoirUnit: toMetric ? "L" : "gal",
    },
    light: {
      ...state.light,
      canopyLength: convertNullable(state.light.canopyLength, canopyFactor),
      canopyWidth: convertNullable(state.light.canopyWidth, canopyFactor),
      chartHeight: convertNullable(state.light.chartHeight, heightFactor),
      newHeight: convertNullable(state.light.newHeight, heightFactor),
      heightUnit: toMetric ? "cm" : "in",
    },
    expense: {
      ...state.expense,
      // Keep price × change volume invariant while changing the displayed basis.
      waterPricePerGallon: convertNullable(state.expense.waterPricePerGallon, waterPriceFactor),
      waterGallonsPerChange: convertNullable(
        state.expense.waterGallonsPerChange,
        waterVolumeFactor,
      ),
    },
  };
}

export function mergeLinkedLight(
  state: GrowHelpToolkitState,
  linkedRow: ExpenseDeviceInputState,
): GrowHelpToolkitState {
  const previous = state.expense.devices.find(
    (row) => row.linkedFromLight || row.id === linkedRow.id,
  );
  const row = previous
    ? {
        ...linkedRow,
        id: previous.id,
        name: previous.name || linkedRow.name,
        vegHoursPerDay: previous.vegHoursPerDay ?? linkedRow.vegHoursPerDay,
        flowerHoursPerDay: previous.flowerHoursPerDay ?? linkedRow.flowerHoursPerDay,
        vegDaysOverride: previous.vegDaysOverride,
        flowerDaysOverride: previous.flowerDaysOverride,
      }
    : linkedRow;
  const kept = state.expense.devices.filter(
    (candidate) => !candidate.linkedFromLight && candidate.id !== linkedRow.id,
  );
  return { ...state, expense: { ...state.expense, devices: [row, ...kept] } };
}

export function mergeLinkedNutrients(
  state: GrowHelpToolkitState,
  linkedRows: ExpenseNutrientInputState[],
): GrowHelpToolkitState {
  const existing = new Map(state.expense.nutrients.map((row) => [row.id, row]));
  const merged = linkedRows.map((row) => {
    const previous = existing.get(row.id);
    if (!previous) return row;
    return {
      ...row,
      name: previous.name || row.name,
      pricingMode: previous.pricingMode,
      packagePrice: previous.packagePrice,
      usableAmount: previous.usableAmount ?? row.usableAmount,
      manualWeeklyCost: previous.manualWeeklyCost,
    };
  });
  const manualRows = state.expense.nutrients.filter((row) => !row.linkedFromRecipe);
  return { ...state, expense: { ...state.expense, nutrients: [...merged, ...manualRows] } };
}
