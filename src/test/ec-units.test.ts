import { describe, it, expect } from "vitest";
import { toCanonicalMscm, EC_PLAUSIBLE_MAX } from "@/lib/ecUnits";

describe("ecUnits", () => {
  it("passes mS/cm through unchanged", () => {
    expect(toCanonicalMscm(1.4, "mS/cm")).toBeCloseTo(1.4);
  });
  it("converts µS/cm to mS/cm", () => {
    expect(toCanonicalMscm(1400, "µS/cm")).toBeCloseTo(1.4);
  });
  it("converts PPM-500 to mS/cm", () => {
    expect(toCanonicalMscm(700, "PPM-500")).toBeCloseTo(1.4);
  });
  it("converts PPM-700 to mS/cm", () => {
    expect(toCanonicalMscm(980, "PPM-700")).toBeCloseTo(1.4);
  });
  it("is null-safe", () => {
    expect(toCanonicalMscm(null, "mS/cm")).toBeNull();
    expect(toCanonicalMscm(undefined, "mS/cm")).toBeNull();
    expect(toCanonicalMscm(Number.NaN, "mS/cm")).toBeNull();
  });
  it("exposes plausible max per unit", () => {
    expect(EC_PLAUSIBLE_MAX["mS/cm"]).toBeGreaterThan(0);
    expect(EC_PLAUSIBLE_MAX["PPM-500"]).toBeGreaterThan(EC_PLAUSIBLE_MAX["mS/cm"]);
  });
});
