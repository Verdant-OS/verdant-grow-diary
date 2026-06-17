/**
 * sensor-source-summary-widget — render tests.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SensorSourceSummaryWidget from "@/components/SensorSourceSummaryWidget";

describe("SensorSourceSummaryWidget", () => {
  it("renders empty state when no readings", () => {
    render(<SensorSourceSummaryWidget readings={[]} />);
    expect(screen.getByTestId("sensor-source-summary-empty")).toHaveTextContent(
      /no sensor readings found for this range/i,
    );
  });

  it("renders all six source rows with correct counts", () => {
    const ts = "2025-06-01T12:00:00Z";
    render(
      <SensorSourceSummaryWidget
        readings={[
          { source: "live", captured_at: ts },
          { source: "live", captured_at: ts },
          { source: "manual", captured_at: ts },
          { source: "csv", captured_at: ts },
          { source: "demo", captured_at: ts },
          { source: "invalid", captured_at: ts },
          { source: null, captured_at: ts }, // → invalid
        ]}
      />,
    );
    for (const k of ["live", "manual", "csv", "demo", "stale", "invalid"]) {
      expect(screen.getByTestId(`sensor-source-summary-row-${k}`)).toBeInTheDocument();
    }
    expect(screen.getByTestId("sensor-source-summary-count-live")).toHaveTextContent("2");
    expect(screen.getByTestId("sensor-source-summary-count-manual")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-count-csv")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-count-demo")).toHaveTextContent("1");
    expect(screen.getByTestId("sensor-source-summary-count-invalid")).toHaveTextContent("2");
    expect(screen.getByTestId("sensor-source-summary-count-stale")).toHaveTextContent("0");
  });

  it("includes the legend tooltip access point", () => {
    render(<SensorSourceSummaryWidget readings={[]} />);
    expect(screen.getByTestId("sensor-source-legend-summary")).toBeInTheDocument();
    expect(screen.getByTestId("sensor-source-legend-summary-summary")).toHaveAttribute(
      "aria-label",
      "Sensor source legend",
    );
  });
});
