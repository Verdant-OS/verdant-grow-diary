import { describe, expect, it } from "vitest";
import {
  computeYieldEfficiency,
  extractHarvestWeightsGrams,
  parseTentFootprint,
} from "@/lib/yieldEfficiencyRules";

const tent4x4 = { size: "4x4 ft", light: { wattage: 300 } };

function harvest(details: unknown) {
  return { details };
}

describe("extractHarvestWeightsGrams", () => {
  it("reads canonical grams", () => {
    expect(extractHarvestWeightsGrams({ wet_weight_grams: 400, dry_weight_grams: 100 })).toEqual({
      wetGrams: 400,
      dryGrams: 100,
    });
  });

  it("reads the nested harvest envelope and converts the grower unit", () => {
    const out = extractHarvestWeightsGrams({
      harvest: { dryWeight: "2", weightUnit: "oz" },
    });
    expect(out.dryGrams).toBeCloseTo(56.699, 3);
    expect(out.wetGrams).toBeNull();
  });

  it("drops an unknown unit rather than assuming grams", () => {
    expect(extractHarvestWeightsGrams({ dryWeight: "100", weightUnit: "stone" }).dryGrams).toBeNull();
  });

  it("is null-safe", () => {
    expect(extractHarvestWeightsGrams(null)).toEqual({ wetGrams: null, dryGrams: null });
    expect(extractHarvestWeightsGrams("nope")).toEqual({ wetGrams: null, dryGrams: null });
  });
});

describe("parseTentFootprint", () => {
  it("parses feet", () => {
    const p = parseTentFootprint("4x4 ft");
    expect(p.status).toBe("ok");
    if (p.status === "ok") expect(p.squareFeet).toBeCloseTo(16, 6);
  });

  it("parses centimetres", () => {
    const p = parseTentFootprint("120x120 cm");
    expect(p.status).toBe("ok");
    if (p.status === "ok") expect(p.squareMeters).toBeCloseTo(1.44, 6);
  });

  it("refuses a unitless size instead of guessing feet", () => {
    expect(parseTentFootprint("4x4")).toEqual({
      status: "error",
      reason: "ambiguous_footprint_unit",
    });
  });

  it("reports missing and unparseable sizes distinctly", () => {
    expect(parseTentFootprint(null).status).toBe("error");
    expect(parseTentFootprint(null)).toMatchObject({ reason: "missing_footprint" });
    expect(parseTentFootprint("big tent")).toMatchObject({ reason: "invalid_footprint" });
  });
});

