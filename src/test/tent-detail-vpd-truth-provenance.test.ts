/**
 * Regression coverage for tentDetailVpdRules helpers that gate Tonight truth
 * and tent-page provenance (#2459 / #2303).
 */
import { describe, expect, it } from "vitest";
import {
  tentDetailCaptureClimate,
  tentDetailVpdNeedsOwnProvenance,
  tonightCaptureRejected,
  tonightVpdPassesTruth,
  type TentDetailVpdObservation,
} from "@/lib/tentDetailVpdRules";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";

const T = "2026-10-22T12:00:00.000Z";

const tonight = (overrides: Partial<TonightMetricView> = {}): TonightMetricView => ({
  key: "vpd",
  label: "VPD",
  state: "value",
  value: 1.2,
  source: "live",
  sourceLabel: null,
  capturedAt: T,
  ageText: null,
  calculated: false,
  ...overrides,
});

describe("tonightVpdPassesTruth", () => {
  const okRows = [
    { metric: "vpd_kpa", value: 1.2, captured_at: T, source: "live" },
    { metric: "humidity_pct", value: 55, captured_at: T, source: "live" },
  ];
  const climate = tentDetailCaptureClimate(okRows, null);

  it("is false when the VPD value itself fails sensor-truth classification", () => {
    const bad = tonight({ value: 99 });
    expect(tonightCaptureRejected(bad, null, climate)).toBe(false);
    expect(tonightVpdPassesTruth(bad, null, climate)).toBe(false);
  });

  it("is false when the capture behind Tonight is rejected", () => {
    const rows = [
      { metric: "vpd_kpa", value: 1.2, captured_at: T, source: "live" },
      { metric: "humidity_pct", value: 150, captured_at: T, source: "live" },
    ];
    const rejectedClimate = tentDetailCaptureClimate(rows, null);
    const v = tonight();
    expect(tonightCaptureRejected(v, null, rejectedClimate)).toBe(true);
    expect(tonightVpdPassesTruth(v, null, rejectedClimate)).toBe(false);
  });

  it("is true for a realistic VPD whose capture climate is trusted", () => {
    const v = tonight();
    expect(tonightCaptureRejected(v, null, climate)).toBe(false);
    expect(tonightVpdPassesTruth(v, null, climate)).toBe(true);
  });

  it("rejects calculated VPD without realistic temp/RH contributors", () => {
    const calc = tonight({ calculated: true, value: 1.1 });
    expect(tonightVpdPassesTruth(calc, null, climate)).toBe(false);
    expect(
      tonightVpdPassesTruth(calc, { temp: 24, rh: 55 }, tentDetailCaptureClimate([], null)),
    ).toBe(true);
  });
});

describe("tentDetailVpdNeedsOwnProvenance", () => {
  const obs = (overrides: Partial<TentDetailVpdObservation>): TentDetailVpdObservation => ({
    value: 1.2,
    capturedAt: T,
    source: "live",
    stale: false,
    calculated: false,
    ...overrides,
  });

  const header = {
    vpd: 1.2,
    source: "live",
    capturedAt: T,
    stale: false,
  };

  it("is false when the tent observation has no value", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: obs({ value: null }),
        header,
      }),
    ).toBe(false);
  });

  it("is true when the observation is calculated even if numbers match the header", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: obs({ calculated: true }),
        header,
      }),
    ).toBe(true);
  });

  it("is true when the header has no stored VPD", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: obs({}),
        header: { ...header, vpd: null },
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: obs({}),
        header: { ...header, vpd: undefined },
      }),
    ).toBe(true);
  });

  it("is true when value, source, capture instant, or staleness differ", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: obs({ value: 1.3 }),
        header,
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: obs({ source: "manual" }),
        header,
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: obs({ capturedAt: "2026-10-22T11:00:00.000Z" }),
        header,
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: obs({ stale: true }),
        header,
      }),
    ).toBe(true);
  });

  it("is false when every provenance field matches the header snapshot", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: obs({}),
        header,
      }),
    ).toBe(false);
  });
});
