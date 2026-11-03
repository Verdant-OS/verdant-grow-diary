import { describe, expect, it } from "vitest";
import { buildTentSnapshotView } from "@/lib/dashboardEnvironmentSnapshotViewModel";
import { LatestVpdReadingSelection } from "@/lib/latestVpdReadingSelection";

const CSV_AT = Date.parse("2026-10-28T12:30:00.000Z");
const MANUAL_AT = Date.parse("2026-11-02T20:00:00.000Z");
/** 74 °F stored as Celsius, the unit sensor rows use. */
const MANUAL_TEMP_C = ((74 - 32) * 5) / 9;

describe("LatestVpdReadingSelection", () => {
  it("derives VPD from a newer manual pair instead of an older CSV VPD", () => {
    const choice = LatestVpdReadingSelection.choose({
      storedVpdKpa: 0.84,
      storedCapturedAtMs: CSV_AT,
      pairTempC: MANUAL_TEMP_C,
      pairRh: 56,
      pairCapturedAtMs: MANUAL_AT,
    });

    expect(choice).toEqual({
      kind: "derived",
      vpdKpa: 1.26,
      capturedAtMs: MANUAL_AT,
    });
  });

  it("keeps a newer CSV VPD when the manual pair is older", () => {
    const choice = LatestVpdReadingSelection.choose({
      storedVpdKpa: 0.84,
      storedCapturedAtMs: MANUAL_AT,
      pairTempC: MANUAL_TEMP_C,
      pairRh: 56,
      pairCapturedAtMs: CSV_AT,
    });

    expect(choice).toEqual({
      kind: "stored",
      vpdKpa: 0.84,
      capturedAtMs: MANUAL_AT,
    });
  });

  it("keeps a stored VPD captured at the same instant as the pair", () => {
    const choice = LatestVpdReadingSelection.choose({
      storedVpdKpa: 1.1,
      storedCapturedAtMs: MANUAL_AT,
      pairTempC: MANUAL_TEMP_C,
      pairRh: 56,
      pairCapturedAtMs: MANUAL_AT,
    });

    expect(choice.kind).toBe("stored");
  });
});

describe("dashboard Environment Snapshot uses the shared VPD rule", () => {
  const now = Date.parse("2026-11-02T21:00:00.000Z");

  it("shows the manual pair's VPD when that reading is newer than CSV history", () => {
    const view = buildTentSnapshotView(
      [
        {
          ts: "2026-10-28T12:30:00.000Z",
          captured_at: "2026-10-28T12:30:00.000Z",
          metric: "temperature_c",
          value: 25,
          source: "csv",
        },
        {
          ts: "2026-10-28T12:30:00.000Z",
          captured_at: "2026-10-28T12:30:00.000Z",
          metric: "humidity_pct",
          value: 60,
          source: "csv",
        },
        {
          ts: "2026-10-28T12:30:00.000Z",
          captured_at: "2026-10-28T12:30:00.000Z",
          metric: "vpd_kpa",
          value: 0.84,
          source: "csv",
        },
        {
          ts: "2026-11-02T20:00:00.000Z",
          captured_at: "2026-11-02T20:00:00.000Z",
          metric: "temperature_c",
          value: MANUAL_TEMP_C,
          source: "manual",
        },
        {
          ts: "2026-11-02T20:00:00.000Z",
          captured_at: "2026-11-02T20:00:00.000Z",
          metric: "humidity_pct",
          value: 56,
          source: "manual",
        },
      ],
      "veg",
      now,
    );
    const vpd = view.metrics.find((metric) => metric.key === "vpd");
    expect(view.sourceLabel).toBe("Manual");
    expect(vpd?.display).toBe("1.26");
    expect(vpd?.statusLabel).not.toBe("Unknown");
  });
});
