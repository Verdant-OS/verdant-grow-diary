import type { PropsWithChildren } from "react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ from: vi.fn(), auth: vi.fn(), limit: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/store/auth", () => ({ useAuth: () => mocks.auth() }));
vi.mock("@/components/PageHeader", () => ({ default: () => <h1>Pi Ingest Status</h1> }));

import PiIngestStatus from "@/pages/PiIngestStatus";

const clients: QueryClient[] = [];
const row = () => ({
  ts: new Date().toISOString(),
  metric: "temperature_c",
  source: "pi_bridge",
  tent_id: "tent-a",
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  const Wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, ...render(<PiIngestStatus />, { wrapper: Wrapper }) };
}
function expectNoHealth() {
  expect(screen.queryByText("Recently active")).not.toBeInTheDocument();
  expect(screen.queryByText("No data yet")).not.toBeInTheDocument();
  expect(screen.queryByTestId("pi-ingest-count-7d")).not.toBeInTheDocument();
}
beforeEach(() => {
  vi.clearAllMocks();
  onlineManager.setOnline(true);
  mocks.auth.mockReturnValue({ user: { id: "owner-a" } });
  mocks.limit.mockResolvedValue({ data: [row()], error: null });
  mocks.from.mockImplementation((table: string) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: mocks.limit,
      maybeSingle: vi.fn().mockResolvedValue({ data: { name: "Veg tent" }, error: null }),
    };
    if (!["sensor_readings", "tents"].includes(table)) throw new Error("Unexpected read");
    return query;
  });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
});

describe("Pi status required-read truth", () => {
  it("reserves no-data copy for a completed empty array", async () => {
    mocks.limit.mockResolvedValue({ data: [], error: null });
    mount();
    expect(await screen.findByText("No data yet")).toBeInTheDocument();
    expect(screen.getByTestId("pi-ingest-count-7d")).toHaveTextContent("0");
  });
  it.each([null, undefined, {}, [{ ...row(), ts: "invalid" }], [{ ...row(), source: "manual" }]])(
    "rejects unusable receipt %j instead of claiming empty/healthy",
    async (data) => {
      mocks.limit.mockResolvedValue({ data, error: null });
      mount();
      expect(await screen.findByText("Could not load ingest status.")).toBeInTheDocument();
      expectNoHealth();
      expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    },
  );
  it("shows waiting on a first paused read, then resumes on reconnect", async () => {
    onlineManager.setOnline(false);
    mount();
    expect(await screen.findByText(/Waiting for connection/i)).toBeInTheDocument();
    expectNoHealth();
    expect(mocks.from).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    expect(await screen.findByText("Recently active")).toBeInTheDocument();
  });
  it("withholds a cached healthy result after refresh failure and retries both reads", async () => {
    const { client } = mount();
    await screen.findByText("Recently active");
    mocks.limit.mockResolvedValue({ data: null, error: new Error("private backend detail") });
    await act(async () => {
      await client.invalidateQueries();
    });
    await screen.findByText("Could not load ingest status.");
    expectNoHealth();
    expect(screen.queryByText(/private backend detail/)).not.toBeInTheDocument();
    let finish!: (value: unknown) => void;
    mocks.limit.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText(/Loading/);
    expectNoHealth();
    await act(async () => {
      finish({ data: [row()], error: null });
    });
    await screen.findByText("Recently active");
    expect(mocks.from.mock.calls.filter(([table]) => table === "tents")).toHaveLength(2);
  });
  it("withholds cached health during a paused refresh", async () => {
    const { client } = mount();
    await screen.findByText("Recently active");
    act(() => onlineManager.setOnline(false));
    act(() => {
      void client.invalidateQueries();
    });
    await screen.findByText(/Waiting for connection/i);
    expectNoHealth();
    act(() => onlineManager.setOnline(true));
    await screen.findByText("Recently active");
  });
  it("does not request data while signed out", async () => {
    mocks.auth.mockReturnValue({ user: null });
    mount();
    await waitFor(() => expect(screen.getByText(/Loading/)).toBeInTheDocument());
    expect(mocks.from).not.toHaveBeenCalled();
    expectNoHealth();
  });
  it("cannot reuse the prior owner's fresh cache after an identity change", async () => {
    const view = mount();
    await screen.findByText("Veg tent");
    mocks.auth.mockReturnValue({ user: { id: "owner-b" } });
    mocks.limit.mockResolvedValue({ data: [], error: null });
    view.rerender(<PiIngestStatus />);
    await screen.findByText("No data yet");
    expect(screen.queryByText("Veg tent")).not.toBeInTheDocument();
    expect(mocks.limit).toHaveBeenCalledTimes(2);
  });
  it("withholds healthy cached data during a required refresh to empty", async () => {
    const { client } = mount();
    await screen.findByText("Recently active");
    let finish!: (value: unknown) => void;
    mocks.limit.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    act(() => {
      void client.invalidateQueries();
    });
    await screen.findByText(/Loading/);
    expectNoHealth();
    await act(async () => {
      finish({ data: [], error: null });
    });
    await screen.findByText("No data yet");
  });
  it("ignores a late prior-owner receipt after the new owner's completed empty read", async () => {
    let finish!: (value: unknown) => void;
    mocks.limit.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const view = mount();
    await screen.findByText(/Loading/);
    mocks.auth.mockReturnValue({ user: { id: "owner-b" } });
    mocks.limit.mockResolvedValue({ data: [], error: null });
    view.rerender(<PiIngestStatus />);
    await screen.findByText("No data yet");
    await act(async () => {
      finish({ data: [row()], error: null });
    });
    expect(screen.getByText("No data yet")).toBeInTheDocument();
    expect(screen.queryByText("Veg tent")).not.toBeInTheDocument();
  });
  it("falls back to the accepted tent id if its optional name read fails", async () => {
    const original = mocks.from.getMockImplementation()!;
    mocks.from.mockImplementation((table: string) => {
      const query = original(table);
      if (table === "tents")
        query.maybeSingle.mockResolvedValue({ data: null, error: new Error("name unavailable") });
      return query;
    });
    mount();
    await screen.findByText("Recently active");
    expect(screen.getByTestId("pi-ingest-latest-tent")).toHaveTextContent("tent-a");
  });
  it("shows an honest failure for a rejected read without exposing private details", async () => {
    mocks.limit.mockRejectedValue(new Error("private transport failure"));
    mount();
    await screen.findByText("Could not load ingest status.");
    expectNoHealth();
    expect(screen.queryByText(/private transport/)).not.toBeInTheDocument();
  });
  it("preserves the pi-only bounded query", async () => {
    mount();
    await screen.findByText("Veg tent");
    const query = mocks.from.mock.results[0].value;
    expect(query.select).toHaveBeenCalledWith("ts, metric, source, tent_id");
    expect(query.eq).toHaveBeenCalledWith("source", "pi_bridge");
    expect(query.order).toHaveBeenCalledWith("ts", { ascending: false });
    expect(mocks.limit).toHaveBeenCalledWith(500);
  });
});
