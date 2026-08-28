import {
  cost,
  dli,
  kwh,
  ppfEstimated,
  requireHours,
  requireNonNegative,
  requirePositive,
} from "./unitsCalc";

export type LightStage = "veg" | "flower";
export type ReferenceBandStatus = "below" | "in_range" | "above";

export interface FixtureRequirement {
  raw: number;
  roundedUp: number;
  formula: string;
}

export interface FivePointPpfd {
  center: number;
  frontLeft: number;
  frontRight: number;
  backLeft: number;
  backRight: number;
}

export interface UniformityResult {
  average: number;
  minimum: number;
  uminOverUavg: number | null;
  centerToCornerDelta: number;
  centerToCornerDeltaPercent: number | null;
  formula: string;
}

export interface LightCycleEnergy {
  vegKwh: number;
  flowerKwh: number;
  cycleKwh: number;
  vegCost: number;
  flowerCost: number;
  cycleCost: number;
  formula: string;
}

export interface EnergyCostPerMolResult {
  photonMoles: number;
  costPerMol: number;
  formula: string;
}

export interface LightReferenceBand {
  stage: LightStage;
  label: string;
  minPpfd: number;
  maxPpfd: number;
  note: string;
}

/** Typical planning references, never guarantees or plant-health diagnoses. */
export const LIGHT_REFERENCE_BANDS: ReadonlyArray<LightReferenceBand> = Object.freeze([
  {
    stage: "flower",
    label: "Flower planning reference",
    minPpfd: 600,
    maxPpfd: 900,
    note: "Common non-CO₂-enriched starting reference; verify at canopy with a PAR meter.",
  },
]);

export function resolveFixturePpf(input: {
  mode: "ppf" | "watts";
  ppfMicromolesPerSecond: number;
  actualWatts: number;
  efficacyMicromolesPerJoule: number;
}): { ppf: number; estimated: boolean; formula: string } {
  switch (input.mode) {
    case "ppf":
      return {
        ppf: requirePositive("Fixture PPF", input.ppfMicromolesPerSecond),
        estimated: false,
        formula: "PPF = manufacturer-reported photon flux",
      };
    case "watts":
      return {
        ppf: ppfEstimated(input.actualWatts, input.efficacyMicromolesPerJoule),
        estimated: true,
        formula: "estimated PPF (µmol/s) = actual watts × efficacy (µmol/J)",
      };
    default:
      throw new RangeError("Fixture PPF source mode is not supported");
  }
}

function requireFixtureCount(value: number): number {
  requirePositive("Fixture count", value);
  if (!Number.isInteger(value)) throw new RangeError("Fixture count must be a whole number");
  return value;
}

function requireCanopyEfficiency(value: number): number {
  requirePositive("Canopy efficiency", value);
  if (value < 0.5 || value > 1) {
    throw new RangeError("Canopy efficiency must be between 0.50 and 1.00");
  }
  return value;
}

export function planningAveragePpfd(
  ppfPerFixture: number,
  fixtureCount: number,
  areaM2: number,
  canopyEfficiency: number,
): number {
  requirePositive("Fixture PPF", ppfPerFixture);
  requireFixtureCount(fixtureCount);
  requirePositive("Canopy area", areaM2);
  requireCanopyEfficiency(canopyEfficiency);
  return (ppfPerFixture * fixtureCount * canopyEfficiency) / areaM2;
}

export function ppfdForTargetDli(targetDli: number, hours: number): number {
  requirePositive("Target DLI", targetDli);
  requireHours("Photoperiod", hours);
  return (targetDli * 1_000_000) / (hours * 3600);
}

export function inverseSquarePpfd(
  chartPpfd: number,
  chartHeight: number,
  newHeight: number,
): number {
  requirePositive("Chart PPFD", chartPpfd);
  requirePositive("Chart height", chartHeight);
  requirePositive("New height", newHeight);
  return chartPpfd * (chartHeight / newHeight) ** 2;
}

/** Convert displayed chart heights without changing the represented distance. */
export function convertLightHeightValue(
  value: number | null,
  fromUnit: "in" | "cm",
  toUnit: "in" | "cm",
): number | null {
  if (value === null || fromUnit === toUnit) return value;
  if (fromUnit === "in" && toUnit === "cm") return Number((value * 2.54).toFixed(6));
  if (fromUnit === "cm" && toUnit === "in") return Number((value / 2.54).toFixed(6));
  throw new RangeError("Light height unit must be in or cm");
}

export function solveInverseSquareHeight(
  chartPpfd: number,
  chartHeight: number,
  targetPpfd: number,
): number {
  requirePositive("Chart PPFD", chartPpfd);
  requirePositive("Chart height", chartHeight);
  requirePositive("Target PPFD", targetPpfd);
  return chartHeight * Math.sqrt(chartPpfd / targetPpfd);
}

export function fixturesNeeded(
  targetPpfd: number,
  areaM2: number,
  ppfPerFixture: number,
  canopyEfficiency: number,
): FixtureRequirement {
  requirePositive("Target PPFD", targetPpfd);
  requirePositive("Canopy area", areaM2);
  requirePositive("Fixture PPF", ppfPerFixture);
  requireCanopyEfficiency(canopyEfficiency);
  const raw = (targetPpfd * areaM2) / (ppfPerFixture * canopyEfficiency);
  return {
    raw,
    roundedUp: Math.ceil(raw),
    formula: "fixtures = (target PPFD × area m²) ÷ (fixture PPF × canopy efficiency)",
  };
}

