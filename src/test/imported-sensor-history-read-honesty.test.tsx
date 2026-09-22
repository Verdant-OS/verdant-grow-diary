import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";

const response = vi.hoisted(() => ({
  data: [] as unknown,
  error: null as Error | null,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => query,
        limit: async () => ({ data: response.data, error: response.error }),
      };
      return query;
    },
  },
}));
vi.mock("@/store/auth", () => ({ useAuth: () => ({ user: { id: "owner-A" } }) }));
vi.mock("@/lib/funnelAnalytics", () => ({ trackFunnelEvent: vi.fn() }));

import ImportedSensorHistoryPanel from "@/components/ImportedSensorHistoryPanel";
import {
  fetchImportedSensorHistory,
  useImportedSensorHistory,
} from "@/hooks/useImportedSensorHistory";
import { resolveImportedSensorHistoryReadStatus } from "@/lib/importedSensorHistoryViewModel";

const TENT_ID = "11111111-1111-4111-8111-111111111111";
const CSV_ROW = {
  id: "csv-temperature",
  tent_id: TENT_ID,
  source: "csv",
  metric: "temperature_c",
  value: 24.5,
  quality: "ok",
  captured_at: "2026-09-15T12:00:00.000Z",
  ts: "2026-09-15T12:00:00.000Z",
  created_at: "2026-09-15T12:01:00.000Z",
  raw_payload: null,
};
const clients: QueryClient[] = [];

// Keep the hook, read-state resolver and presenter real. Only the external
// response is controlled; this mirrors Tent Detail's current read wiring.
function History() {
  const history = useImportedSensorHistory(TENT_ID);
  return (
    <ImportedSensorHistoryPanel
      tentId={TENT_ID}
      readings={history.data ?? []}
      readStatus={resolveImportedSensorHistoryReadStatus({
        isError: history.isError,
        isFetching: history.isFetching,
        hasRows: (history.data?.length ?? 0) > 0,
      })}
      onRetry={() => void history.refetch()}
    />
  );
}

function renderHistory() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/tents/${TENT_ID}`]}>
        <History />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}

beforeEach(() => {
  response.data = [];
  response.error = null;
});

afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
});

describe("imported CSV history response honesty", () => {
  it.each([
    ["null", null],
    ["missing", undefined],
    ["object", { unavailable: true }],
    ["string", "unavailable"],
    ["number", 42],
  ])("rejects a %s payload instead of accepting history", async (_name, data) => {
    response.data = data;
    await expect(fetchImportedSensorHistory(TENT_ID)).rejects.toThrow(/unavailable/i);
  });

  it("reserves empty history for a successfully returned empty array", async () => {
    renderHistory();
    expect(await screen.findByTestId("imported-history-empty")).toHaveTextContent(
      "No CSV readings are available for this tent in the current history view.",
    );
    expect(screen.queryByTestId("imported-history-error")).not.toBeInTheDocument();
  });

  it("shows unavailable and retries a null first read into labeled CSV history", async () => {
    response.data = null;
    renderHistory();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load imported CSV history",
    );
    expect(screen.queryByTestId("imported-history-empty")).not.toBeInTheDocument();

    response.data = [CSV_ROW];
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("imported-history-total")).toHaveTextContent(/^1$/);
    expect(screen.getByTestId("imported-history-source-badge")).toHaveTextContent("Source: CSV");
    expect(screen.getByTestId("imported-history-not-live-badge")).toHaveTextContent(
      "Not live data",
    );
    expect(screen.getByRole("cell", { name: "24.5" })).toBeInTheDocument();
    expect(screen.queryByTestId("imported-history-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("imported-history-empty")).not.toBeInTheDocument();
  });

  it("does not erase cached CSV rows or claim empty history after a null refetch", async () => {
    response.data = [CSV_ROW];
    const client = renderHistory();
    expect(await screen.findByTestId("imported-history-total")).toHaveTextContent(/^1$/);

    response.data = null;
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["sensor_readings"] });
    });
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("imported-history-summary")).not.toBeInTheDocument();
    expect(client.getQueriesData({ queryKey: ["sensor_readings"] })[0]?.[1]).toEqual([CSV_ROW]);

    response.data = [CSV_ROW];
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("imported-history-total")).toHaveTextContent(/^1$/);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("preserves transport errors even when the response includes an empty array", async () => {
    response.error = new Error("Connection failed");
    renderHistory();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load imported CSV history",
    );
    expect(screen.queryByTestId("imported-history-empty")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
