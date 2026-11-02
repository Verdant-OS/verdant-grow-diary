import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import { saveTemperatureUnitPreference } from "@/lib/temperatureUnitPreference";

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";
import type { ImportedSensorHistoryInputRow } from "@/lib/importedSensorHistoryViewModel";

function row(
  metric: string,
  value: number,
  capturedAt = "2026-11-02T14:00:00.000Z",
): ImportedSensorHistoryInputRow {
  return {
    tent_id: "tent-A",
    source: "csv",
    metric,
    captured_at: capturedAt,
    ts: capturedAt,
    value,
  };
}

describe("imported history metric selectors", () => {
  beforeEach(() => {
    saveTemperatureUnitPreference("celsius");
  });

  it("keeps humidity_pct and vpd_kpa in the row text while the metric cell shows the friendly label", () => {
    render(
      <MemoryRouter initialEntries={["/tents/tent-A"]}>
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[row("humidity_pct", 52), row("vpd_kpa", 1.11)]}
        />
      </MemoryRouter>,
    );
    const bodyRows = screen
      .getByTestId("imported-history-recent-rows")
      .querySelectorAll("tbody tr");

    const humidity = Array.from(bodyRows).find((tr) => tr.textContent?.includes("52%"));
    const vpd = Array.from(bodyRows).find((tr) => tr.textContent?.includes("1.11 kPa"));

    expect(humidity?.querySelectorAll("td")[1]?.textContent).toBe("Humidity");
    expect(humidity?.textContent).toContain("humidity_pct");
    expect(vpd?.querySelectorAll("td")[1]?.textContent).toBe("VPD");
    expect(vpd?.textContent).toContain("vpd_kpa");
    expect(screen.getByTestId("imported-history-metric-filter-humidity_pct")).toHaveTextContent(
      "Humidity",
    );
    expect(screen.getByTestId("imported-history-metric-filter-vpd_kpa")).toHaveTextContent("VPD");
  });
});
