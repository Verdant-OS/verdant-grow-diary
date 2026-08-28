import {
  L_PER_GAL,
  ML_PER_TSP,
  cfFromEc,
  ecFromPpm,
  gallonsToLiters,
  litersToGallons,
  ppm500,
  ppm640,
  ppm700,
  requireNonNegative,
  requirePositive,
} from "./unitsCalc";

export type ReservoirVolumeUnit = "gal" | "L";
export type NutrientDoseUnit = "ml/L" | "ml/gal" | "g/gal" | "tsp/gal";
export type NutrientStrengthInputKind = "ec" | "ppm500" | "ppm700" | "cf";

export interface ReservoirVolume {
  value: number;
  unit: ReservoirVolumeUnit;
}

export interface LabelRatePart {
  id: string;
  name: string;
  dose: number;
  unit: NutrientDoseUnit;
}

export interface LabelRateResultRow extends LabelRatePart {
  amount: number;
  amountUnit: "ml" | "g";
  perGallon: number;
  perLiter: number;
  formula: string;
}

export interface LabelRateRecipeResult {
  rows: LabelRateResultRow[];
  reservoirGallons: number;
  reservoirLiters: number;
  totalVolumeMl: number;
  totalMassG: number;
}

export interface EcTargetPart {
  id: string;
  name: string;
  ecPerMlPerL: number;
  /** Relative part volume. Omitted legacy values are treated as 1; null is an invalid UI draft. */
  ratio?: number | null;
}

export interface EcTargetResultRow extends EcTargetPart {
  ratio: number;
  mlPerLiter: number;
  reservoirMl: number;
  formula: string;
}

export interface EcTargetRecipeResult {
  ecIncrease: number;
  baseMlPerLiter: number;
  rows: EcTargetResultRow[];
  totalVolumeMl: number;
  formula: string;
}

export interface DrySaltRow {
  id: string;
  name: string;
  gramsPerGallon: number;
  mixOrder?: number;
}

export interface DrySaltResultRow extends DrySaltRow {
  reservoirGrams: number;
  gramsPerLiter: number;
  formula: string;
}

export interface InjectorPlan {
  stockGramsPerGallon: number;
  ratio: number;
  stockMlPerFinalGallon: number;
  stockMlForReservoir: number;
  dissolvedGramsDelivered: number;
  formula: string;
}

export interface NutrientStrengthConversion {
  ecMsCm: number;
  ppm500: number;
  ppm640: number;
  ppm700: number;
  cf: number;
}

export interface StageEcReference {
  id: "seedling" | "early_veg" | "late_veg" | "early_flower" | "late_flower";
  label: string;
  minEc: number;
  maxEc: number;
}

/**
 * Convert the grower's existing working-volume value when only the displayed
 * reservoir unit changes. Invalid signed drafts stay signed so the input can
 * continue to show its inline error instead of being silently replaced.
 */
export function convertReservoirVolumeValue(
  value: number | null,
  fromUnit: ReservoirVolumeUnit,
  toUnit: ReservoirVolumeUnit,
): number | null {
  if (value === null || fromUnit === toUnit) return value;
  if (fromUnit === "gal" && toUnit === "L") return value * L_PER_GAL;
  if (fromUnit === "L" && toUnit === "gal") return value / L_PER_GAL;
  throw new RangeError("Working reservoir unit must be gal or L");
}

export const STAGE_EC_REFERENCES: ReadonlyArray<StageEcReference> = Object.freeze([
  { id: "seedling", label: "Seedling", minEc: 0.4, maxEc: 0.8 },
  { id: "early_veg", label: "Early veg", minEc: 0.8, maxEc: 1.4 },
  { id: "late_veg", label: "Late veg", minEc: 1.4, maxEc: 2.0 },
  { id: "early_flower", label: "Early flower", minEc: 2.0, maxEc: 2.4 },
  { id: "late_flower", label: "Late flower", minEc: 2.4, maxEc: 2.8 },
]);

/**
 * One cited recipe preset, not a brand lock-in. The order follows the
 * manufacturer's instructions: Part A, Epsom, then calcium nitrate.
 */
export const JACKS_321_STYLE_PRESET: ReadonlyArray<DrySaltRow> = Object.freeze([
  {
    id: "part-a",
    name: "Part A (5-12-26)",
    gramsPerGallon: 3.6,
    mixOrder: 1,
  },
  { id: "epsom", name: "Epsom salt", gramsPerGallon: 1.1, mixOrder: 2 },
  {
    id: "part-b",
    name: "Part B (calcium nitrate)",
    gramsPerGallon: 2.4,
    mixOrder: 3,
  },
]);