function validatePoint(name: string, value: number): number {
  return requireNonNegative(name, value);
}

export function calculateUniformity(points: FivePointPpfd): UniformityResult {
  const values = [
    validatePoint("Center PPFD", points.center),
    validatePoint("Front-left PPFD", points.frontLeft),
    validatePoint("Front-right PPFD", points.frontRight),
    validatePoint("Back-left PPFD", points.backLeft),
    validatePoint("Back-right PPFD", points.backRight),
  ];
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const minimum = Math.min(...values);
  const cornerAverage = (values[1] + values[2] + values[3] + values[4]) / 4;
  const centerToCornerDelta = points.center - cornerAverage;
  return {
    average,
    minimum,
    uminOverUavg: average === 0 ? null : minimum / average,
    centerToCornerDelta,
    centerToCornerDeltaPercent: points.center === 0 ? null : centerToCornerDelta / points.center,
    formula: "uniformity = minimum PPFD ÷ five-point average PPFD",
  };
}

/**
 * Bilinear five-point visualization. It is an interpolation model of the
 * supplied readings, not a measured PAR map.
 */
export function buildFivePointHeatmap(points: FivePointPpfd): number[][] {
  calculateUniformity(points);
  const topMid = (points.frontLeft + points.frontRight) / 2;
  const leftMid = (points.frontLeft + points.backLeft) / 2;
  const rightMid = (points.frontRight + points.backRight) / 2;
  const bottomMid = (points.backLeft + points.backRight) / 2;
  return [
    [points.frontLeft, topMid, points.frontRight],
    [leftMid, points.center, rightMid],
    [points.backLeft, bottomMid, points.backRight],
  ];
}

export function calculateLightCycleEnergy(input: {
  actualWattsPerFixture: number;
  fixtureCount: number;
  vegHoursPerDay: number;
  vegDays: number;
  flowerHoursPerDay: number;
  flowerDays: number;
  ratePerKwh: number;
}): LightCycleEnergy {
  requireNonNegative("Actual fixture watts", input.actualWattsPerFixture);
  requireFixtureCount(input.fixtureCount);
  const totalWatts = input.actualWattsPerFixture * input.fixtureCount;
  const vegKwh = kwh(totalWatts, input.vegHoursPerDay, input.vegDays);
  const flowerKwh = kwh(totalWatts, input.flowerHoursPerDay, input.flowerDays);
  const vegCost = cost(vegKwh, input.ratePerKwh);
  const flowerCost = cost(flowerKwh, input.ratePerKwh);
  return {
    vegKwh,
    flowerKwh,
    cycleKwh: vegKwh + flowerKwh,
    vegCost,
    flowerCost,
    cycleCost: vegCost + flowerCost,
    formula: "kWh = (actual watts ÷ 1,000) × hours/day × days; cost = kWh × rate",
  };
}

/**
 * Electricity cost per mole of photons emitted by the fixtures over a cycle.
 * This uses fixture PPF, not canopy-delivered photons; estimated PPF remains an
 * estimate and must be labelled by the caller.
 */
export function calculateEnergyCostPerMol(input: {
  ppfPerFixture: number;
  fixtureCount: number;
  vegHoursPerDay: number;
  vegDays: number;
  flowerHoursPerDay: number;
  flowerDays: number;
  cycleElectricityCost: number;
}): EnergyCostPerMolResult {
  requirePositive("Fixture PPF", input.ppfPerFixture);
  requireFixtureCount(input.fixtureCount);
  requireHours("Veg photoperiod", input.vegHoursPerDay);
  requireHours("Flower photoperiod", input.flowerHoursPerDay);
  requireNonNegative("Veg days", input.vegDays);
  requireNonNegative("Flower days", input.flowerDays);
  requireNonNegative("Cycle electricity cost", input.cycleElectricityCost);
  const totalLightHours =
    input.vegHoursPerDay * input.vegDays + input.flowerHoursPerDay * input.flowerDays;
  requirePositive("Cycle light-hours", totalLightHours);
  const photonMoles =
    (input.ppfPerFixture * input.fixtureCount * totalLightHours * 3600) / 1_000_000;
  return {
    photonMoles,
    costPerMol: input.cycleElectricityCost / photonMoles,
    formula:
      "fixture-output mol = PPF × fixture count × total light-hours × 3,600 ÷ 1,000,000; cost/mol = cycle electricity cost ÷ fixture-output mol",
  };
}

export function compareToReferenceBand(
  value: number,
  min: number,
  max: number,
): ReferenceBandStatus {
  requireNonNegative("Compared value", value);
  requireNonNegative("Reference minimum", min);
  requirePositive("Reference maximum", max);
  if (max < min) throw new RangeError("Reference maximum must be at least the minimum");
  return value < min ? "below" : value > max ? "above" : "in_range";
}

export function calculateDliFromPlanningPpfd(ppfd: number, hours: number): number {
  return dli(ppfd, hours);
}
