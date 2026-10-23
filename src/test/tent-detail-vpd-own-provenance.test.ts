/**
 * tentDetailVpdNeedsOwnProvenance (#2437 / #2303): the tent page shows a
 * VPD-specific provenance line when Tonight's VPD differs from the shared
 * Environment header snapshot — value, source, capture time, staleness, or
 * because the VPD was calculated from temperature and RH.
 */
import { describe, expect, it } from "vitest";
import { tentDetailVpdNeedsOwnProvenance } from "@/lib/tentDetailVpdRules";

const T = "2026-10-23T15:00:00.000Z";
const T2 = "2026-10-23T14:50:00.000Z";

function observation(
  over: Partial<Parameters<typeof tentDetailVpdNeedsOwnProvenance>[0]["observation"]> = {},
) {
  return {
    value: 1.2,
    capturedAt: T,
    source: "live",
    stale: false,
    calculated: false,
    ...over,
  };
}

function header(
  over: Partial<Parameters<typeof tentDetailVpdNeedsOwnProvenance>[0]["header"]> = {},
) {
  return {
    vpd: 1.2,
    source: "live",
    capturedAt: T,
    stale: false,
    ...over,
  };
}

describe("tentDetailVpdNeedsOwnProvenance", () => {
  it("returns false when the observation has no VPD value", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ value: null }),
        header: header(),
      }),
    ).toBe(false);
  });

  it("returns false when observation and header describe the same stored VPD", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation(),
        header: header(),
      }),
    ).toBe(false);
  });

  it("returns true for a calculated VPD even when numbers match the header", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ calculated: true }),
        header: header(),
      }),
    ).toBe(true);
  });

  it("returns true when the header has no stored VPD", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation(),
        header: header({ vpd: null }),
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation(),
        header: header({ vpd: undefined }),
      }),
    ).toBe(true);
  });

  it("returns true when value, source, capture time, or staleness differ", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ value: 1.25 }),
        header: header(),
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ source: "manual" }),
        header: header(),
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ capturedAt: T2 }),
        header: header(),
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ stale: true }),
        header: header(),
      }),
    ).toBe(true);
  });
});
