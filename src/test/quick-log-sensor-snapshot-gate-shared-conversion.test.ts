import { describe, expect, it, vi } from "vitest";

// If the gate carried its own °F conversion it would ignore this stub. Making
// the shared helper report 999 °C for every value proves the gate reads the
// same conversion the sheet's save seam uses.
vi.mock("@/lib/quickLogTypedTemperatureRules", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/quickLogTypedTemperatureRules")>();
  return {
    ...actual,
    convertTypedTemperatureToCelsius: () => ({ kind: "celsius", value: 999 }),
  };
});

import { assessQuickLogSensorSnapshotGate } from "@/lib/quickLogSensorSnapshotGateRules";

describe("assessQuickLogSensorSnapshotGate shared conversion", () => {
  it("takes its °C value from quickLogTypedTemperatureRules", () => {
    for (const unit of ["fahrenheit", "celsius"] as const) {
      const gate = assessQuickLogSensorSnapshotGate({
        temperatureInput: "77",
        humidityInput: "",
        vpdInput: "",
        temperatureUnit: unit,
      });
      expect(gate.blocksSave, unit).toBe(true);
      expect(gate.fields.temperature, unit).toBeDefined();
    }
  });
});
