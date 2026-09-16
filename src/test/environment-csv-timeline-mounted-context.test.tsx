/**
 * environment-csv-timeline-mounted-context.test — verifies the
 * TimelineCsvContextPanel fetches CSV-only sensor_readings, runs the
 * existing view-model, and renders CSV chips scoped to grow + tent.
 */
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import TimelineCsvContextPanel from "@/components/TimelineCsvContextPanel";

const fixtureRows = [
  // tent A, in window of d1
  {
    tent_id: "tA",
    source: "csv",
    metric: "temperature_c",
    value: 25,
    captured_at: "2026-06-01T10:10:00Z",
    raw_payload: { grow_id: "g1", source_tag: "csv" },
  },
  {
    tent_id: "tA",
    source: "csv",
    metric: "humidity_pct",
    value: 55,
    captured_at: "2026-06-01T10:10:00Z",
    raw_payload: { grow_id: "g1", source_tag: "csv" },
  },
  {
    tent_id: "tA",
    source: "csv",
    metric: "vpd_kpa",
    value: 1.42,
    captured_at: "2026-06-01T10:10:00Z",
    raw_payload: { grow_id: "g1", source_tag: "csv" },
  },
  // tent B, also in window of d2 but different tent — must not bleed
  {
    tent_id: "tB",
    source: "csv",
    metric: "temperature_c",
    value: 22,
    captured_at: "2026-06-02T10:10:00Z",
    raw_payload: { grow_id: "g1", source_tag: "csv" },
  },
  // CSV row for an unrelated grow
  {
    tent_id: "tA",
    source: "csv",
    metric: "temperature_c",
    value: 30,
    captured_at: "2026-06-03T10:10:00Z",
    raw_payload: { grow_id: "other-grow", source_tag: "csv" },
  },
];

const readMocks = vi.hoisted(() => ({
  read: vi.fn(),
  queries: [] as Array<{
    table: string;
    sourceFilters: unknown[][];
    tentColumn: string;
    tentIds: string[];
    order: unknown[];
    limit: number;
  }>,
}));

vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query = {
        table,
        sourceFilters: [] as unknown[][],
        tentColumn: "",
        tentIds: [] as string[],
        order: [] as unknown[],
        limit: 0,
      };
      readMocks.queries.push(query);
      const chain = {
        select: () => chain,
        eq: (...args: unknown[]) => {
          query.sourceFilters.push(args);
          return chain;
        },
        in: (column: string, ids: string[]) => {
          query.tentColumn = column;
          query.tentIds = [...ids];
          return chain;
        },
        order: (...args: unknown[]) => {
          query.order = args;
          return chain;
        },
        limit: (limit: number) => {
          query.limit = limit;
          return readMocks.read();
        },
      };
      return chain;
    },
  },
}));

beforeEach(() => {
  readMocks.queries.length = 0;
  readMocks.read.mockReset();
  readMocks.read.mockResolvedValue({ data: fixtureRows, error: null });
});

afterEach(cleanup);

type ReadResult = { data: unknown[] | null; error: unknown };

