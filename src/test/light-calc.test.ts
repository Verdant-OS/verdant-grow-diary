import { describe, expect, it } from "vitest";
import {
  buildFivePointHeatmap,
  calculateDliFromPlanningPpfd,
  calculateEnergyCostPerMol,
  calculateLightCycleEnergy,
  calculateUniformity,
  compareToReferenceBand,
  convertLightHeightValue,
  fixturesNeeded,
  inverseSquarePpfd,
  planningAveragePpfd,
  ppfdForTargetDli,
  resolveFixturePpf,
  solveInverseSquareHeight,
} from "@/lib/lightCalc";
import { areaM2FromFeet } from "@/lib/unitsCalc";

describe("lightCalc", () => {
  it("calculates the exact requested 400 PPFD × 18 h DLI", () => {
    expect(calculateDliFromPlanningPpfd(400, 18)).toBe(25.92);
  });

  it("calculates the exact requested inverse-square example", () => {
    expect(inverseSquarePpfd(200, 12, 24)).toBe(50);
  });

  it("solves inverse-square height for a target PPFD", () => {
    expect(solveInverseSquareHeight(200, 12, 50)).toBe(24);
  });

  it("converts chart heights without reinterpreting their physical distance", () => {
    expect(convertLightHeightValue(12, "in", "cm")).toBe(30.48);
    expect(convertLightHeightValue(30.48, "cm", "in")).toBe(12);
    expect(convertLightHeightValue(null, "in", "cm")).toBeNull();
  });

  it("calculates the exact requested 4×4 fixture requirement", () => {
    const result = fixturesNeeded(800, areaM2FromFeet(4, 4), 800, 0.85);
    expect(result.raw).toBeCloseTo(1.7487631, 5);
    expect(result.roundedUp).toBe(2);
  });

  it("calculates the planning average from PPF, count, efficiency, and canopy area", () => {
    expect(planningAveragePpfd(800, 2, areaM2FromFeet(4, 4), 0.85)).toBeCloseTo(914.932, 3);
  });

  it("requires efficacy when only watts are available and labels PPF estimated", () => {
    expect(
      resolveFixturePpf({
        mode: "watts",
        ppfMicromolesPerSecond: 0,
        actualWatts: 300,
        efficacyMicromolesPerJoule: 2.6,
      }),
    ).toMatchObject({ ppf: 780, estimated: true });
    expect(() =>
      resolveFixturePpf({
        mode: "watts",
        ppfMicromolesPerSecond: 0,
        actualWatts: 300,
        efficacyMicromolesPerJoule: 0,
      }),
    ).toThrow(/greater than 0/i);
  });

  it("preserves direct manufacturer PPF as non-estimated", () => {
    expect(
      resolveFixturePpf({
        mode: "ppf",
        ppfMicromolesPerSecond: 800,
        actualWatts: 300,
        efficacyMicromolesPerJoule: 0,
      }),
    ).toMatchObject({ ppf: 800, estimated: false });
  });

  it("solves PPFD from target DLI and photoperiod", () => {
    expect(ppfdForTargetDli(25.92, 18)).toBe(400);
  });

  it("calculates five-point average, minimum, and Umin/Uavg", () => {
    const result = calculateUniformity({
      center: 800,
      frontLeft: 600,
      frontRight: 620,
      backLeft: 580,
      backRight: 600,
    });
    expect(result.average).toBe(640);
    expect(result.minimum).toBe(580);
    expect(result.uminOverUavg).toBeCloseTo(0.90625, 12);
    expect(result.centerToCornerDelta).toBe(200);
    expect(result.centerToCornerDeltaPercent).toBe(0.25);
  });

  it("builds a deterministic 3×3 interpolation marked as a model by its caller", () => {
    const map = buildFivePointHeatmap({
      center: 800,
      frontLeft: 600,
      frontRight: 700,
      backLeft: 500,
      backRight: 600,
    });
    expect(map).toEqual([
      [600, 650, 700],
      [550, 800, 650],
      [500, 550, 600],
    ]);
  });

  it("calculates veg, flower, and cycle light energy from actual draw", () => {
    const result = calculateLightCycleEnergy({
      actualWattsPerFixture: 300,
      fixtureCount: 1,
      vegHoursPerDay: 18,
      vegDays: 30,
      flowerHoursPerDay: 12,
      flowerDays: 60,
      ratePerKwh: 0.16,
    });
    expect(result.vegKwh).toBe(162);
    expect(result.flowerKwh).toBe(216);
    expect(result.cycleKwh).toBe(378);
    expect(result.cycleCost).toBeCloseTo(60.48, 12);
  });

  it("calculates electricity cost per fixture-output photon mole", () => {
    const result = calculateEnergyCostPerMol({
      ppfPerFixture: 800,
      fixtureCount: 1,
      vegHoursPerDay: 18,
      vegDays: 30,
      flowerHoursPerDay: 12,
      flowerDays: 60,
      cycleElectricityCost: 60.48,
    });
    expect(result.photonMoles).toBe(3628.8);
    expect(result.costPerMol).toBeCloseTo(1 / 60, 12);
  });

  it("classifies a reference comparison without diagnosing plant health", () => {
    expect(compareToReferenceBand(500, 600, 900)).toBe("below");
    expect(compareToReferenceBand(600, 600, 900)).toBe("in_range");
    expect(compareToReferenceBand(900, 600, 900)).toBe("in_range");
    expect(compareToReferenceBand(901, 600, 900)).toBe("above");
  });

  it("rejects invalid heights, area, efficiency, readings, and photoperiod", () => {
    expect(() => inverseSquarePpfd(200, 12, 0)).toThrow(/greater than 0/i);
    expect(() => planningAveragePpfd(800, 2, 1, 1.01)).toThrow(/between 0.50 and 1.00/i);
    expect(() => fixturesNeeded(800, 0, 800, 0.85)).toThrow(/greater than 0/i);
    expect(() =>
      calculateUniformity({
        center: 800,
        frontLeft: -1,
        frontRight: 600,
        backLeft: 600,
        backRight: 600,
      }),
    ).toThrow(/0 or greater/i);
    expect(() => ppfdForTargetDli(25, 25)).toThrow(/24 or less/i);
  });

  it("accepts a measured dark corner and returns null for all-dark uniformity", () => {
    const darkCorner = calculateUniformity({
      center: 800,
      frontLeft: 0,
      frontRight: 600,
      backLeft: 600,
      backRight: 600,
    });
    expect(darkCorner.minimum).toBe(0);
    expect(darkCorner.uminOverUavg).toBe(0);

    const allDark = calculateUniformity({
      center: 0,
      frontLeft: 0,
      frontRight: 0,
      backLeft: 0,
      backRight: 0,
    });
    expect(allDark.uminOverUavg).toBeNull();
    expect(allDark.centerToCornerDeltaPercent).toBeNull();
  });
});
