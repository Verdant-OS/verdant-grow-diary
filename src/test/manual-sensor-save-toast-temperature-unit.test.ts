/**
 * Manual snapshot success toast follows the grower's temperature unit
 * (Pollen #7, related #2160). °F stays the default when no unit is given.
 */
import { describe, expect, it } from "vitest";
import { buildManualSaveSuccessLine } from "@/lib/manualSensorSaveConfirmation";

const metrics = [
  { metric: "temperature_c" as const, value: 31 },
  { metric: "humidity_pct" as const, value: 40 },
];

describe("buildManualSaveSuccessLine temperature unit", () => {
  it("shows Celsius when the grower's unit is °C", () => {
    expect(buildManualSaveSuccessLine({ metrics, temperatureUnit: "C" })).toBe(
      "Manual snapshot saved: 31°C · 40% RH. Source: Manual.",
    );
    expect(
      buildManualSaveSuccessLine({
        metrics: [{ metric: "temperature_c", value: 32 }],
        temperatureUnit: "C",
      }),
    ).toBe("Manual snapshot saved: 32°C. Source: Manual.");
  });

  it("keeps Fahrenheit for °F and when no unit is given", () => {
    const fahrenheit = "Manual snapshot saved: 88°F · 40% RH. Source: Manual.";
    expect(buildManualSaveSuccessLine({ metrics, temperatureUnit: "F" })).toBe(fahrenheit);
    expect(buildManualSaveSuccessLine({ metrics })).toBe(fahrenheit);
  });
});
