import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantTentEnvironmentPanel from "@/components/PlantTentEnvironmentPanel";
import PlantStatusStrip from "@/components/PlantStatusStrip";

const io = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      let tentId: string;
      const query = {
        select: () => query,
        eq: (_: string, id: string) => {
          tentId = id;
          return query;
        },
        order: () => query,
        limit: () => io.read(tentId),
      };
      return query;
    },
  },
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
// These unrelated summary reads are isolated; the real environment hook runs.
vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({ openCount: 0, status: "ok" }),
}));
vi.mock("@/hooks/usePlantAssignedTentActions", () => ({
  usePlantAssignedTentActions: () => ({ rows: [], isLoading: false }),
}));

const key = ["plant-tent-environment", "tent-a"];
const clients: QueryClient[] = [];
function rows() {
  const ts = new Date().toISOString();
  return [
    { ts, metric: "temperature_c", value: 24, source: "manual" },
    { ts, metric: "humidity_pct", value: 55, source: "manual" },
    { ts, metric: "vpd_kpa", value: 1.0, source: "manual" },
  ];
}
function mount(cached?: ReturnType<typeof rows>, tentId: string | null = "tent-a") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  clients.push(client);
  if (cached) client.setQueryData(key, cached);
  const page = (assignedTentId: string | null) => (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlantStatusStrip tentId={assignedTentId} growId="grow-a" />
        <PlantTentEnvironmentPanel
          tentId={assignedTentId}
          plantId="plant-a"
          growId="grow-a"
          plantStage="veg"
        />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(page(tentId));
  return { client, changeTent: (id: string) => view.rerender(page(id)) };
}
function panel() {
  return within(screen.getByTestId("plant-tent-environment-panel"));
}
function expectNoFalseEmpty() {
  expect(panel().queryByTestId("plant-tent-environment-empty-no-readings")).toBeNull();
  expect(panel().queryByTestId("plant-tent-environment-recent-empty")).toBeNull();
  expect(screen.queryByTestId("plant-tent-environment-vpd-stage-hint")).toBeNull();
  expect(screen.getByTestId("plant-status-environment")).toHaveAttribute("data-known", "false");
}
beforeEach(() => {
  onlineManager.setOnline(true);
  io.read.mockReset().mockResolvedValue({ data: rows(), error: null });
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((c) => c.clear());
  onlineManager.setOnline(true);
});

