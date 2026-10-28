/**
 * Environment card chart tooltips must use the same display rounding as the
 * card. Stored Celsius stays exact; only the tooltip string is rounded.
 */
import { describe, expect, it } from "vitest";
import { formatSensorChartTooltipValue } from "@/lib/sensorChartAxisRules";
import { convertCelsiusForDisplay } from "@/lib/temperatureUnitPreference";

describe("sensor chart tooltip display rounding", () => {
  it("renders a °C reading that converts to 75.002°F as 75.0°F", () => {
    const celsius = 23.89;
    const fahrenheit = convertCelsiusForDisplay(celsius, "fahrenheit");
    expect(fahrenheit).not.toBeNull();
    expect(String(fahrenheit)).toContain("75.002");
    expect(formatSensorChartTooltipValue(fahrenheit as number, "temp", "fahrenheit")).toBe(
      "75.0°F",
    );
  });

  it("rounds humidity the same way the Environment card does (one decimal)", () => {
    expect(formatSensorChartTooltipValue(62.049, "rh")).toBe("62.0%");
  });
});
