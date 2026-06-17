/**
 * sensor-source-inline-legend — tests the persistent inline legend row
 * that lists all canonical sensor source kinds without requiring hover.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorSourceInlineLegend from "@/components/SensorSourceInlineLegend";
import { SENSOR_SOURCE_KINDS } from "@/constants/sensorSourceLabels";

describe("SensorSourceInlineLegend", () => {
  it("renders all six canonical source labels by default", () => {
    render(<SensorSourceInlineLegend />);
    for (const k of SENSOR_SOURCE_KINDS) {
      const row = screen.getByTestId(`sensor-source-inline-legend-row-${k}`);
      expect(row).toBeInTheDocument();
      expect(row).toHaveAttribute("data-highlighted", "false");
      // Each row exposes the full description for screen readers without
      // depending on hover/title.
      expect(row.getAttribute("aria-label")).toMatch(/.+:.+/);
    }
  });

  it("highlights matching source kinds when provided", () => {
    render(<SensorSourceInlineLegend highlight={["live", "csv"]} />);
    expect(
      screen.getByTestId("sensor-source-inline-legend-row-live"),
    ).toHaveAttribute("data-highlighted", "true");
    expect(
      screen.getByTestId("sensor-source-inline-legend-row-csv"),
    ).toHaveAttribute("data-highlighted", "true");
    expect(
      screen.getByTestId("sensor-source-inline-legend-row-manual"),
    ).toHaveAttribute("data-highlighted", "false");
  });

  it("does not rely on hover for source meaning (sr-only definition present)", () => {
    const { container } = render(<SensorSourceInlineLegend />);
    const hidden = container.querySelectorAll(".sr-only");
    expect(hidden.length).toBe(SENSOR_SOURCE_KINDS.length);
  });
});