export function normalizeReservoir(volume: ReservoirVolume): {
  gallons: number;
  liters: number;
} {
  requirePositive("Working reservoir volume", volume.value);
  switch (volume.unit) {
    case "gal":
      return { gallons: volume.value, liters: gallonsToLiters(volume.value) };
    case "L":
      return { gallons: litersToGallons(volume.value), liters: volume.value };
    default:
      throw new RangeError("Working reservoir unit must be gal or L");
  }
}

export function calculateLabelRatePart(
  part: LabelRatePart,
  volume: ReservoirVolume,
): LabelRateResultRow {
  requireNonNegative(`${part.name || "Nutrient"} dose`, part.dose);
  const reservoir = normalizeReservoir(volume);

  switch (part.unit) {
    case "ml/L":
      return {
        ...part,
        amount: part.dose * reservoir.liters,
        amountUnit: "ml",
        perGallon: part.dose * L_PER_GAL,
        perLiter: part.dose,
        formula: "mL = dose (mL/L) × working liters",
      };
    case "ml/gal":
      return {
        ...part,
        amount: part.dose * reservoir.gallons,
        amountUnit: "ml",
        perGallon: part.dose,
        perLiter: part.dose / L_PER_GAL,
        formula: "mL = dose (mL/gal) × working gallons",
      };
    case "g/gal":
      return {
        ...part,
        amount: part.dose * reservoir.gallons,
        amountUnit: "g",
        perGallon: part.dose,
        perLiter: part.dose / L_PER_GAL,
        formula: "g = dose (g/gal) × working gallons",
      };
    case "tsp/gal": {
      const mlPerGallon = part.dose * ML_PER_TSP;
      return {
        ...part,
        amount: mlPerGallon * reservoir.gallons,
        amountUnit: "ml",
        perGallon: mlPerGallon,
        perLiter: mlPerGallon / L_PER_GAL,
        formula: `mL = dose (tsp/gal) × ${ML_PER_TSP} mL/tsp × working gallons`,
      };
    }
    default:
      throw new RangeError("Nutrient dose unit is not supported");
  }
}

export function calculateLabelRateRecipe(
  parts: ReadonlyArray<LabelRatePart>,
  volume: ReservoirVolume,
): LabelRateRecipeResult {
  const reservoir = normalizeReservoir(volume);
  const rows = parts.map((part) => calculateLabelRatePart(part, volume));
  return {
    rows,
    reservoirGallons: reservoir.gallons,
    reservoirLiters: reservoir.liters,
    totalVolumeMl: rows
      .filter((row) => row.amountUnit === "ml")
      .reduce((sum, row) => sum + row.amount, 0),
    totalMassG: rows
      .filter((row) => row.amountUnit === "g")
      .reduce((sum, row) => sum + row.amount, 0),
  };
}

export function calculateEcTargetDose(
  sourceWaterEc: number,
  targetEc: number,
  ecPerMlPerL: number,
): number {
  requireNonNegative("Source-water EC", sourceWaterEc);
  requirePositive("Target EC", targetEc);
  requirePositive("EC raised by 1 mL in 1 L", ecPerMlPerL);
  if (sourceWaterEc >= targetEc) {
    throw new RangeError("Source-water EC must be below target EC");
  }
  return (targetEc - sourceWaterEc) / ecPerMlPerL;
}

export function calculateEcTargetRecipe(
  sourceWaterEc: number,
  targetEc: number,
  parts: ReadonlyArray<EcTargetPart>,
  volume: ReservoirVolume,
): EcTargetRecipeResult {
  const reservoir = normalizeReservoir(volume);
  requireNonNegative("Source-water EC", sourceWaterEc);
  requirePositive("Target EC", targetEc);
  if (sourceWaterEc >= targetEc) {
    throw new RangeError("Source-water EC must be below target EC");
  }
  if (parts.length < 1 || parts.length > 3) {
    throw new RangeError("EC target mode requires 1 to 3 parts");
  }
  const ecIncrease = targetEc - sourceWaterEc;
  const normalizedParts = parts.map((part) => {
    const ecPerMlPerL = requirePositive(`${part.name || "Nutrient"} EC-per-mL/L`, part.ecPerMlPerL);
    if (part.ratio === null) {
      throw new RangeError(`${part.name || "Nutrient"} ratio must be greater than 0`);
    }
    const ratio =
      part.ratio === undefined
        ? 1
        : requirePositive(`${part.name || "Nutrient"} ratio`, part.ratio);
    return { ...part, ecPerMlPerL, ratio };
  });
  const weightedEcContribution = normalizedParts.reduce(
    (sum, part) => sum + part.ecPerMlPerL * part.ratio,
    0,
  );
  const baseMlPerLiter = ecIncrease / weightedEcContribution;
  const rows = normalizedParts.map((part) => {
    const mlPerLiter = baseMlPerLiter * part.ratio;
    return {
      ...part,
      mlPerLiter,
      reservoirMl: mlPerLiter * reservoir.liters,
      formula: `part mL/L = base mL/L × ratio (${part.ratio}:1)`,
    };
  });
  return {
    ecIncrease,
    baseMlPerLiter,
    rows,
    totalVolumeMl: rows.reduce((sum, row) => sum + row.reservoirMl, 0),
    formula:
      "base mL/L = (target EC − source-water EC) ÷ Σ(EC-per-mL/L × ratio); part mL/L = base × ratio",
  };
}

