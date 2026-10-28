/**
 * Per-metric tooltip display rounding. Soil is one decimal by product
 * decision (Cheeko); the Environment card does not render soil.
 */
import { describe, expect, it } from "vitest";
import { formatSensorChartTooltipValue } from "@/lib/sensorChartAxisRules";

describe("formatSensorChartTooltipValue fractional display", () => {
  it("rounds the literal converted temperature float to one decimal", () => {
    const tooltip = formatSensorChartTooltipValue(75.00200000000001, "temp");
    expect(tooltip).toBe("75.0°F");
    expect(tooltip).not.toContain("75.00200000000001");
  });

  it("rounds VPD, CO₂, PPFD, and soil moisture to their display decimals", () => {
    expect(formatSensorChartTooltipValue(1.18432, "vpd")).toBe("1.18 kPa");
    expect(formatSensorChartTooltipValue(1200.4, "co2")).toBe("1200 ppm");
    expect(formatSensorChartTooltipValue(665.4, "ppfd")).toBe("665 µmol/m²/s");
    expect(formatSensorChartTooltipValue(40.46, "soil")).toBe("40.5%");
  });

  it("renders a temperature that rounds to negative zero as 0.0°F", () => {
    expect(formatSensorChartTooltipValue(-0.04, "temp")).toBe("0.0°F");
  });
});
