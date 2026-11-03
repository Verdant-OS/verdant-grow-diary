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

  it("shows Humidity and VPD in the metric cell with the raw key only as data-metric", () => {
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

    expect(humidity?.querySelectorAll("td").length).toBe(3);
    expect(humidity?.querySelectorAll("td")[1]?.textContent).toBe("Humidity");
    expect(humidity?.querySelectorAll("td")[1]?.getAttribute("data-metric")).toBe("humidity_pct");
    expect(humidity?.textContent).not.toContain("humidity_pct");
    expect(vpd?.querySelectorAll("td").length).toBe(3);
    expect(vpd?.querySelectorAll("td")[1]?.textContent).toBe("VPD");
    expect(vpd?.querySelectorAll("td")[1]?.getAttribute("data-metric")).toBe("vpd_kpa");
    expect(vpd?.textContent).not.toContain("vpd_kpa");
    expect(screen.getByTestId("imported-history-metric-filter-humidity_pct")).toHaveTextContent(
      "Humidity",
    );
    expect(screen.getByTestId("imported-history-metric-filter-vpd_kpa")).toHaveTextContent("VPD");
  });
});