export function calculateC1V1(c1: number, c2: number, v2: number): number {
  requirePositive("Stock concentration (C1)", c1);
  requirePositive("Target concentration (C2)", c2);
  requirePositive("Final volume (V2)", v2);
  if (c2 > c1) throw new RangeError("Target concentration cannot exceed stock concentration");
  return (c2 * v2) / c1;
}

export function scaleDrySaltRecipe(
  rows: ReadonlyArray<DrySaltRow>,
  volume: ReservoirVolume,
): DrySaltResultRow[] {
  const reservoir = normalizeReservoir(volume);
  return rows
    .map((row, sourceIndex) => {
      requireNonNegative(`${row.name || "Dry salt"} grams per gallon`, row.gramsPerGallon);
      return {
        ...row,
        reservoirGrams: row.gramsPerGallon * reservoir.gallons,
        gramsPerLiter: row.gramsPerGallon / L_PER_GAL,
        formula: "g = recipe rate (g/gal) × working gallons",
        sourceIndex,
      };
    })
    .sort(
      (a, b) =>
        (a.mixOrder ?? Number.MAX_SAFE_INTEGER) - (b.mixOrder ?? Number.MAX_SAFE_INTEGER) ||
        a.sourceIndex - b.sourceIndex,
    )
    .map(({ sourceIndex: _sourceIndex, ...row }) => row);
}

export function scale321Style(gallons: number): {
  partA: number;
  partB: number;
  epsom: number;
} {
  requirePositive("Working reservoir gallons", gallons);
  return { partA: 3.6 * gallons, partB: 2.4 * gallons, epsom: 1.1 * gallons };
}

export function calculateInjectorPlan(
  stockGramsPerGallon: number,
  ratio: number,
  finalVolume: ReservoirVolume,
): InjectorPlan {
  requirePositive("Stock concentration", stockGramsPerGallon);
  requirePositive("Injector ratio", ratio);
  const reservoir = normalizeReservoir(finalVolume);
  const stockMlPerFinalGallon = (L_PER_GAL * 1000) / ratio;
  const stockMlForReservoir = stockMlPerFinalGallon * reservoir.gallons;
  return {
    stockGramsPerGallon,
    ratio,
    stockMlPerFinalGallon,
    stockMlForReservoir,
    dissolvedGramsDelivered: stockGramsPerGallon * (stockMlForReservoir / (L_PER_GAL * 1000)),
    formula: "stock mL per final gal = 3,785.411784 ÷ injector ratio",
  };
}

export function convertNutrientStrength(
  value: number,
  kind: NutrientStrengthInputKind,
): NutrientStrengthConversion {
  requireNonNegative("Nutrient strength", value);
  let ecMsCm: number;
  switch (kind) {
    case "ec":
      ecMsCm = value;
      break;
    case "ppm500":
      ecMsCm = ecFromPpm(value, 500);
      break;
    case "ppm700":
      ecMsCm = ecFromPpm(value, 700);
      break;
    case "cf":
      ecMsCm = value / 10;
      break;
    default:
      throw new RangeError("Nutrient strength input kind is not supported");
  }
  return {
    ecMsCm,
    ppm500: ppm500(ecMsCm),
    ppm640: ppm640(ecMsCm),
    ppm700: ppm700(ecMsCm),
    cf: cfFromEc(ecMsCm),
  };
}

export function remainingEcToTarget(targetEc: number, measuredMixedEc: number): number {
  requireNonNegative("Target EC", targetEc);
  requireNonNegative("Measured mixed EC", measuredMixedEc);
  return targetEc - measuredMixedEc;
}

export function stageReferenceMidpoint(reference: StageEcReference): number {
  return (reference.minEc + reference.maxEc) / 2;
}
