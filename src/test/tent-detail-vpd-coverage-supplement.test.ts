/**
 * Direct pins for tent VPD helpers that #2430 exports but only exercises
 * indirectly through resolveTentDetailVpd or hook wiring:
 * `tentDetailVpdNeedsOwnProvenance`, `tonightVpdPassesTruth`, and
 * `withRejectedQualityRows`.
 */
import { describe, expect, it } from "vitest";
import { withRejectedQualityRows } from "@/lib/dashboardSensorEvidenceRules";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import {
  tentDetailCaptureClimate,
  tentDetailVpdNeedsOwnProvenance,
  tonightVpdPassesTruth,
} from "@/lib/tentDetailVpdRules";
import type { TonightMetricView } from "@/lib/tonightTentHomeViewModel";

const T = "2026-10-22T12:00:00.000Z";
const T2 = "2026-10-22T12:05:00.000Z";

function tonight(over: Partial<TonightMetricView>): TonightMetricView {
  return {
    key: "vpd",
    label: "VPD",
    state: "value",
    value: 1.2,
    source: "live",
    sourceLabel: "Live",
    capturedAt: T,
    ageText: null,
    calculated: false,
    captureRefs: [],
    ...over,
  } as TonightMetricView;
}

describe("tentDetailVpdNeedsOwnProvenance", () => {
  const baseObservation = {
    value: 1.2,
    capturedAt: T,
    source: "live" as const,
    stale: false,
    calculated: false,
  };

  it("returns false when the observation has no value", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...baseObservation, value: null },
        header: { vpd: 1.2, source: "live", capturedAt: T, stale: false },
      }),
    ).toBe(false);
  });

  it("returns true when Tonight calculated the VPD even if the header matches", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...baseObservation, calculated: true },
        header: { vpd: 1.2, source: "live", capturedAt: T, stale: false },
      }),
    ).toBe(true);
  });

  it("returns true when value matches but provenance differs", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...baseObservation, source: "manual" },
        header: { vpd: 1.2, source: "live", capturedAt: T, stale: false },
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...baseObservation, capturedAt: T2 },
        header: { vpd: 1.2, source: "live", capturedAt: T, stale: false },
      }),
    ).toBe(true);
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: { ...baseObservation, stale: true },
        header: { vpd: 1.2, source: "live", capturedAt: T, stale: false },
      }),
    ).toBe(true);
  });

  it("returns false when observation and header snapshot agree", () => {
    expect(
      tentDetailVpdNeedsOwnProvenance({
        observation: baseObservation,
        header: { vpd: 1.2, source: "live", capturedAt: T, stale: false },
      }),
    ).toBe(false);
  });
});

describe("tonightVpdPassesTruth", () => {
  it("rejects an out-of-range VPD before capture checks", () => {
    expect(
      tonightVpdPassesTruth(
        tonight({ value: 999 }),
        { temp: 24, rh: 55 },
        tentDetailCaptureClimate([], null),
      ),
    ).toBe(false);
  });

  it("rejects when the capture climate is untrusted at the same instant", () => {
    const climate = tentDetailCaptureClimate(
      [
        {
          metric: "temperature_c",
          value: 24,
          captured_at: T,
          quality: "invalid",
          source: "live",
        },
      ],
      null,
    );
    expect(tonightVpdPassesTruth(tonight({}), { temp: 24, rh: 55 }, climate)).toBe(false);
  });

  it("accepts a realistic calculated VPD with clean capture climate", () => {
    const climate = tentDetailCaptureClimate(
      [
        { metric: "temperature_c", value: 24, captured_at: T, quality: "ok", source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: T, quality: "ok", source: "live" },
      ],
      null,
    );
    expect(
      tonightVpdPassesTruth(
        tonight({ calculated: true, value: 1.1 }),
        { temp: 24, rh: 55 },
        climate,
      ),
    ).toBe(true);
  });
});

describe("withRejectedQualityRows", () => {
  const snapshot: SensorSnapshot = {
    source: "live",
    ts: T,
    temp: 24,
    rh: 55,
    vpd: 1.2,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
  };

  it("returns null for a null snapshot", () => {
    expect(withRejectedQualityRows(null, [])).toBeNull();
  });

  it("leaves the snapshot unchanged when no rows are quality-rejected", () => {
    expect(
      withRejectedQualityRows(snapshot, [
        {
          tent_id: "t1",
          ts: T,
          metric: "vpd_kpa",
          value: 1.2,
          source: "live",
          quality: "ok",
        },
      ]),
    ).toEqual(snapshot);
  });

  it("attaches rejected_quality_rows when intake quality downgrades exist", () => {
    const out = withRejectedQualityRows(snapshot, [
      {
        tent_id: "t1",
        ts: T,
        metric: "humidity_pct",
        value: 55,
        source: "live",
        quality: "degraded",
      },
    ]);
    expect(out).toEqual({
      ...snapshot,
      rejected_quality_rows: [
        expect.objectContaining({ metric: "humidity_pct", quality: "degraded" }),
      ],
    });
  });
});
