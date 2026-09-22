import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, onlineManager, useQuery } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import DailyGrowCheckOnboardingCard from "@/components/DailyGrowCheckOnboardingCard";
import { resetOnboardingDismissals } from "@/lib/dailyGrowCheckOnboardingDismissStore";

type Source = "tents" | "plants" | "sensors" | "diary";
type Read = {
  data: unknown;
  status: "pending" | "error" | "success";
  fetchStatus: "idle" | "fetching" | "paused";
  isPlaceholderData?: boolean;
  error?: Error;
  refetch: ReturnType<typeof vi.fn>;
};
const H = vi.hoisted(() => ({
  reads: {} as Record<Source, Read>,
  hook: (_source: Source): unknown => undefined,
  fetch: vi.fn(),
}));
vi.mock("@/hooks/use-tents", () => ({ useTents: () => H.hook("tents") }));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => H.hook("plants") }));
vi.mock("@/hooks/use-sensor-readings", () => ({ useSensorReadings: () => H.hook("sensors") }));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => H.hook("diary") }));

const SOURCES: Source[] = ["tents", "plants", "sensors", "diary"];
const clients: QueryClient[] = [];
const plantA = "plant-a";
const plantB = "plant-b";
const tentA = "tent-a";
const tentB = "tent-b";
function successful(data: unknown[] = []): Read {
  return { data, status: "success", fetchStatus: "idle", refetch: vi.fn().mockResolvedValue({}) };
}
function readyReads(): Record<Source, Read> {
  const now = new Date().toISOString();
  return {
    tents: successful([{ id: tentA }, { id: tentB }]),
    plants: successful([
      { id: plantA, tent_id: tentA },
      { id: plantB, tent_id: tentB },
    ]),
    sensors: successful([{ id: "manual-a", tent_id: tentA, source: "manual", ts: now }]),
    diary: successful([{ id: "note-a", tent_id: tentA, plant_id: plantA, entry_at: now }]),
  };
}
function useQueryRead(source: Source) {
  return useQuery({
    queryKey: ["setup-proof", source],
    queryFn: () => H.fetch(source),
    staleTime: Infinity,
    retry: false,
  });
}
type Props = React.ComponentProps<typeof DailyGrowCheckOnboardingCard>;
function mount(props: Props = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  clients.push(client);
  function App(next: Props) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <DailyGrowCheckOnboardingCard focusedPlantId={plantA} tentIds={[tentA]} {...next} />
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  const view = render(<App {...props} />);
  return { ...view, client, update: (next: Props) => view.rerender(<App {...next} />) };
}
function noSetupAction() {
  expect(screen.queryByTestId("daily-grow-check-onboarding-cta")).toBeNull();
  expect(screen.queryByRole("link", { name: "Add Tent" })).toBeNull();
}
beforeEach(() => {
  onlineManager.setOnline(true);
  resetOnboardingDismissals();
  H.reads = readyReads();
  H.hook = (source) => H.reads[source];
  H.fetch.mockReset().mockImplementation(async (source: Source) => H.reads[source].data);
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  onlineManager.setOnline(true);
  resetOnboardingDismissals();
});