function deferredRead() {
  let resolve!: (result: ReadResult) => void;
  const promise = new Promise<ReadResult>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function resolveRead(read: ReturnType<typeof deferredRead>, result: ReadResult) {
  await act(async () => {
    read.resolve(result);
    await read.promise;
  });
}

function imported() {
  act(() => {
    window.dispatchEvent(new Event("verdant:csv-imported"));
  });
}

const ENTRIES = [
  { id: "d1", tent_id: "tA", entry_at: "2026-06-01T10:00:00Z" },
  { id: "d2", tent_id: "tB", entry_at: "2026-06-02T10:00:00Z" },
  { id: "d3", tent_id: "tA", entry_at: "2026-07-01T00:00:00Z" }, // far outside window
];

describe("TimelineCsvContextPanel", () => {
  it("renders CSV chip for matched diary entry; says CSV + Derived VPD; never Live (tests 17, 21, 22, 23, 24, 25)", async () => {
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await waitFor(() => {
      expect(screen.queryByTestId("csv-timeline-chip-d1")).toBeTruthy();
    });
    const chip = screen.getByTestId("csv-timeline-chip-d1");
    expect(chip.textContent).toMatch(/CSV environment snapshot/);
    expect(screen.getByTestId("csv-timeline-chip-source-d1").textContent).toBe("CSV");
    expect(chip.textContent).toMatch(/Derived VPD/);
    expect(chip.textContent?.toLowerCase()).not.toMatch(/live/);
  });

  it("does not render a chip for entries outside the time window (test 20)", async () => {
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await waitFor(() => expect(screen.queryByTestId("csv-timeline-chip-d1")).toBeTruthy());
    expect(screen.queryByTestId("csv-timeline-chip-d3")).toBeNull();
  });

  it("does not render a chip when the only CSV match belongs to a different grow (test 19)", async () => {
    readMocks.read.mockResolvedValueOnce({ data: [fixtureRows[4]], error: null });
    render(
      <TimelineCsvContextPanel
        growId="g1"
        entries={[{ id: "d1", tent_id: "tA", entry_at: "2026-06-03T10:00:00Z" }]}
      />,
    );
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(readMocks.read).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("csv-timeline-chip-d1")).toBeNull();
    expect(screen.queryByTestId("timeline-csv-context-panel")).toBeNull();
  });

  it("renders nothing when no CSV rows match (covers tests 18, 19, 20 negative case)", async () => {
    render(
      <TimelineCsvContextPanel
        growId="g1"
        entries={[{ id: "dX", tent_id: "tC", entry_at: "2026-06-01T10:00:00Z" }]}
      />,
    );
    // Allow effect to settle; nothing should render.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("timeline-csv-context-panel")).toBeNull();
  });
});

