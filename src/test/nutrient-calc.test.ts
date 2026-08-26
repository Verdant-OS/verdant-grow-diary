import { describe, expect, it } from "vitest";
import {
  JACKS_321_STYLE_PRESET,
  STAGE_EC_REFERENCES,
  calculateC1V1,
  calculateEcTargetDose,
  calculateEcTargetRecipe,
  calculateInjectorPlan,
  calculateLabelRateRecipe,
  convertReservoirVolumeValue,
  convertNutrientStrength,
  remainingEcToTarget,
  scale321Style,
  scaleDrySaltRecipe,
  stageReferenceMidpoint,
} from "@/lib/nutrientCalc";
import { L_PER_GAL } from "@/lib/unitsCalc";

describe("nutrientCalc", () => {
  it("scales the exact requested 2.5 mL/gal by 20 gal label-rate case", () => {
    const result = calculateLabelRateRecipe(
      [{ id: "a", name: "Part A", dose: 2.5, unit: "ml/gal" }],
      { value: 20, unit: "gal" },
    );
    expect(result.rows[0].amount).toBe(50);
    expect(result.rows[0].amountUnit).toBe("ml");
  });

  it("normalizes label rates across mL/L, g/gal, and tsp/gal", () => {
    const result = calculateLabelRateRecipe(
      [
        { id: "liquid", name: "Liquid", dose: 1, unit: "ml/L" },
        { id: "salt", name: "Salt", dose: 2, unit: "g/gal" },
        { id: "spoon", name: "Spoon", dose: 1, unit: "tsp/gal" },
      ],
      { value: 1, unit: "gal" },
    );
    expect(result.rows.map((row) => row.amount)).toEqual([L_PER_GAL, 2, 4.92892]);
    expect(result.totalVolumeMl).toBeCloseTo(L_PER_GAL + 4.92892, 10);
    expect(result.totalMassG).toBe(2);
  });

  it("uses working liters rather than container capacity", () => {
    const result = calculateLabelRateRecipe([{ id: "a", name: "Part A", dose: 2, unit: "ml/L" }], {
      value: 10,
      unit: "L",
    });
    expect(result.rows[0].amount).toBe(20);
    expect(result.reservoirLiters).toBe(10);
  });

  it("converts an existing working volume when its reservoir unit changes", () => {
    const liters = convertReservoirVolumeValue(4, "gal", "L");
    expect(liters).toBeCloseTo(4 * L_PER_GAL, 12);
    expect(convertReservoirVolumeValue(liters, "L", "gal")).toBeCloseTo(4, 12);
    expect(convertReservoirVolumeValue(null, "gal", "L")).toBeNull();
    expect(convertReservoirVolumeValue(4, "gal", "gal")).toBe(4);
  });

  it("calculates the exact requested EC target case", () => {
    expect(calculateEcTargetDose(0.2, 1.6, 0.2)).toBeCloseTo(7, 12);

    const recipe = calculateEcTargetRecipe(0.2, 1.6, [{ id: "a", name: "A", ecPerMlPerL: 0.2 }], {
      value: 1,
      unit: "L",
    });
    expect(recipe.baseMlPerLiter).toBeCloseTo(7, 12);
    expect(recipe.rows[0]).toMatchObject({ ratio: 1, mlPerLiter: 7, reservoirMl: 7 });
  });

  it("scales each calibrated EC part to the working reservoir", () => {
    const result = calculateEcTargetRecipe(
      0.2,
      1.6,
      [
        { id: "a", name: "A", ecPerMlPerL: 0.2 },
        { id: "b", name: "B", ecPerMlPerL: 0.1 },
      ],
      { value: 10, unit: "L" },
    );
    expect(result.rows[0].reservoirMl).toBeCloseTo(46.6666666667, 9);
    expect(result.rows[1].reservoirMl).toBeCloseTo(46.6666666667, 9);
    expect(result.totalVolumeMl).toBeCloseTo(93.3333333333, 9);
    expect(
      result.rows.reduce((rise, row) => rise + row.mlPerLiter * row.ecPerMlPerL, 0),
    ).toBeCloseTo(1.4, 12);
  });

  it("weights EC target parts by their editable ratios", () => {
    const result = calculateEcTargetRecipe(
      0.2,
      1.6,
      [
        { id: "a", name: "A", ecPerMlPerL: 0.2, ratio: 2 },
        { id: "b", name: "B", ecPerMlPerL: 0.1, ratio: 1 },
      ],
      { value: 10, unit: "L" },
    );

    expect(result.baseMlPerLiter).toBeCloseTo(2.8, 12);
    expect(result.rows.map((row) => row.ratio)).toEqual([2, 1]);
    expect(result.rows[0].mlPerLiter).toBeCloseTo(5.6, 12);
    expect(result.rows[1].mlPerLiter).toBeCloseTo(2.8, 12);
    expect(result.rows[0].reservoirMl).toBeCloseTo(56, 12);
    expect(result.rows[1].reservoirMl).toBeCloseTo(28, 12);
    expect(result.totalVolumeMl).toBeCloseTo(84, 12);
    expect(
      result.rows.reduce((rise, row) => rise + row.mlPerLiter * row.ecPerMlPerL, 0),
    ).toBeCloseTo(1.4, 12);
    expect(result.rows[0].formula).toContain("ratio (2:1)");
    expect(result.formula).toContain("Σ(EC-per-mL/L × ratio)");
  });

  it("rejects zero or negative EC target part ratios", () => {
    const volume = { value: 10, unit: "L" } as const;

    expect(() =>
      calculateEcTargetRecipe(
        0.2,
        1.6,
        [{ id: "a", name: "A", ecPerMlPerL: 0.2, ratio: 0 }],
        volume,
      ),
    ).toThrow(/greater than 0/i);
    expect(() =>
      calculateEcTargetRecipe(
        0.2,
        1.6,
        [{ id: "a", name: "A", ecPerMlPerL: 0.2, ratio: -1 }],
        volume,
      ),
    ).toThrow(/greater than 0/i);
    expect(() =>
      calculateEcTargetRecipe(
        0.2,
        1.6,
        [{ id: "a", name: "A", ecPerMlPerL: 0.2, ratio: null }],
        volume,
      ),
    ).toThrow(/greater than 0/i);
  });

  it("warns through rejection when source-water EC is at or above target", () => {
    expect(() => calculateEcTargetDose(1.6, 1.6, 0.2)).toThrow(/below target/i);
    expect(() => calculateEcTargetDose(1.8, 1.6, 0.2)).toThrow(/below target/i);
  });

  it("calculates the exact requested C1V1 case", () => {
    expect(calculateC1V1(10, 2, 5)).toBe(1);
  });

  it("rejects impossible C1V1 concentration and non-positive stock", () => {
    expect(() => calculateC1V1(2, 3, 5)).toThrow(/cannot exceed/i);
    expect(() => calculateC1V1(0, 0, 5)).toThrow(/greater than 0/i);
  });

  it("scales the exact requested 321-style 10-gallon case", () => {
    expect(scale321Style(10)).toEqual({ partA: 36, partB: 24, epsom: 11 });
  });

  it("keeps the cited dry-salt mix order A, Epsom, calcium nitrate", () => {
    const rows = scaleDrySaltRecipe(JACKS_321_STYLE_PRESET, { value: 10, unit: "gal" });
    expect(rows.map((row) => row.id)).toEqual(["part-a", "epsom", "part-b"]);
    expect(rows.map((row) => row.reservoirGrams)).toEqual([36, 11, 24]);
  });

  it("calculates a 1:100 injector stock volume without guessing a device setting", () => {
    const plan = calculateInjectorPlan(1000, 100, { value: 10, unit: "gal" });
    expect(plan.stockMlPerFinalGallon).toBeCloseTo(37.85411784, 10);
    expect(plan.stockMlForReservoir).toBeCloseTo(378.5411784, 10);
    expect(plan.dissolvedGramsDelivered).toBeCloseTo(100, 10);
  });

  it("requires a positive injector stock concentration", () => {
    expect(() => calculateInjectorPlan(0, 100, { value: 10, unit: "gal" })).toThrow(
      /greater than 0/i,
    );
  });

  it("converts EC, PPM500, PPM700, and CF to one deterministic strength", () => {
    const fromEc = convertNutrientStrength(2, "ec");
    expect(fromEc).toEqual({ ecMsCm: 2, ppm500: 1000, ppm640: 1280, ppm700: 1400, cf: 20 });
    expect(convertNutrientStrength(1000, "ppm500")).toEqual(fromEc);
    expect(convertNutrientStrength(1400, "ppm700")).toEqual(fromEc);
    expect(convertNutrientStrength(20, "cf")).toEqual(fromEc);
  });

  it("calculates signed EC remaining so overshoot stays visible", () => {
    expect(remainingEcToTarget(1.8, 1.4)).toBeCloseTo(0.4, 12);
    expect(remainingEcToTarget(1.8, 2.0)).toBeCloseTo(-0.2, 12);
  });

  it("returns stage midpoints from cited typical starting ranges", () => {
    const earlyFlower = STAGE_EC_REFERENCES.find((row) => row.id === "early_flower");
    expect(earlyFlower).toBeDefined();
    expect(stageReferenceMidpoint(earlyFlower!)).toBe(2.2);
  });

  it("rejects invalid reservoir, calibration, recipe, and converter inputs", () => {
    expect(() => calculateLabelRateRecipe([], { value: 0, unit: "gal" })).toThrow(
      /greater than 0/i,
    );
    expect(() => calculateEcTargetDose(0.2, 1.6, 0)).toThrow(/greater than 0/i);
    expect(() => calculateEcTargetRecipe(0.2, 1.6, [], { value: 10, unit: "L" })).toThrow(
      /1 to 3 parts/i,
    );
    expect(() => scale321Style(-1)).toThrow(/greater than 0/i);
    expect(() => convertNutrientStrength(-1, "ec")).toThrow(/0 or greater/i);
  });
});
