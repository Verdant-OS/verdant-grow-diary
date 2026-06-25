/**
 * sensor-source-legend-tooltip — accessibility + content tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorSourceLegendTooltip from "@/components/SensorSourceLegendTooltip";
import { SENSOR_SOURCE_LEGEND, SENSOR_SOURCE_KINDS } from "@/constants/sensorSourceLabels";

describe("SensorSourceLegendTooltip", () => {
  it("renders a keyboard/focus-accessible disclosure", () => {
    render(<SensorSourceLegendTooltip />);
    const summary = screen.getByTestId("sensor-source-legend-summary");
    // <summary> is natively keyboard accessible: tabbable, Enter/Space toggles.
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary).toHaveAttribute("aria-label", "Sensor source legend");
    expect(summary).toHaveTextContent(/Sensor source legend/i);
  });

  it("renders definitions for all six canonical source kinds", () => {
    render(<SensorSourceLegendTooltip />);
    for (const kind of SENSOR_SOURCE_KINDS) {
      const row = screen.getByTestId(`sensor-source-legend-row-${kind}`);
      expect(row).toHaveTextContent(SENSOR_SOURCE_LEGEND[kind]);
    }
  });

  it("respects a custom testIdSuffix", () => {
    render(<SensorSourceLegendTooltip testIdSuffix="x" />);
    expect(screen.getByTestId("sensor-source-legend-x")).toBeInTheDocument();
    expect(screen.getByTestId("sensor-source-legend-x-summary")).toBeInTheDocument();
  });
});