describe("CSV context read-state honesty", () => {
  it("shows initial loading while the CSV read is pending", () => {
    const read = deferredRead();
    readMocks.read.mockReturnValueOnce(read.promise);
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    expect(screen.getByRole("status").textContent).toMatch(/Loading CSV environment context/);
    expect(screen.queryByRole("button", { name: "Retry CSV context" })).toBeNull();
  });

  it("shows a safe unavailable state and retry for an initial query error", async () => {
    readMocks.read.mockResolvedValueOnce({
      data: null,
      error: { message: "private database diagnostic" },
    });
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /CSV environment context is unavailable/,
      ),
    );
    expect(screen.getByRole("button", { name: "Retry CSV context" })).toBeTruthy();
    expect(document.body.textContent).not.toContain("private database diagnostic");
    expect(screen.queryByTestId("csv-timeline-chip-d1")).toBeNull();
  });

  it("also recovers from a rejected read promise", async () => {
    readMocks.read.mockRejectedValueOnce(new Error("transport diagnostic"));
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/unavailable/));
    expect(document.body.textContent).not.toContain("transport diagnostic");
  });

  it.each([null, undefined, { message: "private response detail" }])(
    "shows unavailable and retry when an initial read returns non-array data: %j",
    async (data) => {
      readMocks.read.mockResolvedValueOnce({ data, error: null });
      render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
      expect((await screen.findByRole("alert")).textContent).toMatch(/is unavailable/);
      expect(screen.getByRole("button", { name: "Retry CSV context" })).toBeTruthy();
      expect(screen.queryByTestId("csv-timeline-chip-d1")).toBeNull();
      expect(document.body.textContent).not.toContain("private response detail");
    },
  );

  it.each([null, undefined, { message: "private response detail" }])(
    "retains cached readings and retries when a refresh returns non-array data: %j",
    async (data) => {
      render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
      await screen.findByTestId("csv-timeline-chip-d1");
      readMocks.read.mockResolvedValueOnce({ data, error: null });
      imported();
      expect((await screen.findByRole("alert")).textContent).toMatch(
        /could not be refreshed.*previously loaded CSV readings/,
      );
      expect(screen.getByTestId("csv-timeline-chip-d1").textContent).toContain("25.0 °C");
      expect(document.body.textContent).not.toContain("private response detail");
      fireEvent.click(screen.getByRole("button", { name: "Retry CSV context" }));
      await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
      expect(readMocks.read).toHaveBeenCalledTimes(3);
      expect(screen.getByTestId("csv-timeline-chip-d1").textContent).toContain("25.0 °C");
    },
  );

  it("retry repeats the same scoped CSV query and restores matching history", async () => {
    readMocks.read.mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    const retry = await screen.findByRole("button", { name: "Retry CSV context" });
    fireEvent.click(retry);
    await waitFor(() => expect(screen.queryByTestId("csv-timeline-chip-d1")).toBeTruthy());
    expect(readMocks.read).toHaveBeenCalledTimes(2);
    expect(readMocks.queries[1]).toEqual(readMocks.queries[0]);
    expect(readMocks.queries[1]).toMatchObject({
      table: "sensor_readings",
      sourceFilters: [["source", "csv"]],
      tentColumn: "tent_id",
      tentIds: ["tA", "tB"],
      limit: 2000,
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows cached history explicitly while refreshing", async () => {
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await screen.findByTestId("csv-timeline-chip-d1");
    const read = deferredRead();
    readMocks.read.mockReturnValueOnce(read.promise);
    imported();
    expect(screen.getByRole("status").textContent).toMatch(
      /Refreshing CSV environment context.*previously loaded CSV readings/,
    );
    expect(screen.getByTestId("csv-timeline-chip-d1")).toBeTruthy();
    await resolveRead(read, { data: fixtureRows, error: null });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("retains cached history with failed-refresh copy and retry", async () => {
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await screen.findByTestId("csv-timeline-chip-d1");
    readMocks.read.mockResolvedValueOnce({ data: null, error: { message: "read failed" } });
    imported();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /could not be refreshed.*previously loaded CSV readings/,
      ),
    );
    expect(screen.getByTestId("csv-timeline-chip-d1").textContent).toContain("25.0 °C");
    fireEvent.click(screen.getByRole("button", { name: "Retry CSV context" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(readMocks.read).toHaveBeenCalledTimes(3);
  });

  it("successful empty retry clears the error and keeps the compact no-match state", async () => {
    readMocks.read.mockResolvedValueOnce({ data: null, error: { message: "failed" } });
    readMocks.read.mockResolvedValueOnce({ data: [], error: null });
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry CSV context" }));
    await waitFor(() => expect(screen.queryByTestId("timeline-csv-context-panel")).toBeNull());
    expect(readMocks.read).toHaveBeenCalledTimes(2);
  });

  it("successful empty refresh replaces cached history before a later failure", async () => {
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await screen.findByTestId("csv-timeline-chip-d1");
    readMocks.read.mockResolvedValueOnce({ data: [], error: null });
    imported();
    await waitFor(() => expect(screen.queryByTestId("timeline-csv-context-panel")).toBeNull());
    readMocks.read.mockResolvedValueOnce({ data: null, error: { message: "failed" } });
    imported();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/is unavailable/));
    expect(screen.getByRole("alert").textContent).not.toMatch(/previously loaded/);
    expect(screen.queryByTestId("csv-timeline-chip-d1")).toBeNull();
  });

  it("a new grow does not display prior cached rows that lack grow metadata", async () => {
    const rows = fixtureRows.map((row) => ({ ...row, raw_payload: { source_tag: "csv" } }));
    readMocks.read.mockResolvedValueOnce({ data: rows, error: null });
    const view = render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await screen.findByTestId("csv-timeline-chip-d1");
    const read = deferredRead();
    readMocks.read.mockReturnValueOnce(read.promise);
    view.rerender(<TimelineCsvContextPanel growId="g2" entries={ENTRIES} />);
    expect(screen.queryByTestId("csv-timeline-chip-d1")).toBeNull();
    expect(screen.getByRole("status").textContent).toMatch(/Loading/);
    await resolveRead(read, { data: null, error: { message: "new grow failed" } });
    expect(screen.getByRole("alert").textContent).toMatch(/is unavailable/);
    expect(screen.queryByTestId("csv-timeline-chip-d1")).toBeNull();
  });

  it("a changed tent set does not reuse previous scope's cached match", async () => {
    const view = render(<TimelineCsvContextPanel growId="g1" entries={[ENTRIES[0]]} />);
    await screen.findByTestId("csv-timeline-chip-d1");
    const read = deferredRead();
    readMocks.read.mockReturnValueOnce(read.promise);
    view.rerender(<TimelineCsvContextPanel growId="g1" entries={[ENTRIES[1]]} />);
    expect(screen.queryByTestId("csv-timeline-chip-d2")).toBeNull();
    await resolveRead(read, { data: [], error: null });
    expect(screen.queryByTestId("timeline-csv-context-panel")).toBeNull();
    expect(readMocks.queries[1].tentIds).toEqual(["tB"]);
  });

  it("ignores a previous grow's late response after switching scope", async () => {
    const oldRead = deferredRead();
    readMocks.read.mockReturnValueOnce(oldRead.promise);
    const view = render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    readMocks.read.mockResolvedValueOnce({ data: [], error: null });
    view.rerender(<TimelineCsvContextPanel growId="g2" entries={ENTRIES} />);
    await waitFor(() => expect(readMocks.read).toHaveBeenCalledTimes(2));
    await resolveRead(oldRead, {
      data: fixtureRows.map((row) => ({ ...row, raw_payload: { source_tag: "csv" } })),
      error: null,
    });
    expect(screen.queryByTestId("timeline-csv-context-panel")).toBeNull();
  });

  it("the latest import refresh wins over an older response", async () => {
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await screen.findByTestId("csv-timeline-chip-d1");
    const older = deferredRead();
    const newer = deferredRead();
    readMocks.read.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    imported();
    imported();
    await resolveRead(newer, {
      data: fixtureRows.map((row) =>
        row.metric === "temperature_c" ? { ...row, value: 31 } : row,
      ),
      error: null,
    });
    await resolveRead(older, { data: fixtureRows, error: null });
    expect(screen.getByTestId("csv-timeline-chip-d1").textContent).toContain("31.0 °C");
  });

  it("an older refresh failure cannot erase newer successful history", async () => {
    render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await screen.findByTestId("csv-timeline-chip-d1");
    const older = deferredRead();
    const newer = deferredRead();
    readMocks.read.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    imported();
    imported();
    await resolveRead(newer, { data: fixtureRows, error: null });
    await resolveRead(older, { data: null, error: { message: "older failure" } });
    expect(screen.getByTestId("csv-timeline-chip-d1")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("reordering the same tent set does not restart the read", async () => {
    const view = render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await screen.findByTestId("csv-timeline-chip-d1");
    view.rerender(
      <TimelineCsvContextPanel growId="g1" entries={[ENTRIES[1], ENTRIES[0], ENTRIES[2]]} />,
    );
    expect(readMocks.read).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not query without a grow or a tent and clears a prior scope", async () => {
    const view = render(<TimelineCsvContextPanel growId={null} entries={ENTRIES} />);
    expect(readMocks.read).not.toHaveBeenCalled();
    view.rerender(<TimelineCsvContextPanel growId="g1" entries={[]} />);
    expect(readMocks.read).not.toHaveBeenCalled();
    view.rerender(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    await screen.findByTestId("csv-timeline-chip-d1");
    view.rerender(<TimelineCsvContextPanel growId={null} entries={ENTRIES} />);
    expect(screen.queryByTestId("timeline-csv-context-panel")).toBeNull();
    imported();
    expect(readMocks.read).toHaveBeenCalledTimes(1);
  });

  it("removes the import listener and ignores completion after unmount", async () => {
    const read = deferredRead();
    readMocks.read.mockReturnValueOnce(read.promise);
    const view = render(<TimelineCsvContextPanel growId="g1" entries={ENTRIES} />);
    view.unmount();
    imported();
    await resolveRead(read, { data: fixtureRows, error: null });
    expect(readMocks.read).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("timeline-csv-context-panel")).toBeNull();
  });
});
