import { describe, expect, it } from "vitest";

import {
  calculatePublicVpdChartFromFahrenheit,
  PUBLIC_VPD_CHART_AIR_CELSIUS_MAX,
  PUBLIC_VPD_CHART_STAGES,
  PUBLIC_VPD_CHART_WEB_APPLICATION_JSON_LD,
  publicVpdChartAirTemperatureFromDisplay,
  publicVpdChartCommonTargetsSentence,
  publicVpdChartDisplayedAirTemperature,
  publicVpdChartDisplayedOffset,
  publicVpdChartMatchingStages,
  publicVpdChartMoveFocus,
  publicVpdChartOffsetFromDisplay,
  publicVpdChartSourcesSentence,
  publicVpdChartStageHeading,
  publicVpdChartStageRangeKpa,
} from "@/lib/publicVpdChartRules";

describe("public VPD chart math", () => {
  it("pins the uploaded Fahrenheit cases to two decimals", () => {
    expect(calculatePublicVpdChartFromFahrenheit(77, 60, -2).vpdFormatted).toBe("1.06");
    expect(calculatePublicVpdChartFromFahrenheit(80, 55, -3).vpdFormatted).toBe("1.24");
    expect(calculatePublicVpdChartFromFahrenheit(72, 70, -2).vpdFormatted).toBe("0.63");
  });

  it("matches overlapping stage bands from the rounded kPa", () => {
    expect(publicVpdChartMatchingStages(1.06).map((stage) => stage.id)).toEqual([
      "veg",
      "early_flower",
    ]);
    expect(publicVpdChartMatchingStages(1.24).map((stage) => stage.id)).toEqual([
      "early_flower",
      "late_flower",
    ]);
    expect(publicVpdChartMatchingStages(0.63).map((stage) => stage.id)).toEqual(["clone"]);
  });

  it("converts displayed air temperature and leaf offset when the unit toggles", () => {
    expect(publicVpdChartDisplayedAirTemperature(77, "F")).toBe(77);
    expect(publicVpdChartDisplayedAirTemperature(77, "C")).toBe(25);
    expect(publicVpdChartDisplayedOffset(-2, "F")).toBe(-2);
    expect(publicVpdChartDisplayedOffset(-2, "C")).toBe(-1.1);

    expect(publicVpdChartAirTemperatureFromDisplay(25, "C")).toBeCloseTo(77, 5);
    expect(publicVpdChartOffsetFromDisplay(-1.1, "C")).toBeCloseTo(-1.98, 2);
    expect(PUBLIC_VPD_CHART_AIR_CELSIUS_MAX).toBe(37.8);
    expect(publicVpdChartAirTemperatureFromDisplay(37.8, "C")).toBe(100);
    expect(publicVpdChartDisplayedAirTemperature(100, "C")).toBe(37.8);
    expect(publicVpdChartAirTemperatureFromDisplay(38, "C")).toBe(100);
    expect(publicVpdChartAirTemperatureFromDisplay(0, "C")).toBe(50);
    expect(publicVpdChartOffsetFromDisplay(9, "F")).toBe(5);
  });

  it("builds the intro and source sentences from the stage table", () => {
    const targets = publicVpdChartCommonTargetsSentence();
    const sources = publicVpdChartSourcesSentence();
    expect(targets.startsWith("Common grower targets are ")).toBe(true);
    expect(sources.startsWith("Sources: ")).toBe(true);
    expect(sources.endsWith("Common grower targets, not strict rules. Updated Oct 2026.")).toBe(
      true,
    );
    for (const stage of PUBLIC_VPD_CHART_STAGES) {
      expect(publicVpdChartStageHeading(stage)).toBe(
        `${stage.name} (${publicVpdChartStageRangeKpa(stage)})`,
      );
      expect(targets).toContain(`${publicVpdChartStageRangeKpa(stage)} for ${stage.name}`);
      expect(sources).toContain(stage.source);
      expect(sources).toContain(`${stage.name} ${publicVpdChartStageRangeKpa(stage)}`);
    }
    const sharedSource = PUBLIC_VPD_CHART_STAGES[0]?.source;
    const shared = PUBLIC_VPD_CHART_STAGES.filter((stage) => stage.source === sharedSource);
    expect(shared.length).toBeGreaterThan(1);
    expect(sources).toContain(
      `${sharedSource} (${shared.map((stage) => `${stage.name} ${publicVpdChartStageRangeKpa(stage)}`).join(", ")})`,
    );
  });

  it("moves heatmap focus one cell and keeps the WebApplication URL", () => {
    expect(publicVpdChartMoveFocus(2, 3, "ArrowLeft")).toEqual({ row: 2, column: 2 });
    expect(publicVpdChartMoveFocus(0, 0, "ArrowUp")).toEqual({ row: 0, column: 0 });
    expect(publicVpdChartMoveFocus(0, 0, "Enter")).toBeNull();
    expect(PUBLIC_VPD_CHART_WEB_APPLICATION_JSON_LD.url).toBe(
      "https://verdantgrowdiary.com/vpd-chart",
    );
    expect(PUBLIC_VPD_CHART_WEB_APPLICATION_JSON_LD["@type"]).toBe("WebApplication");
  });
});
