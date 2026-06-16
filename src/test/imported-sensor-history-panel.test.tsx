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
    expect(screen.getByTestId("imported-history-metrics")).toHaveTextContent(
      "humidity_pct, temperature_c",
    );
    // Live row never leaks into the metrics summary.
    expect(
      screen.getByTestId("imported-history-metrics").textContent ?? "",
    ).not.toContain("co2_ppm");
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
});