describe("Plant environment read honesty", () => {
  it("shows failure instead of empty history and retries both presenters' shared query", async () => {
    io.read.mockResolvedValueOnce({ data: null, error: new Error("private transport detail") });
    mount();
    await waitFor(() =>
      expect(panel().getByRole("status")).toHaveTextContent("Sensor readings unavailable"),
    );
    expectNoFalseEmpty();
    expect(screen.queryByText(/private transport detail/)).toBeNull();
    expect(screen.getByTestId("plant-status-environment")).toHaveTextContent("Unavailable");
    fireEvent.click(panel().getByRole("button", { name: "Retry" }));
    expect(await panel().findByTestId("plant-tent-environment-vpd-stage-hint")).toBeVisible();
    expect(screen.getByTestId("plant-status-environment")).toHaveAttribute("data-known", "true");
    expect(io.read.mock.calls).toEqual([["tent-a"], ["tent-a"]]);
  });
  it("keeps a first paused read unresolved and resumes on reconnect", async () => {
    onlineManager.setOnline(false);
    mount();
    expect(panel().getByRole("status")).toHaveTextContent("Waiting for connection");
    expectNoFalseEmpty();
    expect(io.read).not.toHaveBeenCalled();
    act(() => onlineManager.setOnline(true));
    expect(await panel().findByTestId("plant-tent-environment-vpd-stage-hint")).toBeVisible();
  });
  it("keeps an in-flight first read unresolved", () => {
    io.read.mockReturnValue(new Promise(() => {}));
    mount();
    expect(panel().getByRole("status")).toHaveTextContent("Loading latest readings");
    expectNoFalseEmpty();
  });
  it("retains cached values after refresh failure but suppresses a current stage verdict", async () => {
    io.read.mockResolvedValue({ data: null, error: new Error("refresh failed") });
    mount(rows());
    await waitFor(() =>
      expect(panel().getByRole("status")).toHaveTextContent(
        "Could not refresh sensor readings. Showing cached readings.",
      ),
    );
    expect(panel().getByTestId("plant-tent-environment-metric-temp")).toHaveTextContent("24.0°C");
    expectNoFalseEmpty();
    expect(screen.getByTestId("plant-status-environment")).toHaveTextContent(
      "Unavailable · Cached",
    );
    io.read.mockResolvedValue({ data: rows(), error: null });
    fireEvent.click(panel().getByRole("button", { name: "Retry" }));
    expect(await panel().findByTestId("plant-tent-environment-vpd-stage-hint")).toBeVisible();
    expect(panel().queryByRole("status")).toBeNull();
    expect(screen.getByTestId("plant-status-environment")).toHaveAttribute("data-known", "true");
  });
  it("marks cached values during a paused refresh", () => {
    onlineManager.setOnline(false);
    mount(rows());
    expect(panel().getByRole("status")).toHaveTextContent(
      "Waiting for connection to refresh sensor readings. Showing cached readings.",
    );
    expect(panel().getByTestId("plant-tent-environment-metric-temp")).toHaveTextContent("24.0°C");
    expectNoFalseEmpty();
  });
  it("marks cached values during an active refresh", () => {
    io.read.mockReturnValue(new Promise(() => {}));
    mount(rows());
    expect(panel().getByRole("status")).toHaveTextContent(
      "Refreshing sensor readings. Showing cached readings.",
    );
    expectNoFalseEmpty();
  });
  it.each([null, {}, [null]])("treats invalid result data %j as unavailable", async (data) => {
    io.read.mockResolvedValue({ data, error: null });
    mount();
    await waitFor(() =>
      expect(panel().getByRole("status")).toHaveTextContent("Sensor readings unavailable"),
    );
    expectNoFalseEmpty();
  });
  it("reserves empty history for a completed empty read", async () => {
    io.read.mockResolvedValue({ data: [], error: null });
    mount();
    expect(await panel().findByTestId("plant-tent-environment-empty-no-readings")).toBeVisible();
    expect(panel().getByTestId("plant-tent-environment-recent-empty")).toBeVisible();
    expect(panel().queryByRole("button", { name: "Retry" })).toBeNull();
  });
  it("does not fetch for an unassigned plant", () => {
    mount(undefined, null);
    expect(panel().getByTestId("plant-tent-environment-empty-no-tent")).toBeVisible();
    expect(io.read).not.toHaveBeenCalled();
  });
  it("ignores a late previous-tent response after the active assignment changes", async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveNext!: (value: unknown) => void;
    io.read.mockImplementation(
      (id: string) =>
        new Promise((resolve) => {
          if (id === "tent-a") resolveFirst = resolve;
          else resolveNext = resolve;
        }),
    );
    const { changeTent } = mount();
    changeTent("tent-b");
    await act(async () => resolveFirst({ data: rows(), error: null }));
    expect(panel().getByRole("status")).toHaveTextContent("Loading latest readings");
    expect(panel().queryByTestId("plant-tent-environment-metric-temp")).toBeNull();
    expect(panel().getByRole("link", { name: /View Tent/ })).toHaveAttribute(
      "href",
      "/tents/tent-b",
    );
    const nextRows = rows().map((row) =>
      row.metric === "temperature_c" ? { ...row, value: 22 } : row,
    );
    await act(async () => resolveNext({ data: nextRows, error: null }));
    expect(await panel().findByTestId("plant-tent-environment-metric-temp")).toHaveTextContent(
      "22.0°C",
    );
    expect(io.read.mock.calls).toEqual([["tent-a"], ["tent-b"]]);
  });
});
