/**
 * imported-sensor-history-panel — render tests for the Tent Detail
 * Imported Sensor History section. Read-only UI only.
 */
import { beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const trackFunnelEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent }));

import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";
import type { ImportedSensorHistoryInputRow } from "@/lib/importedSensorHistoryViewModel";
import { PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID } from "@/lib/plantDetailQuickActions";

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

const eligibleRows = (): ImportedSensorHistoryInputRow[] => [
  csvRow({ captured_at: "2026-06-01T00:00:00Z" }),
  csvRow({ captured_at: "2026-06-02T00:00:00Z", value: 23.5 }),
];

beforeEach(() => {
  trackFunnelEvent.mockClear();
});

describe("ImportedSensorHistoryPanel", () => {
  it("renders Source: CSV and Not live data labels", () => {
    render(wrap(<ImportedSensorHistoryPanel tentId="tent-A" readings={[csvRow()]} />));
    expect(screen.getByText("Imported sensor history")).toBeInTheDocument();
    expect(screen.getByTestId("imported-history-source-badge")).toHaveTextContent("Source: CSV");
    expect(screen.getByTestId("imported-history-not-live-badge")).toHaveTextContent(
      "Not live data",
    );
  });

  it("renders the empty-state copy when no CSV readings exist", () => {
    render(
      wrap(<ImportedSensorHistoryPanel tentId="tent-A" readings={[csvRow({ source: "live" })]} />),
    );
    expect(screen.getByTestId("imported-history-empty")).toHaveTextContent(
      "No imported CSV sensor history for this tent yet.",
    );
  });

  it("keeps a pending read distinct from established empty history", () => {
    render(wrap(<ImportedSensorHistoryPanel tentId="tent-A" readings={[]} readStatus="loading" />));
    expect(screen.getByTestId("imported-history-loading")).toHaveTextContent(
      "Loading imported CSV history",
    );
    expect(screen.queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("imported-history-ai-doctor-handoff")).not.toBeInTheDocument();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it("keeps a failed read distinct from empty history and offers an explicit retry", () => {
    const onRetry = vi.fn();
    render(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[]}
          readStatus="error"
          onRetry={onRetry}
        />,
      ),
    );
    expect(screen.getByTestId("imported-history-error")).toHaveTextContent(
      "Couldn't load imported CSV history",
    );
    expect(screen.queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("imported-history-ai-doctor-handoff")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(trackFunnelEvent).not.toHaveBeenCalled();
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
      wrap(<ImportedSensorHistoryPanel tentId="tent-A" readings={[csvRow({ source: "live" })]} />),
    );
    expect(screen.queryByTestId("imported-history-metric-filters")).not.toBeInTheDocument();

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
    expect(within(group).getByTestId("imported-history-metric-filter-all")).toHaveTextContent(
      "All metrics",
    );
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

    fireEvent.click(screen.getByTestId("imported-history-metric-filter-humidity_pct"));
    expect(screen.getByTestId("imported-history-visible")).toHaveTextContent("1");
    // Total readings count is unaffected by local filtering.
    expect(screen.getByTestId("imported-history-total")).toHaveTextContent("3");

    const rows = screen.getByTestId("imported-history-recent-rows").querySelectorAll("tbody tr");
    expect(rows.length).toBe(1);
    expect(rows[0].textContent ?? "").toContain("humidity_pct");
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it("offers one explicit named plant review and tracks only the grower's click", () => {
    render(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={eligibleRows()}
          plants={[{ id: "plant-1", name: "North Star" }]}
        />,
      ),
    );

    const handoff = screen.getByTestId("imported-history-ai-doctor-handoff");
    expect(handoff).toHaveAttribute("data-state", "single_active_plant");
    expect(trackFunnelEvent).not.toHaveBeenCalled();

    const link = screen.getByTestId("imported-history-ai-doctor-choice-0");
    expect(link).toHaveTextContent("Review North Star");
    expect(link).toHaveAttribute(
      "href",
      `/plants/plant-1?tentId=tent-A#${PLANT_AI_DOCTOR_REVIEW_ANCHOR_ID}`,
    );
    fireEvent.click(link);
    expect(trackFunnelEvent).toHaveBeenCalledTimes(1);
    expect(trackFunnelEvent).toHaveBeenCalledWith("csv_history_ai_doctor_clicked", {
      surface: "imported_history",
    });
  });

  it("shows every active plant in stable order without choosing a default", () => {
    render(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={eligibleRows()}
          plants={[
            { id: "plant-z", name: "Zulu" },
            { id: "plant-b", name: "Alpha" },
            { id: "plant-a", name: "alpha" },
          ]}
        />,
      ),
    );

    const handoff = screen.getByTestId("imported-history-ai-doctor-handoff");
    expect(handoff).toHaveAttribute("data-state", "multiple_active_plants");
    expect(handoff).toHaveTextContent("no plant is selected by default");
    const choices = within(screen.getByTestId("imported-history-ai-doctor-choices")).getAllByRole(
      "link",
    );
    expect(choices.map((choice) => choice.textContent)).toEqual([
      "Review alpha",
      "Review Alpha",
      "Review Zulu",
    ]);
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it("keeps eligible history calm and blocked when no active plant exists", () => {
    render(
      wrap(<ImportedSensorHistoryPanel tentId="tent-A" readings={eligibleRows()} plants={[]} />),
    );
    expect(screen.getByTestId("imported-history-ai-doctor-handoff")).toHaveAttribute(
      "data-state",
      "no_active_plants",
    );
    expect(screen.queryByTestId("imported-history-ai-doctor-choices")).not.toBeInTheDocument();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it.each([
    ["too_few_valid_observations", [csvRow()]],
    ["single_timestamp", [csvRow(), csvRow({ metric: "humidity_pct", value: 51 })]],
  ] as const)("fails closed as %s without a review link", (state, readings) => {
    render(
      wrap(
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[...readings]}
          plants={[{ id: "plant-1", name: "North Star" }]}
        />,
      ),
    );
    expect(screen.getByTestId("imported-history-ai-doctor-handoff")).toHaveAttribute(
      "data-state",
      state,
    );
    expect(screen.queryByTestId("imported-history-ai-doctor-choices")).not.toBeInTheDocument();
    expect(trackFunnelEvent).not.toHaveBeenCalled();
  });

  it.each(["loading", "error"] as const)(
    "distinguishes a %s active-plant read without offering a review link",
    (plantReadStatus) => {
      render(
        wrap(
          <ImportedSensorHistoryPanel
            tentId="tent-A"
            readings={eligibleRows()}
            plants={[]}
            plantReadStatus={plantReadStatus}
          />,
        ),
      );
      expect(screen.getByTestId("imported-history-ai-doctor-handoff")).toHaveAttribute(
        "data-state",
        `plants_${plantReadStatus}`,
      );
      expect(screen.queryByTestId("imported-history-ai-doctor-choices")).not.toBeInTheDocument();
      expect(trackFunnelEvent).not.toHaveBeenCalled();
    },
  );

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
