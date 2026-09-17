import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";

interface DiaryRow {
  id: string;
  plant_id: string;
  entry_at: string;
  note: string;
  entry_type: string;
  retracted_at?: string | null;
}
interface Request {
  plantId: string;
  count: boolean;
  retracted: boolean;
  cursor: string | null;
  limit: number;
  orders: [string, unknown][];
  signal?: AbortSignal;
}
interface Response {
  data: unknown;
  error: unknown;
  count?: number | null;
}
const fixture = vi.hoisted(() => ({
  owner: "owner-1" as string | null,
  rows: [] as DiaryRow[],
  queries: [] as Request[],
  override: null as null | ((request: Request) => Response | Promise<Response> | undefined),
  writes: vi.fn(),
}));

vi.mock("@/store/auth", () => ({
  useAuth: () => ({ user: fixture.owner ? { id: fixture.owner } : null }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      expect(table).toBe("diary_entries");
      const request: Request = {
        plantId: "",
        count: false,
        retracted: false,
        cursor: null,
        limit: 0,
        orders: [],
      };
      const query = {
        select: (_columns: string, options?: { count?: string }) => {
          request.count = options?.count === "exact";
          return query;
        },
        eq: (column: string, value: string) => {
          expect(column).toBe("plant_id");
          request.plantId = value;
          return query;
        },
        is: (column: string, value: unknown) => {
          expect([column, value]).toEqual(["retracted_at", null]);
          request.retracted = true;
          return query;
        },
        or: (value: string) => {
          request.cursor = value;
          return query;
        },
        order: (column: string, value: unknown) => {
          request.orders.push([column, value]);
          return query;
        },
        limit: (value: number) => {
          request.limit = value;
          return query;
        },
        abortSignal: (signal: AbortSignal) => {
          request.signal = signal;
          return query;
        },
        insert: fixture.writes,
        update: fixture.writes,
        delete: fixture.writes,
        upsert: fixture.writes,
        then: (resolve: (response: Response) => unknown, reject: (reason: unknown) => unknown) => {
          fixture.queries.push(request);
          const custom = fixture.override?.(request);
          if (custom) return Promise.resolve(custom).then(resolve, reject);
          const allRows = fixture.rows.filter(
            (row) => row.plant_id === request.plantId && (!request.retracted || !row.retracted_at),
          );
          let rows = allRows;
          if (request.cursor) {
            const [, timestamp, id] = request.cursor.match(
              /^entry_at\.lt\."([^"]+)",and\(entry_at\.eq\."[^"]+",id\.lt\."([^"]+)"\)$/,
            )!;
            rows = rows.filter(
              (row) => row.entry_at < timestamp || (row.entry_at === timestamp && row.id < id),
            );
          }
          rows = [...rows].sort(
            (a, b) => b.entry_at.localeCompare(a.entry_at) || b.id.localeCompare(a.id),
          );
          return Promise.resolve({
            data: rows.slice(0, request.limit),
            error: null,
            count: request.count ? allRows.length : null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));

import PlantRelativeTimelineSection from "@/components/PlantRelativeTimelineSection";
import {
  fetchPlantRelativeHistoryPage,
  plantRelativeHistoryQueryKey,
} from "@/hooks/usePlantRelativeTimelineHistory";
import { applyQuickLogV2Refresh } from "@/lib/quickLogV2RefreshRules";

const PLANT = "10000000-0000-0000-0000-000000000001";
const OTHER_PLANT = "10000000-0000-0000-0000-000000000002";
const row = (n: number, plant_id = PLANT): DiaryRow => ({
  id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
  plant_id,
  entry_at: "2026-09-16T12:00:00.123456+00:00",
  note: `Saved diary note ${n}`,
  entry_type: "note",
});
const clients: QueryClient[] = [];
function renderHistory(plantId: string | null = PLANT) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const element = (id: string | null) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantRelativeTimelineSection plantId={id} plantStartedAt="2026-06-01T00:00:00Z" />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const rendered = render(element(plantId));
  return { client, rerender: (id: string | null = plantId) => rendered.rerender(element(id)) };
}
const header = () => screen.getByTestId("relative-timeline-header-count");
beforeEach(() => {
  fixture.owner = "owner-1";
  fixture.rows = [];
  fixture.queries = [];
  fixture.override = null;
  fixture.writes.mockReset().mockImplementation(() => {
    throw new Error("Read-only history must not write");
  });
  onlineManager.setOnline(true);
});
afterEach(() => {
  cleanup();
  for (const client of clients.splice(0)) client.clear();
  onlineManager.setOnline(true);
  expect(fixture.writes).not.toHaveBeenCalled();
});

describe("full plant relative history read boundary", () => {
  it("reads 12 stored entries across pages, preserves scope, and uses total only before the cursor", async () => {
    fixture.rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
    fixture.rows.push(row(100, OTHER_PLANT), { ...row(101), retracted_at: "2026-09-16T13:00:00Z" });
    const first = await fetchPlantRelativeHistoryPage(PLANT, null);
    const second = await fetchPlantRelativeHistoryPage(PLANT, first.nextCursor);
    expect(first.totalCount).toBe(12);
    expect(first.rows).toHaveLength(10);
    expect(second.rows).toHaveLength(2);
    expect(second.totalCount).toBeNull();
    expect(second.nextCursor).toBeNull();
    expect(fixture.queries.map((q) => q.count)).toEqual([true, false]);
    expect(fixture.queries[1].cursor).toContain(".123456+00:00");
    expect(fixture.queries[0].orders).toEqual([
      ["entry_at", { ascending: false, nullsFirst: false }],
      ["id", { ascending: false }],
    ]);
  });
  it("retries only the absent retraction-column error, retaining exact count and cursor", async () => {
    fixture.rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
    fixture.override = (request) =>
      request.retracted
        ? {
            data: null,
            error: { code: "42703", message: "column diary_entries.retracted_at does not exist" },
          }
        : undefined;
    const first = await fetchPlantRelativeHistoryPage(PLANT, null);
    const second = await fetchPlantRelativeHistoryPage(PLANT, first.nextCursor);
    expect(first.totalCount).toBe(12);
    expect(second.rows).toHaveLength(2);
    expect(fixture.queries.map((q) => [q.count, q.retracted])).toEqual([
      [true, true],
      [true, false],
      [false, true],
      [false, false],
    ]);
    expect(fixture.queries[2].cursor).toBe(fixture.queries[3].cursor);
  });
  it.each([null, undefined, {}, [null]])(
    "rejects a malformed successful response: %s",
    async (data) => {
      fixture.override = () => ({ data, error: null, count: 0 });
      await expect(fetchPlantRelativeHistoryPage(PLANT, null)).rejects.toThrow(/unavailable/);
      expect(fixture.queries).toHaveLength(1);
    },
  );
  it("rejects an injected cursor before querying", async () => {
    await expect(
      fetchPlantRelativeHistoryPage(PLANT, {
        entryAt: row(1).entry_at,
        id: 'x"),plant_id.eq.other',
      }),
    ).rejects.toThrow(/boundary/);
    expect(fixture.queries).toHaveLength(0);
  });
  it("retains the first page but blocks load-more when the boundary row cannot be paged", async () => {
    const sortedPage = Array.from({ length: 11 }, (_, i) => row(11 - i));
    sortedPage[9] = { ...sortedPage[9], id: "not-a-valid-uuid" };
    fixture.override = () => ({ data: sortedPage, error: null, count: 11 });
    const first = await fetchPlantRelativeHistoryPage(PLANT, null);
    expect(first.rows).toHaveLength(10);
    expect(first.boundaryUnavailable).toBe(true);
    expect(first.nextCursor).toBeNull();
  });
  it("passes cancellation through and preserves the abort classification", async () => {
    const controller = new AbortController();
    fixture.override = () => ({
      data: null,
      error: { code: "ABORT_ERR", message: "The operation was aborted." },
    });
    await expect(
      fetchPlantRelativeHistoryPage(PLANT, null, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(fixture.queries[0].signal).toBe(controller.signal);
  });
});

describe("relative history retrieval through the presenter", () => {
  it("shows the true 12 total, makes all rows reachable, and prints the verified count", async () => {
    fixture.rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
    renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent("Showing 10 of 12 timeline entries"));
    expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(10);
    expect(
      screen.queryByText("Saved diary note 1", {
        selector: '[data-testid="relative-timeline-title"]',
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load older entries" }));
    await waitFor(() => expect(header()).toHaveTextContent(/^12 timeline entries$/));
    expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(12);
    expect(screen.getByTestId("relative-timeline-print-summary")).toHaveTextContent(
      "Visible entries: 12 from 12 loaded diary entries; 12 total.",
    );
    expect(screen.queryByRole("button", { name: "Load older entries" })).not.toBeInTheDocument();
  });
  it("retains every entry beyond the projection's 50-entry preview cap", async () => {
    fixture.rows = Array.from({ length: 61 }, (_, i) => row(i + 1));
    renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent("Showing 10 of 61"));
    for (let loaded = 20; loaded <= 60; loaded += 10) {
      fireEvent.click(screen.getByRole("button", { name: "Load older entries" }));
      await waitFor(() =>
        expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(loaded),
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "Load older entries" }));
    await waitFor(() => expect(header()).toHaveTextContent(/^61 timeline entries$/));
    const ids = screen
      .getAllByTestId("relative-timeline-item")
      .map((node) => node.getAttribute("data-item-id"));
    expect(new Set(ids).size).toBe(61);
    expect(ids).toContain(row(1).id);
    expect(ids).toContain(row(61).id);
  });
  it("reports a backdated insert between pages and refreshes to the new verified total", async () => {
    fixture.rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
    renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent("Showing 10 of 12 timeline entries"));
    fixture.rows.push({ ...row(0), entry_at: "2026-09-15T12:00:00.123456+00:00" });
    fireEvent.click(screen.getByRole("button", { name: "Load older entries" }));
    expect(
      await screen.findByText(
        "Timeline history changed while older entries were loading. Refresh to verify the total.",
      ),
    ).toBeVisible();
    expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(13);
    expect(header()).toHaveTextContent("13 loaded timeline entries · total not verified");
    const requestsBeforeRefresh = fixture.queries.length;
    fireEvent.click(screen.getByRole("button", { name: "Retry timeline history" }));
    await waitFor(() => expect(header()).toHaveTextContent(/^13 timeline entries$/));
    expect(fixture.queries[requestsBeforeRefresh]).toMatchObject({ cursor: null, count: true });
    expect(screen.getByTestId("relative-timeline-print-summary")).toHaveTextContent(
      "Visible entries: 13 from 13 loaded diary entries; 13 total.",
    );
    expect(
      screen.queryByRole("button", { name: "Retry timeline history" }),
    ).not.toBeInTheDocument();
  });
  it("keeps category filters local to loaded history without changing the full total", async () => {
    fixture.rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
    renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent("Showing 10 of 12"));
    fireEvent.click(screen.getByTestId("relative-timeline-filter-watering"));
    expect(header()).toHaveTextContent("Showing 10 of 12");
    expect(screen.getByTestId("relative-timeline-loaded-scope")).toHaveTextContent(
      "10 readable entries loaded so far",
    );
    expect(screen.getByTestId("relative-timeline-print-summary")).toHaveTextContent(
      "Visible entries: 0 from 10 loaded diary entries; 12 total.",
    );
    expect(screen.getByRole("button", { name: "Load older entries" })).toBeEnabled();
  });
  it("does not call a first paused read empty and resumes on reconnect", async () => {
    onlineManager.setOnline(false);
    renderHistory();
    expect(
      await screen.findByText("Waiting for connection to load timeline history."),
    ).toBeVisible();
    expect(screen.queryByTestId("relative-timeline-empty")).not.toBeInTheDocument();
    expect(fixture.queries).toHaveLength(0);
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByTestId("relative-timeline-empty")).toBeVisible();
    expect(header()).toHaveTextContent("0 timeline entries");
  });
  it("shows Retry after the first failed read and only then accepts a successful empty read", async () => {
    fixture.override = () => ({ data: null, error: new Error("read failed") });
    renderHistory();
    const retry = await screen.findByRole("button", { name: "Retry timeline history" });
    expect(screen.queryByTestId("relative-timeline-empty")).not.toBeInTheDocument();
    fixture.override = null;
    fireEvent.click(retry);
    expect(await screen.findByTestId("relative-timeline-empty")).toBeVisible();
  });
  it("retains cached rows after an older-page failure and retries that same boundary", async () => {
    fixture.rows = Array.from({ length: 12 }, (_, i) => row(i + 1));
    fixture.override = (request) =>
      request.cursor ? { data: null, error: new Error("older failed") } : undefined;
    renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent("Showing 10 of 12"));
    fireEvent.click(screen.getByRole("button", { name: "Load older entries" }));
    const retry = await screen.findByRole("button", { name: "Retry timeline history" });
    expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(10);
    expect(header()).toHaveTextContent("12 total at last successful read");
    const boundary = fixture.queries.at(-1)!.cursor;
    fixture.override = null;
    fireEvent.click(retry);
    await waitFor(() => expect(header()).toHaveTextContent(/^12 timeline entries$/));
    expect(fixture.queries.at(-1)!.cursor).toBe(boundary);
  });
  it("retains a cached history with an explicit notice after refresh failure", async () => {
    fixture.rows = [row(1)];
    const { client } = renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent(/^1 timeline entry$/));
    fixture.override = () => ({ data: null, error: new Error("refresh failed") });
    await act(async () => {
      await client.refetchQueries({ queryKey: plantRelativeHistoryQueryKey(PLANT, fixture.owner) });
    });
    expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(1);
    await waitFor(() => expect(header()).toHaveTextContent("1 total at last successful read"));
    expect(screen.getByRole("button", { name: "Retry timeline history" })).toBeEnabled();
  });
  it("keeps totals unknown when the server omits its count", async () => {
    fixture.override = () => ({ data: [row(1)], error: null, count: null });
    renderHistory();
    await waitFor(() =>
      expect(header()).toHaveTextContent("1 loaded timeline entries · total not verified"),
    );
    expect(screen.getByTestId("relative-timeline-print-summary")).toHaveTextContent(
      "total not verified",
    );
  });
  it("offers retry instead of load-more when a legacy boundary cannot be paged safely", async () => {
    const sortedPage = Array.from({ length: 11 }, (_, i) => row(11 - i));
    sortedPage[9] = { ...sortedPage[9], id: "not-a-valid-uuid" };
    fixture.override = () => ({ data: sortedPage, error: null, count: 11 });
    renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent("Showing 10 of 11 timeline entries"));
    expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(10);
    expect(
      screen.getByText(
        "Some older entries could not be reached. Refresh to check the history again.",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry timeline history" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Load older entries" })).not.toBeInTheDocument();
  });
  it("discloses raw rows that cannot be projected instead of shrinking the server total", async () => {
    fixture.override = () => ({ data: [row(1), { ...row(2), id: null }], error: null, count: 2 });
    renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent(/^2 timeline entries$/));
    expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(1);
    expect(screen.getByText("1 loaded diary entry could not be displayed.")).toBeVisible();
    expect(screen.getByTestId("relative-timeline-print-summary")).toHaveTextContent(
      "Visible entries: 1 from 2 loaded diary entries; 2 total.",
    );
  });
  it("shows no history borrowed from the former plant during offline navigation", async () => {
    fixture.rows = [row(1), row(2, OTHER_PLANT)];
    const view = renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent(/^1 timeline entry$/));
    act(() => onlineManager.setOnline(false));
    view.rerender(OTHER_PLANT);
    expect(
      await screen.findByText("Waiting for connection to load timeline history."),
    ).toBeVisible();
    expect(screen.queryByTestId("relative-timeline-item")).not.toBeInTheDocument();
    act(() => onlineManager.setOnline(true));
    await waitFor(() =>
      expect(screen.getByTestId("relative-timeline-item")).toHaveAttribute(
        "data-item-id",
        row(2).id,
      ),
    );
  });
  it("fences cached data by owner and clears it immediately on sign-out", async () => {
    fixture.rows = [row(1)];
    const view = renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent(/^1 timeline entry$/));
    act(() => onlineManager.setOnline(false));
    fixture.owner = "owner-2";
    view.rerender();
    expect(screen.queryByTestId("relative-timeline-item")).not.toBeInTheDocument();
    expect(screen.queryByTestId("relative-timeline-header-count")).not.toBeInTheDocument();
    fixture.owner = null;
    view.rerender();
    expect(screen.queryByTestId("relative-timeline-item")).not.toBeInTheDocument();
    expect(fixture.queries).toHaveLength(1);
  });
  it("rejects a response naming another owner without exposing its diary note", async () => {
    fixture.override = () => ({
      data: [{ ...row(1), user_id: "owner-2", note: "Private other-owner note" }],
      error: null,
      count: 1,
    });
    renderHistory();
    expect(await screen.findByRole("button", { name: "Retry timeline history" })).toBeEnabled();
    expect(screen.queryByText("Private other-owner note")).not.toBeInTheDocument();
    expect(screen.queryByTestId("relative-timeline-empty")).not.toBeInTheDocument();
  });
  it("ignores a former owner's late response after the account changes", async () => {
    let finish!: (response: Response) => void;
    fixture.override = () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      });
    const view = renderHistory();
    await waitFor(() => expect(fixture.queries).toHaveLength(1));
    const formerSignal = fixture.queries[0].signal;
    fixture.owner = "owner-2";
    fixture.override = () => ({ data: [{ ...row(2), user_id: "owner-2" }], error: null, count: 1 });
    view.rerender();
    await waitFor(() =>
      expect(screen.getByTestId("relative-timeline-item")).toHaveAttribute(
        "data-item-id",
        row(2).id,
      ),
    );
    await act(async () => {
      finish({ data: [{ ...row(1), user_id: "owner-1" }], error: null, count: 1 });
    });
    expect(formerSignal?.aborted).toBe(true);
    expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(1);
    expect(screen.getByTestId("relative-timeline-item")).toHaveAttribute("data-item-id", row(2).id);
  });
  it("refreshes the history child after the existing Quick Log success invalidation", async () => {
    fixture.rows = [row(1)];
    const { client } = renderHistory();
    await waitFor(() => expect(header()).toHaveTextContent(/^1 timeline entry$/));
    fixture.rows.push(row(2));
    act(() => {
      applyQuickLogV2Refresh(client, { targetType: "plant", targetId: PLANT, tentId: null });
    });
    await waitFor(() => expect(header()).toHaveTextContent(/^2 timeline entries$/));
    expect(screen.getAllByTestId("relative-timeline-item")).toHaveLength(2);
  });
});
