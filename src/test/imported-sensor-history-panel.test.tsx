/**
 * imported-sensor-history-panel — render tests for the Tent Detail
 * Imported Sensor History section. Read-only UI only.
 */
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";
import type { ImportedSensorHistoryInputRow } from "@/lib/importedSensorHistoryViewModel";

function wrap(ui: React.ReactElement, initialEntries = ["/tents/tent-A"]) {
  return <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>;
}

const csvRow = (
  overrides: Partial<ImportedSensorHistoryInputRow> = {},
): ImportedSensorHistoryInputRow => ({
  tent_id: "tent-A",
  source: "csv",
  metric: "temperature_c",
  captured_at: "2026-06-01T00:00:00Z",
  ts: "2026-06-01T00:00:00Z",
  value: 22.5,
  ...overrides,
});

describe("ImportedSensorHistoryPanel", () => {
  it("renders Source: CSV and Not live data labels", () => {
    render(
      wrap(<ImportedSensorHistoryPanel tentId="tent-A" readings={[csvRow()]} />),
    );
    expect(screen.getByText("Imported sensor history")).toBeInTheDocument();
    expect(screen.getByTestId("imported-history-source-badge")).toHaveTextContent(
      "Source: CSV",
    );
    expect(
      screen.getByTestId("imported-history-not-live-badge"),
    ).toHaveTextContent("Not live data");
  });

  it("renders the empty-state copy when no CSV readings exist", () => {
    render(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[csvRow({ source: "live" })]}
        />,
      ),
    );
    expect(screen.getByTestId("imported-history-empty")).toHaveTextContent(
      "No imported CSV sensor history for this tent yet.",
    );
  });

  it("renders a safe empty state when no tent context is provided", () => {
    render(wrap(<ImportedSensorHistoryPanel tentId={null} readings={[]} />));
    expect(screen.getByTestId("imported-sensor-history-panel")).toBeInTheDocument();
    expect(screen.getByText(/No imported CSV sensor history/)).toBeInTheDocument();
  });

  it("renders summary counts and metrics for CSV readings", () => {
    render(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[
            csvRow({ metric: "temperature_c", captured_at: "2026-06-01T00:00:00Z" }),
            csvRow({ metric: "humidity_pct", captured_at: "2026-06-02T00:00:00Z" }),
            csvRow({ source: "live", metric: "co2_ppm" }),
          ]}
        />,
      ),
    );
    expect(screen.getByTestId("imported-history-total")).toHaveTextContent("2");
    const filters = screen.getByTestId("imported-history-metric-filters");
    expect(filters).toHaveTextContent("humidity_pct");
    expect(filters).toHaveTextContent("temperature_c");
    // Live row never leaks into the metric filter list.
    expect(filters.textContent ?? "").not.toContain("co2_ppm");
  });

  it("never renders raw_payload or forbidden live-creation wording", () => {
    const { container } = render(
      wrap(<ImportedSensorHistoryPanel tentId="tent-A" readings={[csvRow()]} />),
    );
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toContain("raw_payload");
    for (const phrase of [
      "live readings imported",
      "live sensor readings imported",
      "synced live data",
      "created live sensor data",
    ]) {
      expect(html).not.toContain(phrase);
    }
  });

  it("exposes the imported-history anchor target on the section", () => {
    const { container } = render(
      wrap(<ImportedSensorHistoryPanel tentId="tent-A" readings={[csvRow()]} />),
    );
    const section = container.querySelector("#imported-history");
    expect(section).not.toBeNull();
  });

  it("renders metric filter controls only when CSV metrics exist", () => {
    const { rerender } = render(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[csvRow({ source: "live" })]}
        />,
      ),
    );
    expect(
      screen.queryByTestId("imported-history-metric-filters"),
    ).not.toBeInTheDocument();

    rerender(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[
            csvRow({ metric: "temperature_c" }),
            csvRow({ metric: "humidity_pct", captured_at: "2026-06-02T00:00:00Z" }),
          ]}
        />,
      ),
    );
    const group = screen.getByTestId("imported-history-metric-filters");
    expect(group).toBeInTheDocument();
    expect(
      within(group).getByTestId("imported-history-metric-filter-all"),
    ).toHaveTextContent("All metrics");
    expect(
      within(group).getByTestId("imported-history-metric-filter-temperature_c"),
    ).toHaveTextContent("temperature_c");
  });

  it("updates visible rows and visible count when a metric filter is selected", () => {
    render(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[
            csvRow({ metric: "temperature_c", captured_at: "2026-06-01T00:00:00Z" }),
            csvRow({ metric: "temperature_c", captured_at: "2026-06-02T00:00:00Z" }),
            csvRow({ metric: "humidity_pct", captured_at: "2026-06-03T00:00:00Z" }),
          ]}
        />,
      ),
    );
    expect(screen.getByTestId("imported-history-total")).toHaveTextContent("3");
    expect(screen.getByTestId("imported-history-visible")).toHaveTextContent("3");

    fireEvent.click(
      screen.getByTestId("imported-history-metric-filter-humidity_pct"),
    );
    expect(screen.getByTestId("imported-history-visible")).toHaveTextContent("1");
    // Total readings count is unaffected by local filtering.
    expect(screen.getByTestId("imported-history-total")).toHaveTextContent("3");

    const rows = screen
      .getByTestId("imported-history-recent-rows")
      .querySelectorAll("tbody tr");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent ?? "").toContain("humidity_pct");
  });

  it("never renders device_id, user_id, or internal id fields", () => {
    const { container } = render(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[
            csvRow({ metric: "temperature_c" }),
            csvRow({ metric: "humidity_pct", captured_at: "2026-06-02T00:00:00Z" }),
          ]}
        />,
      ),
    );
    const html = container.innerHTML.toLowerCase();
    for (const banned of ["device_id", "user_id", "raw_payload"]) {
      expect(html).not.toContain(banned);
    }
  });
});
