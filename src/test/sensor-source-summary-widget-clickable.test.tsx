/**
 * sensor-source-summary-widget-clickable — verifies the summary widget
 * renders source rows as keyboard-accessible Timeline filter links when
 * count > 0, and as accessible-disabled rows when count = 0.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SensorSourceSummaryWidget from "@/components/SensorSourceSummaryWidget";

const READINGS = [
  { source: "live", captured_at: "2026-06-10T12:00:00Z" },
  { source: "live", captured_at: "2026-06-11T12:00:00Z" },
  { source: "manual", captured_at: "2026-06-11T13:00:00Z" },
  { source: "csv", captured_at: "2026-06-12T13:00:00Z" },
];

function renderWidget(props = {}) {
  return render(
    <MemoryRouter>
      <SensorSourceSummaryWidget readings={READINGS} {...props} />
    </MemoryRouter>,
  );
}

describe("SensorSourceSummaryWidget — clickable rows", () => {
  it("renders a Link for each non-zero source row with sensorSources param", () => {
    renderWidget();
    const live = screen.getByTestId("sensor-source-summary-link-live");
    expect(live.tagName).toBe("A");
    expect(live).toHaveAttribute("href", expect.stringContaining("sensorSources=live"));
    expect(live).toHaveAttribute(
      "aria-label",
      expect.stringMatching(/Open Timeline filtered to Live source/i),
    );
  });

  it("zero-count rows are non-clicking and aria-disabled", () => {
    renderWidget();
    const demoRow = screen.getByTestId("sensor-source-summary-row-demo");
    expect(demoRow).toHaveAttribute("data-clickable", "false");
    expect(demoRow).toHaveAttribute("aria-disabled", "true");
    expect(
      screen.queryByTestId("sensor-source-summary-link-demo"),
    ).toBeNull();
  });

  it("preserves date range in click-through URL", () => {
    renderWidget({
      dateRange: { from: "2026-06-01", to: "2026-06-17" },
    });
    const csv = screen.getByTestId("sensor-source-summary-link-csv");
    const href = csv.getAttribute("href") ?? "";
    expect(href).toContain("sensorSources=csv");
    expect(href).toContain("from=2026-06-01");
    expect(href).toContain("to=2026-06-17");
  });

  it("opts out of links when enableLinks=false", () => {
    renderWidget({ enableLinks: false });
    expect(screen.queryByTestId("sensor-source-summary-link-live")).toBeNull();
    expect(screen.getByTestId("sensor-source-summary-row-live")).toHaveAttribute(
      "data-clickable",
      "false",
    );
  });

  it("each row exposes a screen-reader friendly label distinguishing csv from live", () => {
    renderWidget();
    const liveRow = screen.getByTestId("sensor-source-summary-row-live");
    const csvRow = screen.getByTestId("sensor-source-summary-row-csv");
    expect(liveRow.getAttribute("aria-label")).toMatch(/Live:/);
    expect(csvRow.getAttribute("aria-label")).toMatch(/CSV:/);
    expect(liveRow.getAttribute("aria-label")).not.toBe(
      csvRow.getAttribute("aria-label"),
    );
  });
});
