/**
 * Environment chart tooltips must round the same way the matching value
 * cards do (dashboard environment strip: temp and humidity to 1 decimal,
 * VPD to 2). A binary float must not leak into the tooltip.
 */
import { describe, expect, it } from "vitest";
import { formatSensorChartTooltipValue } from "@/lib/sensorChartAxisRules";

describe("formatSensorChartTooltipValue precision", () => {
  it("rounds a temperature float the same way the value card does", () => {
    expect(formatSensorChartTooltipValue(75.00200000000001, "temp")).toBe("75.0°F");
    expect(formatSensorChartTooltipValue(75.00200000000001, "temp")).not.toContain(
      "75.00200000000001",
    );
  });

  it("uses value-card decimals for humidity, VPD, and whole-number metrics", () => {
    expect(formatSensorChartTooltipValue(68.046, "rh")).toBe("68.0%");
    expect(formatSensorChartTooltipValue(1.18432, "vpd")).toBe("1.18 kPa");
    expect(formatSensorChartTooltipValue(1200.4, "co2")).toBe("1200 ppm");
    expect(formatSensorChartTooltipValue(40.46, "soil")).toBe("40.5%");
    expect(formatSensorChartTooltipValue(665.4, "ppfd")).toBe("665 µmol/m²/s");
  });

  it("keeps one decimal on a whole temperature so the card and tooltip match", () => {
    expect(formatSensorChartTooltipValue(72, "temp")).toBe("72.0°F");
    expect(formatSensorChartTooltipValue(22, "temp", "celsius")).toBe("22.0°C");
  });
});
