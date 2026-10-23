/**
 * tentDetailVpdRules helpers used by resolveTentDetailVpd and TentDetail (#2268):
 * sensor-truth gate for Tonight's VPD and when the page shows its own provenance line.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";
import {
  tentDetailCaptureClimate,
  tentDetailVpdNeedsOwnProvenance,
  tonightCaptureRejected,
  tonightVpdPassesTruth,
  type TentDetailCaptureClimate,
} from "@/lib/tentDetailVpdRules";

const NOW = Date.parse("2026-10-23T12:00:00.000Z");
const T = new Date(NOW - 5 * 60_000).toISOString();
const TENT_DETAIL = readFileSync(resolve(__dirname, "../pages/TentDetail.tsx"), "utf8");

const vpdMetric = (overrides: Partial<TonightMetricView> = {}): TonightMetricView => ({
  key: "vpd",
  label: "VPD",
  state: "value",
  value: 1.1,
  source: "live",
  sourceLabel: null,
  capturedAt: T,
  ageText: null,
  calculated: false,
  ...overrides,
});

const liveClimate = (): readonly TentDetailCaptureClimate[] =>
  tentDetailCaptureClimate(
    [
      {
        metric: "temperature_c",
        value: 24,
        ts: T,
        captured_at: T,
        source: "live",
        quality: "ok",
      },
      {
        metric: "humidity_pct",
        value: 55,
        ts: T,
        captured_at: T,
        source: "live",
        quality: "ok",
      },
    ],
    null,
  );

describe("tonightVpdPassesTruth", () => {
  it("withholds an out-of-range VPD before the capture-climate check runs", () => {
    const tonight = vpdMetric({ value: 99 });
    expect(tonightCaptureRejected(tonight, null, liveClimate())).toBe(false);
    expect(tonightVpdPassesTruth(tonight, null, liveClimate())).toBe(false);
  });

  it("accepts a realistic VPD when the capture climate is clean", () => {
    const tonight = vpdMetric();
    expect(tonightVpdPassesTruth(tonight, { temp: 24, rh: 55 }, liveClimate())).toBe(true);
  });

  it("withholds a calculated VPD without realistic contributors", () => {
    const tonight = vpdMetric({ calculated: true, value: 1.0 });
    expect(tonightVpdPassesTruth(tonight, null, liveClimate())).toBe(false);
    expect(tonightVpdPassesTruth(tonight, { temp: 24, rh: 55 }, liveClimate())).toBe(true);
  });

  it("withholds when same-capture climate is untrusted", () => {
    const staleRh = tentDetailCaptureClimate(
      [
        {
          metric: "humidity_pct",
          value: 55,
          ts: T,
          captured_at: T,
          source: "stale",
          quality: "ok",
        },
      ],
      null,
    );
    expect(tonightVpdPassesTruth(vpdMetric(), null, staleRh)).toBe(false);
  });
});

describe("tentDetailVpdNeedsOwnProvenance", () => {
  const header = {
    vpd: 1.1,
    source: "live",
    capturedAt: T,
    stale: false,
  };

  it("never asks for a line when there is no displayed VPD", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: {
          value: null,
          capturedAt: null,
          source: null,
          stale: false,
          calculated: false,
        },
        header,
      }),
    ).toBe(false);
  });

  it("asks for a line when Tonight differs on value, source, time, staleness, or is calculated", () => {
    const base = {
      value: 1.1,
      capturedAt: T,
      source: "live" as const,
      stale: false,
      calculated: false,
    };
    expect(
      tentDetailVpdNeedsOwnProvenance({ observation: base, header: { ...header, vpd: null } }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...base, value: 1.2 },
        header,
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...base, source: "manual" },
        header,
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...base, capturedAt: new Date(NOW - 60_000).toISOString() },
        header,
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...base, stale: true },
        header,
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...base, calculated: true },
        header,
      }),
    ).toBe(true);
  });

  it("skips a duplicate line when observation matches the header snapshot", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: {
          value: 1.1,
          capturedAt: T,
          source: "live",
          stale: false,
          calculated: false,
        },
        header,
      }),
    ).toBe(false);
  });
});

describe("Tent Detail wires provenance when Tonight overrides the header VPD", () => {
  it("calls tentDetailVpdNeedsOwnProvenance for the resolved header VPD", () => {
    expect(TENT_DETAIL).toMatch(/tentDetailVpdNeedsOwnProvenance\s*\(\s*\{/);
    expect(TENT_DETAIL).toMatch(/const vpdFromFallback = tentDetailVpdNeedsOwnProvenance/);
  });
});