describe("computeYieldEfficiency", () => {
  it("happy path with all operands present", () => {
    const r = computeYieldEfficiency({
      harvestEntries: [harvest({ wet_weight_grams: 2000, dry_weight_grams: 450 })],
      tents: [tent4x4],
      system: "imperial",
    });
    expect(r.gramsPerWatt).toMatchObject({ status: "ok", value: 1.5, unit: "g/W" });
    expect(r.gramsPerArea.status).toBe("ok");
    if (r.gramsPerArea.status === "ok") expect(r.gramsPerArea.value).toBeCloseTo(28.125, 3);
    expect(r.wetToDryRatioPct).toMatchObject({ status: "ok", display: "22.5", unit: "%" });
    expect(r.hasAnyMetric).toBe(true);
    expect(r.totals.harvestEntryCount).toBe(1);
  });

  it("sums weights across multiple harvest entries", () => {
    const r = computeYieldEfficiency({
      harvestEntries: [
        harvest({ dry_weight_grams: 200 }),
        harvest({ dry_weight_grams: 100 }),
        harvest({ note: "no weights" }),
      ],
      tents: [tent4x4],
    });
    expect(r.totals.dryWeightGrams).toBe(300);
    expect(r.totals.harvestEntryCount).toBe(2);
  });

  it("missing wattage is not measured, never defaulted", () => {
    const r = computeYieldEfficiency({
      harvestEntries: [harvest({ dry_weight_grams: 450 })],
      tents: [{ size: "4x4 ft", light: { wattage: null } }],
    });
    expect(r.gramsPerWatt).toMatchObject({ status: "not_measured", reason: "missing_wattage" });
    expect(r.gramsPerArea.status).toBe("ok");
  });

  it("missing dry weight blocks every dry-weight metric", () => {
    const r = computeYieldEfficiency({ harvestEntries: [], tents: [tent4x4] });
    expect(r.gramsPerWatt).toMatchObject({ reason: "missing_dry_weight" });
    expect(r.gramsPerArea).toMatchObject({ reason: "missing_dry_weight" });
    expect(r.wetToDryRatioPct).toMatchObject({ reason: "missing_wet_weight" });
    expect(r.hasAnyMetric).toBe(false);
  });

  it("missing or ambiguous footprint is reported, not guessed", () => {
    const missing = computeYieldEfficiency({
      harvestEntries: [harvest({ dry_weight_grams: 450 })],
      tents: [{ size: null, light: { wattage: 300 } }],
    });
    expect(missing.gramsPerArea).toMatchObject({ reason: "missing_footprint" });

    const ambiguous = computeYieldEfficiency({
      harvestEntries: [harvest({ dry_weight_grams: 450 })],
      tents: [{ size: "4x4", light: { wattage: 300 } }],
    });
    expect(ambiguous.gramsPerArea).toMatchObject({ reason: "ambiguous_footprint_unit" });
    expect(ambiguous.totals.footprintArea).toBeNull();
  });

  it("guards zero and negative operands without emitting Infinity or NaN", () => {
    const zeroWatt = computeYieldEfficiency({
      harvestEntries: [harvest({ dry_weight_grams: 450 })],
      tents: [{ size: "4x4 ft", light: { wattage: 0 } }],
    });
    expect(zeroWatt.gramsPerWatt).toMatchObject({ reason: "non_positive_wattage" });

    const negWatt = computeYieldEfficiency({
      harvestEntries: [harvest({ dry_weight_grams: 450 })],
      tents: [{ size: "0x4 ft", light: { wattage: -300 } }],
    });
    expect(negWatt.gramsPerWatt).toMatchObject({ reason: "non_positive_wattage" });
    expect(negWatt.gramsPerArea).toMatchObject({ reason: "non_positive_footprint" });

    const zeroDry = computeYieldEfficiency({
      harvestEntries: [harvest({ dry_weight_grams: 0, wet_weight_grams: 500 })],
      tents: [tent4x4],
    });
    expect(zeroDry.gramsPerWatt).toMatchObject({ reason: "non_positive_dry_weight" });
    for (const m of [zeroDry.gramsPerWatt, zeroDry.gramsPerArea, zeroDry.wetToDryRatioPct]) {
      expect(m.status).toBe("not_measured");
    }

    const zeroWet = computeYieldEfficiency({
      harvestEntries: [harvest({ dry_weight_grams: 100, wet_weight_grams: 0 })],
      tents: [tent4x4],
    });
    expect(zeroWet.wetToDryRatioPct).toMatchObject({ reason: "non_positive_wet_weight" });
  });

  it("respects the metric measurement system for area", () => {
    const input = {
      harvestEntries: [harvest({ dry_weight_grams: 1440 })],
      tents: [{ size: "120x120 cm", light: { wattage: 300 } }],
    };
    const metric = computeYieldEfficiency({ ...input, system: "metric" as const });
    expect(metric.totals.footprintUnit).toBe("m²");
    expect(metric.gramsPerArea).toMatchObject({ status: "ok", unit: "g/m²" });
    if (metric.gramsPerArea.status === "ok")
      expect(metric.gramsPerArea.value).toBeCloseTo(1000, 6);

    const imperial = computeYieldEfficiency({ ...input, system: "imperial" as const });
    expect(imperial.totals.footprintUnit).toBe("ft²");
    if (imperial.gramsPerArea.status === "ok")
      expect(imperial.gramsPerArea.value).toBeCloseTo(92.903, 2);
  });

  it("is deterministic and null-safe with no inputs", () => {
    const a = computeYieldEfficiency({});
    const b = computeYieldEfficiency({ harvestEntries: null, tents: null });
    expect(a).toEqual(b);
    expect(a.hasAnyMetric).toBe(false);
  });
});
