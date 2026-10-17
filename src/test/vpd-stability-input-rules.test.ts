import { describe, expect, it } from "vitest";
import type { SensorReading } from "@/mock";
import {
  mergeVpdStabilityInputs,
  vpdStabilityInputsFromWideReadings,
} from "@/lib/vpdStabilityInputRules";

function reading(overrides: Partial<SensorReading>): SensorReading {
  return {
    ts: "2026-10-15T12:00:00.000Z",
    tentId: "tent-1",
    temp: 24,
    rh: 55,
    vpd: 1.2,
    co2: 0,
    soil: 0,
    observedMetrics: ["temp", "rh", "vpd"],
    source: "manual",
    status: "usable",
    capturedAt: "2026-10-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("vpdStabilityInputsFromWideReadings", () => {
  it("keeps observed manual VPD and skips rows that never observed VPD", () => {
    const inputs = vpdStabilityInputsFromWideReadings([
      reading({}),
      reading({
        ts: "2026-10-15T11:00:00.000Z",
        capturedAt: "2026-10-15T11:00:00.000Z",
        vpd: 0,
        observedMetrics: ["temp", "rh"],
      }),
    ]);
    expect(inputs).toEqual([
      {
        ts: "2026-10-15T12:00:00.000Z",
        vpd: 1.2,
        source: "manual",
        stale: false,
      },
    ]);
  });

  it("drops invalid VPD", () => {
    expect(
      vpdStabilityInputsFromWideReadings([reading({ source: "invalid", status: "invalid" })]),
    ).toEqual([]);
  });
});

describe("mergeVpdStabilityInputs", () => {
  it("adds manual VPD timestamps the stored series does not have", () => {
    const merged = mergeVpdStabilityInputs(
      [],
      [
        {
          ts: "2026-10-15T12:00:00.000Z",
          vpd: 1.4,
          source: "manual",
          stale: false,
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.vpd).toBe(1.4);
  });

  it("lets the manual value win at the same timestamp", () => {
    const merged = mergeVpdStabilityInputs(
      [{ ts: "2026-10-15T12:00:00.000Z", vpd: 0.4, source: "manual" }],
      [{ ts: "2026-10-15T12:00:00.000Z", vpd: 1.4, source: "manual" }],
    );
    expect(merged).toEqual([{ ts: "2026-10-15T12:00:00.000Z", vpd: 1.4, source: "manual" }]);
  });
});
