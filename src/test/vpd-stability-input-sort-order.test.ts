import { describe, expect, it } from "vitest";
import type { SensorReading } from "@/mock";
import { vpdStabilityInputsFromWideReadings } from "@/lib/vpdStabilityInputRules";

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

describe("vpdStabilityInputsFromWideReadings sort order", () => {
  it("returns newest observed VPD first for header fallback selection", () => {
    const inputs = vpdStabilityInputsFromWideReadings([
      reading({ ts: "2026-10-15T10:00:00.000Z", capturedAt: "2026-10-15T10:00:00.000Z", vpd: 0.8 }),
      reading({ ts: "2026-10-15T12:00:00.000Z", capturedAt: "2026-10-15T12:00:00.000Z", vpd: 1.2 }),
    ]);
    expect(inputs.map((row) => row.ts)).toEqual([
      "2026-10-15T12:00:00.000Z",
      "2026-10-15T10:00:00.000Z",
    ]);
  });
});
