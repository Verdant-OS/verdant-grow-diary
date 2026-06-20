import { describe, it, expect } from "vitest";
import { calculateVPD } from "@/lib/sensors/calculateVPD";

describe("calculateVPD", () => {
  it("calculates expected VPD from valid temp/RH (25C @ 50% ≈ 1.58 kPa)", () => {
    const v = calculateVPD(25, 50);
    expect(v).not.toBeNull();
    expect(v).toBeCloseTo(1.58, 1);
  });

  it("returns ~0 when RH is 100%", () => {
    expect(calculateVPD(25, 100)).toBe(0);
  });

  it.each([
    [null, 50],
    [undefined, 50],
    [Number.NaN, 50],
    [Number.POSITIVE_INFINITY, 50],
    [25, null],
    [25, undefined],
    [25, Number.NaN],
    [25, -1],
    [25, 101],
  ])("returns null for invalid inputs (%p, %p)", (t, h) => {
    expect(
      calculateVPD(t as number | null | undefined, h as number | null | undefined),
    ).toBeNull();
  });

  it("is deterministic and returns 2-decimal output", () => {
    const a = calculateVPD(22.5, 55);
    const b = calculateVPD(22.5, 55);
    expect(a).toBe(b);
    expect(a).not.toBeNull();
    expect(Math.round((a as number) * 100) / 100).toBe(a);
  });
});
