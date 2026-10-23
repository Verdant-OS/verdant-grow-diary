/**
 * Direct unit coverage for tentDetailVpdRules gates that Tent Detail and the
 * tents list compose: value realism (`tonightVpdPassesTruth`) and when the
 * page shows a separate VPD provenance line (`tentDetailVpdNeedsOwnProvenance`).
 */
import { describe, expect, it } from "vitest";
import {
  tentDetailCaptureClimate,
  tentDetailVpdNeedsOwnProvenance,
  tonightVpdPassesTruth,
  type TentDetailVpdObservation,
} from "@/lib/tentDetailVpdRules";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";

const NOW = Date.parse("2026-10-23T19:00:00.000Z");
const T = new Date(NOW - 10 * 60_000).toISOString();

const tonight = (over: Partial<TonightMetricView> = {}): TonightMetricView => ({
  key: "vpd",
  label: "VPD",
  state: "value",
  value: 1.2,
  source: "live",
  sourceLabel: "Live",
  capturedAt: T,
  ageText: "10m ago",
  calculated: false,
  ...over,
});

describe("tonightVpdPassesTruth", () => {
  const okClimate = tentDetailCaptureClimate(
    [
      {
        metric: "temperature_c",
        value: 25,
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

  it("is false when the VPD value itself fails sensor-truth realism", () => {
    expect(tonightVpdPassesTruth(tonight({ value: 9.9 }), null, okClimate)).toBe(false);
  });

  it("is false when the capture is rejected even if the VPD number looks plausible", () => {
    const climate = tentDetailCaptureClimate(
      [
        {
          metric: "humidity_pct",
          value: 150,
          ts: T,
          captured_at: T,
          source: "live",
          quality: "ok",
        },
      ],
      null,
    );
    expect(tonightVpdPassesTruth(tonight(), null, climate)).toBe(false);
  });

  it("is true for a plausible direct VPD on a clean capture", () => {
    expect(tonightVpdPassesTruth(tonight(), null, okClimate)).toBe(true);
  });

  it("is false for a calculated VPD when Tonight has no contributor pair", () => {
    expect(tonightVpdPassesTruth(tonight({ calculated: true, value: 1.1 }), null, okClimate)).toBe(
      false,
    );
  });
});

describe("tentDetailVpdNeedsOwnProvenance", () => {
  const observation = (over: Partial<TentDetailVpdObservation>): TentDetailVpdObservation => ({
    value: 1.2,
    capturedAt: T,
    source: "live",
    stale: false,
    calculated: false,
    ...over,
  });

  const header = {
    vpd: 1.2,
    source: "live",
    capturedAt: T,
    stale: false,
  };

  it("is false when there is no VPD value to explain", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ value: null }),
        header,
      }),
    ).toBe(false);
  });

  it("is true when Tonight calculated the VPD even if the header matches", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ calculated: true }),
        header,
      }),
    ).toBe(true);
  });

  it("is true when the value matches but provenance differs", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({ source: "manual", capturedAt: T }),
        header: { ...header, source: "live" },
      }),
    ).toBe(true);
  });

  it("is false when value, source, capture time and staleness all match the header", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: observation({}),
        header,
      }),
    ).toBe(false);
  });
});
