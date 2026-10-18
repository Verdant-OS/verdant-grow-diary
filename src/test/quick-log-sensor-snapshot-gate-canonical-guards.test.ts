import { describe, expect, it, vi } from "vitest";

// Replace the canonical guards with ones that reject every value. If the gate
// still accepted in-band inputs it would be carrying its own copy of the
// bands, which could drift from quickLogV2SavePayload.ts (which uses these).
vi.mock("@/lib/sensorReadingNormalizationRules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sensorReadingNormalizationRules")>();
  return {
    ...actual,
    isTemperatureValid: (v: number | null) => v === null,
    isHumidityValid: (v: number | null) => v === null,
    isVpdValid: (v: number | null) => v === null,
  };
});

import { assessQuickLogSensorSnapshotGate } from "@/lib/quickLogSensorSnapshotGateRules";

describe("assessQuickLogSensorSnapshotGate canonical guard reuse", () => {
  it("defers temperature, humidity and VPD bands to sensorReadingNormalizationRules", () => {
    const gate = assessQuickLogSensorSnapshotGate({
      temperatureInput: "77",
      humidityInput: "55",
      vpdInput: "1.2",
      temperatureUnit: "fahrenheit",
    });
    expect(Object.keys(gate.fields).sort()).toEqual(["humidity", "temperature", "vpd"]);
    expect(gate.blocksSave).toBe(true);
  });

  it("still treats empty inputs as not provided", () => {
    const gate = assessQuickLogSensorSnapshotGate({
      temperatureInput: "",
      humidityInput: " ",
      vpdInput: null,
      temperatureUnit: "celsius",
    });
    expect(gate).toEqual({ blocksSave: false, fields: {}, footerMessage: null });
  });
});