describe("Daily Grow Check setup read honesty", () => {
  for (const source of SOURCES) {
    it(`does not infer missing setup during the first ${source} read`, () => {
      H.reads[source] = {
        ...successful(),
        data: undefined,
        status: "pending",
        fetchStatus: "fetching",
      };
      mount();
      expect(screen.getByRole("status")).toHaveTextContent("Checking your grow setup");
      noSetupAction();
    });
    it(`shows connection waiting for a paused first ${source} read`, () => {
      H.reads[source] = {
        ...successful(),
        data: undefined,
        status: "pending",
        fetchStatus: "paused",
      };
      mount();
      expect(screen.getByRole("status")).toHaveTextContent("Waiting for a connection");
      expect(screen.getByRole("button", { name: "Retry setup check" })).toBeEnabled();
      noSetupAction();
    });
    it(`keeps an idle unresolved ${source} read out of setup recommendations`, () => {
      H.reads[source] = { ...successful(), data: undefined, status: "pending" };
      mount();
      expect(screen.getByRole("status")).toHaveTextContent("Checking your grow setup");
      noSetupAction();
    });
    it(`reports a failed first ${source} read and retries every contributing source`, async () => {
      H.reads[source] = {
        ...successful(),
        data: undefined,
        status: "error",
        error: new Error("private backend detail"),
      };
      mount();
      expect(screen.getByRole("alert")).toHaveTextContent("Setup guidance unavailable");
      expect(screen.queryByText(/private backend detail/)).toBeNull();
      noSetupAction();
      fireEvent.click(screen.getByRole("button", { name: "Retry setup check" }));
      await waitFor(() =>
        SOURCES.forEach((name) => expect(H.reads[name].refetch).toHaveBeenCalledTimes(1)),
      );
    });
    it(`keeps a cached ${source} error visible even when cached setup looked ready`, () => {
      H.reads[source].status = "error";
      mount({ hideWhenReady: true });
      expect(screen.getByRole("alert")).toHaveTextContent("Setup guidance unavailable");
      expect(
        screen.getByText(/Previously loaded setup information may be out of date/),
      ).toBeVisible();
      noSetupAction();
    });
    it.each([null, {}])(`rejects a malformed successful ${source} payload: %j`, (data) => {
      H.reads[source].data = data;
      mount();
      expect(screen.getByRole("alert")).toHaveTextContent("Setup guidance unavailable");
      noSetupAction();
    });
    it(`does not use placeholder ${source} data as a completed read`, () => {
      H.reads[source].isPlaceholderData = true;
      mount();
      expect(screen.getByRole("status")).toHaveTextContent("Checking your grow setup");
      noSetupAction();
    });
  }

  it("shows a known read failure while another prerequisite is still pending", () => {
    H.reads.tents = { ...successful(), data: undefined, status: "error" };
    H.reads.plants = {
      ...successful(),
      data: undefined,
      status: "pending",
      fetchStatus: "fetching",
    };
    mount();
    expect(screen.getByRole("alert")).toHaveTextContent("Setup guidance unavailable");
    expect(screen.getByRole("button", { name: "Retry setup check" })).toBeDisabled();
    noSetupAction();
  });
  it("does not repeat a stale empty-list recommendation after refresh failure", () => {
    H.reads.tents = { ...successful([]), status: "error" };
    mount();
    expect(screen.getByRole("alert")).toBeVisible();
    noSetupAction();
  });
  it("preserves Add Tent after all reads successfully complete empty", () => {
    SOURCES.forEach((source) => {
      H.reads[source] = successful();
    });
    mount();
    expect(screen.getByRole("link", { name: "Add Tent" })).toHaveAttribute("href", "/tents");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("preserves Add Plant and the selected tent after a successful empty plant read", () => {
    H.reads.plants = successful();
    mount({ focusedTentId: tentB });
    expect(screen.getByRole("link", { name: "Add Plant" })).toHaveAttribute(
      "href",
      `/tents/${tentB}`,
    );
  });
  it("keeps confirmed Add Tent available when later history reads are unresolved", () => {
    H.reads.tents = successful();
    H.reads.plants = { ...successful(), data: {}, status: "success" };
    H.reads.sensors = { ...successful(), data: undefined, status: "error" };
    H.reads.diary = { ...successful(), data: undefined, status: "pending", fetchStatus: "paused" };
    mount();
    expect(screen.getByRole("link", { name: "Add Tent" })).toHaveAttribute("href", "/tents");
  });
  it("keeps confirmed Add Plant available when only history reads fail", () => {
    H.reads.plants = successful();
    H.reads.sensors.status = "error";
    H.reads.diary.status = "error";
    mount({ focusedTentId: tentB });
    expect(screen.getByRole("link", { name: "Add Plant" })).toHaveAttribute(
      "href",
      `/tents/${tentB}`,
    );
  });
  it("keeps a confirmed missing assignment available when history reads fail", () => {
    H.reads.plants = successful([{ id: plantA, tent_id: null }]);
    H.reads.sensors.status = "error";
    H.reads.diary.status = "error";
    mount();
    expect(screen.getByRole("link", { name: "Assign Plant to Tent" })).toHaveAttribute(
      "href",
      `/plants/${plantA}`,
    );
  });
  it("keeps a confirmed missing manual snapshot available when only the diary read fails", () => {
    H.reads.sensors = successful();
    H.reads.diary.status = "error";
    mount();
    expect(screen.getByRole("link", { name: "Add Manual Snapshot" })).toHaveAttribute(
      "href",
      `/tents/${tentA}`,
    );
  });
  it("keeps evidence and snapshot links scoped when switching the focused plant", () => {
    const view = mount({ hideWhenReady: true });
    expect(screen.queryByTestId("daily-grow-check-onboarding-card")).toBeNull();
    view.update({ focusedPlantId: plantB, tentIds: [tentB], hideWhenReady: true });
    expect(screen.getByRole("link", { name: "Add Manual Snapshot" })).toHaveAttribute(
      "href",
      `/tents/${tentB}`,
    );
  });
  it("keeps successful cached setup during a normal background refresh", () => {
    H.reads.tents.fetchStatus = "fetching";
    mount({ hideWhenReady: true });
    expect(screen.queryByTestId("daily-grow-check-onboarding-card")).toBeNull();
  });
  it("preserves dismissal across read recovery and separates plant dismissal scopes", () => {
    H.reads.tents = { ...successful(), data: undefined, status: "error" };
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Hide guidance for this session" }));
    expect(screen.queryByTestId("daily-grow-check-onboarding-card")).toBeNull();
    H.reads = readyReads();
    view.update({});
    expect(screen.queryByTestId("daily-grow-check-onboarding-card")).toBeNull();
    view.update({ focusedPlantId: plantB, tentIds: [tentB] });
    expect(screen.getByRole("link", { name: "Add Manual Snapshot" })).toBeVisible();
  });
  it("settles rejected retry promises without suppressing the other source retries", async () => {
    H.reads.tents.status = "error";
    H.reads.tents.refetch.mockRejectedValue(new Error("retry rejected"));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Retry setup check" }));
    await waitFor(() =>
      SOURCES.forEach((source) => expect(H.reads[source].refetch).toHaveBeenCalledTimes(1)),
    );
  });
});

describe("Daily Grow Check setup with real query transitions", () => {
  it("keeps the first offline read unresolved and recovers automatically on reconnect", async () => {
    H.hook = useQueryRead;
    onlineManager.setOnline(false);
    mount({ hideWhenReady: true });
    expect(screen.getByRole("status")).toHaveTextContent("Waiting for a connection");
    expect(H.fetch).not.toHaveBeenCalled();
    noSetupAction();
    act(() => onlineManager.setOnline(true));
    await waitFor(() =>
      expect(screen.queryByTestId("daily-grow-check-onboarding-card")).toBeNull(),
    );
    SOURCES.forEach((source) =>
      expect(H.fetch.mock.calls.filter(([name]) => name === source)).toHaveLength(1),
    );
  });
  it("shows failed cached reads and recovers through Retry without dropping the cached records", async () => {
    H.hook = useQueryRead;
    const view = mount({ hideWhenReady: true });
    await waitFor(() =>
      expect(screen.queryByTestId("daily-grow-check-onboarding-card")).toBeNull(),
    );
    const cached = view.client.getQueryData(["setup-proof", "tents"]);
    H.fetch.mockImplementation(async (source: Source) => {
      if (source === "tents") throw new Error("unavailable");
      return H.reads[source].data;
    });
    await act(async () => {
      await view.client.refetchQueries({ queryKey: ["setup-proof", "tents"] });
    });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent("Setup guidance unavailable"),
    );
    expect(view.client.getQueryData(["setup-proof", "tents"])).toBe(cached);
    noSetupAction();
    H.fetch.mockClear().mockImplementation(async (source: Source) => H.reads[source].data);
    fireEvent.click(screen.getByRole("button", { name: "Retry setup check" }));
    await waitFor(() =>
      expect(screen.queryByTestId("daily-grow-check-onboarding-card")).toBeNull(),
    );
    SOURCES.forEach((source) =>
      expect(H.fetch.mock.calls.filter(([name]) => name === source)).toHaveLength(1),
    );
    expect(view.client.getQueryData(["setup-proof", "tents"])).toEqual(cached);
  });
});
