/**
 * Pure Tent Detail VPD helpers with no direct coverage elsewhere:
 * `tentDetailVpdNeedsOwnProvenance` (Copilot P2 on #2303) and
 * `tonightVpdPassesTruth` (sensor-truth gate before Tonight's value wins).
 */
import { describe, expect, it } from "vitest";
import {
  tentDetailVpdNeedsOwnProvenance,
  tonightCaptureRejected,
  tonightVpdPassesTruth,
  type TentDetailCaptureClimate,
} from "@/lib/tentDetailVpdRules";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";

const T = "2026-10-23T18:00:00.000Z";

const observation = (
  overrides: Partial<{
    value: number | null;
    capturedAt: string | null;
    source: string | null;
    stale: boolean;
    calculated: boolean;
  }> = {},
) => ({
  value: 1.2,
  capturedAt: T,
  source: "live" as const,
  stale: false,
  calculated: false,
  ...overrides,
});

const header = (
  overrides: Partial<Parameters<typeof tentDetailVpdNeedsOwnProvenance>[0]["header"]> = {},
) => ({
  vpd: 1.2,
  source: "live",
  capturedAt: T,
  stale: false,
  ...overrides,
});

describe("tentDetailVpdNeedsOwnProvenance", () => {
  it("returns false when the observation has no value", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ value: null }),
        header: header(),
      }),
    ).toBe(false);
  });

  it("returns true when Tonight calculated the VPD", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ calculated: true }),
        header: header(),
      }),
    ).toBe(true);
  });

  it("returns true when the header snapshot has no stored VPD", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation(),
        header: header({ vpd: null }),
      }),
    ).toBe(true);
  });

  it("returns true when value, source, capture time, or staleness differs from the header", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ value: 1.3 }),
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
        observation: observation({ capturedAt: "2026-10-23T19:00:00.000Z" }),
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

  it("returns false when every provenance field matches the header snapshot", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation(),
        header: header(),
      }),
    ).toBe(false);
  });
});

const tonightValue = (overrides: Partial<TonightMetricView> = {}): TonightMetricView => ({
  key: "vpd",
  label: "VPD",
  state: "value",
  value: 1.1,
  source: "live",
  sourceLabel: "Live",
  capturedAt: T,
  ageText: "3m ago",
  calculated: false,
  ...overrides,
});

describe("tonightVpdPassesTruth", () => {
  const cleanClimate: TentDetailCaptureClimate[] = [
    { at: T, temp: 24, rh: 55, untrusted: false, ref: null },
  ];

  it("fails when the VPD number itself is unrealistic", () => {
    expect(
      tonightVpdPassesTruth(tonightValue({ value: 99 }), { temp: 24, rh: 55 }, cleanClimate),
    ).toBe(false);
  });

  it("fails when capture rejection applies even if the displayed VPD looks plausible", () => {
    const tonight = tonightValue({ calculated: true, value: 1.1 });
    expect(tonightCaptureRejected(tonight, { temp: 200, rh: 55 }, cleanClimate)).toBe(true);
    expect(tonightVpdPassesTruth(tonight, { temp: 200, rh: 55 }, cleanClimate)).toBe(false);
  });

  it("passes when the value and capture climate are both realistic", () => {
    const tonight = tonightValue({ calculated: true, value: 1.1 });
    expect(tonightVpdPassesTruth(tonight, { temp: 24, rh: 55 }, cleanClimate)).toBe(true);
  });
});
