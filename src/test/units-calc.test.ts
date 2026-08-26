import { describe, expect, it } from "vitest";
import {
  L_PER_GAL,
  areaFt2FromMeters,
  areaM2,
  areaM2FromFeet,
  cfFromEc,
  cost,
  dli,
  ecFromPpm,
  gallonsToLiters,
  kwh,
  litersToGallons,
  ppfEstimated,
  ppm500,
  ppm640,
  ppm700,
} from "@/lib/unitsCalc";

describe("unitsCalc", () => {
  it("converts EC 2.0 to the exact requested 500 and 700 ppm values", () => {
    expect(ppm500(2.0)).toBe(1000);
    expect(ppm700(2.0)).toBe(1400);
  });

  it("converts the optional 640 scale and reverses ppm scales", () => {
    expect(ppm640(2)).toBe(1280);
    expect(ecFromPpm(1000, 500)).toBe(2);
    expect(ecFromPpm(1400, 700)).toBe(2);
  });

  it("converts EC to CF", () => {
    expect(cfFromEc(1.8)).toBe(18);
  });

  it("calculates the exact requested DLI example", () => {
    expect(dli(400, 18)).toBe(25.92);
  });

  it("calculates the exact requested kWh and cost example", () => {
    const energy = kwh(300, 18, 30);
    expect(energy).toBe(162);
    expect(cost(energy, 0.16)).toBe(25.92);
  });

  it("converts a 4 by 4 foot canopy to square meters", () => {
    expect(areaM2FromFeet(4, 4)).toBeCloseTo(1.48644864, 10);
  });

  it("calculates metric area and converts it back to square feet", () => {
    expect(areaM2(1.2, 1.2)).toBeCloseTo(1.44, 12);
    expect(areaFt2FromMeters(1.2, 1.2)).toBeCloseTo(15.500031, 5);
  });

  it("estimates PPF only when watts and efficacy are provided", () => {
    expect(ppfEstimated(300, 2.6)).toBe(780);
  });

  it("round-trips gallons and liters with the declared constant", () => {
    expect(gallonsToLiters(1)).toBe(L_PER_GAL);
    expect(litersToGallons(L_PER_GAL)).toBe(1);
  });

  it("allows physically meaningful zero source values", () => {
    expect(ppm500(0)).toBe(0);
    expect(kwh(0, 18, 30)).toBe(0);
    expect(cost(0, 0.16)).toBe(0);
  });

  it("rejects hours outside (0, 24]", () => {
    expect(() => dli(400, 0)).toThrow(/greater than 0/i);
    expect(() => dli(400, 24.1)).toThrow(/24 or less/i);
    expect(() => kwh(300, 0, 30)).toThrow(/greater than 0/i);
  });

  it("rejects non-positive dimensions and efficacy", () => {
    expect(() => areaM2FromFeet(0, 4)).toThrow(/greater than 0/i);
    expect(() => areaM2(1, -1)).toThrow(/greater than 0/i);
    expect(() => ppfEstimated(300, 0)).toThrow(/greater than 0/i);
  });

  it("rejects negative and non-finite values instead of inventing results", () => {
    expect(() => ppm500(-1)).toThrow(/0 or greater/i);
    expect(() => (ecFromPpm as (ppm: number, scale: number) => number)(1000, 0)).toThrow(
      /500, 640, or 700/i,
    );
    expect(() => cost(Number.NaN, 0.16)).toThrow(/finite/i);
  });
});
