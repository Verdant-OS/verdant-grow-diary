import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "@/lib/react-router-compat";
import { EnvironmentCsvImportModal } from "@/components/EnvironmentCsvImportModal";
import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";

vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

const limited = { status: "ready", days: 90 } as const;
const dates = ["2026-06-17T11:59:59.999Z", "2026-06-17T12:00:00.000Z", "2026-09-14T12:00:00.000Z"];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
});
afterEach(() => vi.useRealTimers());

async function upload() {
  const csv = ["Timestamp,Temp(°C),RH", ...dates.map((date) => `${date},25,55`)].join("\n");
  fireEvent.change(screen.getByTestId("csv-import-file-input"), {
    target: { files: [new File([csv], "history.csv", { type: "text/csv" })] },
  });
  await screen.findByTestId("csv-import-preview");
}

describe("CSV history window presentation", () => {
  it("warns before import about older observations without filtering or retimestamping them", async () => {
    const confirm = vi.fn().mockResolvedValue({ insertedCount: 9, error: null });
    render(
      <MemoryRouter>
        <EnvironmentCsvImportModal
          open
          onOpenChange={() => {}}
          onConfirm={confirm}
          historyWindow={limited}
        />
      </MemoryRouter>,
    );
    await upload();
    expect(screen.getByTestId("csv-import-history-window")).toHaveTextContent("last 90 days");
    expect(screen.getByTestId("csv-import-outside-window")).toHaveTextContent(
      "1 of 3 observations",
    );
    expect(screen.getByTestId("csv-import-outside-window")).toHaveTextContent("outside");
    fireEvent.click(screen.getByTestId("csv-import-confirm"));
    await screen.findByTestId("csv-import-done");
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0].map((row: { captured_at: string }) => row.captured_at)).toEqual(
      dates,
    );
    expect(screen.getByTestId("csv-import-history-window")).toHaveTextContent("last 90 days");
    expect(screen.getByTestId("csv-import-done")).toHaveTextContent("Imported 9 CSV reading");
  });

  it("does not describe a paid history window as restricted to 90 days", async () => {
    render(
      <MemoryRouter>
        <EnvironmentCsvImportModal
          open
          onOpenChange={() => {}}
          onConfirm={vi.fn()}
          historyWindow={{ status: "ready", days: null }}
        />
      </MemoryRouter>,
    );
    await upload();
    expect(screen.getByTestId("csv-import-history-window")).toHaveTextContent("no plan time limit");
    expect(screen.queryByTestId("csv-import-outside-window")).not.toBeInTheDocument();
  });

  it.each(["loading", "paused", "error", "unknown"] as const)(
    "keeps %s access distinct from a verified Free window",
    async (status) => {
      const retry = vi.fn();
      render(
        <MemoryRouter>
          <EnvironmentCsvImportModal
            open
            onOpenChange={() => {}}
            onConfirm={vi.fn()}
            historyWindow={{ status }}
            onRetryHistoryWindow={retry}
          />
        </MemoryRouter>,
      );
      await upload();
      const note = screen.getByTestId("csv-import-history-window");
      expect(note).not.toHaveTextContent("Your account's sensor history covers the last 90 days");
      expect(note).toHaveTextContent(/checking|connection|couldn't verify/i);
      expect(screen.queryByTestId("csv-import-outside-window")).not.toBeInTheDocument();
      expect(screen.getByTestId("csv-import-confirm")).toBeEnabled();
      if (status === "error" || status === "unknown") {
        fireEvent.click(screen.getByRole("button", { name: "Retry history access" }));
        expect(retry).toHaveBeenCalledTimes(1);
      }
    },
  );

  it("describes an authorized empty read without claiming no imports exist", () => {
    render(
      <MemoryRouter>
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={[]}
          historyWindow={limited}
          queryLimit={200}
        />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("imported-history-empty")).toHaveTextContent(
      "No CSV readings are available for this tent in the current history view",
    );
    expect(screen.getByTestId("imported-history-window")).toHaveTextContent("last 90 days");
    expect(
      screen.queryByText(/No imported CSV sensor history for this tent yet/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ (hidden|older) readings/)).not.toBeInTheDocument();
  });

  it("labels returned readings and the query/table caps without inventing a stored total", () => {
    const readings = [0, 1, 2].map((i) => ({
      tent_id: "tent-A",
      source: "csv",
      metric: "temperature_c",
      value: 25 + i,
      captured_at: dates[2],
    }));
    render(
      <MemoryRouter>
        <ImportedSensorHistoryPanel
          tentId="tent-A"
          readings={readings}
          historyWindow={limited}
          queryLimit={200}
          limit={2}
        />
      </MemoryRouter>,
    );
    const summary = screen.getByTestId("imported-history-summary");
    expect(within(summary).getByText("Available readings")).toBeInTheDocument();
    expect(screen.getByTestId("imported-history-total")).toHaveTextContent("3");
    expect(within(summary).queryByText("Total readings")).not.toBeInTheDocument();
    expect(screen.getByTestId("imported-history-query-limit")).toHaveTextContent("newest 200");
    expect(screen.getByTestId("imported-history-table-limit")).toHaveTextContent(
      "Showing 2 of 3 matching available readings",
    );
    expect(screen.getByTestId("imported-history-source-badge")).toHaveTextContent("CSV");
    expect(screen.getByTestId("imported-history-not-live-badge")).toHaveTextContent(
      "Not live data",
    );
  });
});
