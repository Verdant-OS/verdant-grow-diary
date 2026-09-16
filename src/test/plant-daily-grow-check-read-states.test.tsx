import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDailyGrowCheckConsistencyCard from "@/components/PlantDailyGrowCheckConsistencyCard";
import PlantDailyGrowCheckHistoryCard from "@/components/PlantDailyGrowCheckHistoryCard";

const H = vi.hoisted(() => ({
  diary: {} as Record<string, unknown>,
  sensors: {} as Record<string, unknown>,
  plants: {} as Record<string, unknown>,
  sensorScope: vi.fn(),
}));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => H.diary }));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: (scope: unknown) => {
    H.sensorScope(scope);
    return H.sensors;
  },
}));
vi.mock("@/hooks/use-plants", () => ({ usePlants: () => H.plants }));

const plantId = "33333333-3333-4333-8333-333333333333";
const tentId = "22222222-2222-4222-8222-222222222222";
const note = () => ({
  id: "note-a",
  plant_id: plantId,
  tent_id: tentId,
  entry_at: new Date().toISOString(),
});
function successful(data: unknown[] = []) {
  return {
    data,
    status: "success",
    isPending: false,
    isLoading: false,
    isError: false,
    isFetching: false,
    fetchStatus: "idle",
    refetch: vi.fn().mockResolvedValue({}),
  };
}
beforeEach(() => {
  H.diary = successful();
  H.sensors = successful();
  H.plants = successful([{ id: plantId, tent_id: tentId }]);
  H.sensorScope.mockClear();
});

for (const [name, Component] of [
  ["consistency", PlantDailyGrowCheckConsistencyCard],
  ["history", PlantDailyGrowCheckHistoryCard],
] as const) {
  describe(`Daily Grow Check ${name} read honesty`, () => {
    const mount = (scope: string | null = tentId) =>
      render(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
        >
          <MemoryRouter>
            <Component plantId={plantId} currentTentId={scope} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    function noSummary() {
      expect(screen.queryByText(/No check activity in the last/)).toBeNull();
      expect(screen.queryByText("Start today's grow check")).toBeNull();
      expect(screen.queryAllByText("Missed")).toHaveLength(0);
      expect(screen.queryByTestId("plant-daily-grow-check-history-rows")).toBeNull();
      expect(screen.queryByTestId("plant-daily-grow-check-method-breakdown")).toBeNull();
    }
    for (const source of ["diary", "sensors", "plants"] as const) {
      it(`keeps the first pending ${source} read unresolved`, () => {
        H[source] = {
          ...successful(),
          data: undefined,
          status: "pending",
          isPending: true,
          isLoading: true,
          isFetching: true,
          fetchStatus: "fetching",
        };
        mount();
        expect(screen.getByRole("status")).toHaveTextContent(/Loading Daily Grow Check/);
        noSummary();
      });
      it(`shows waiting for connection for a paused first ${source} read`, () => {
        H[source] = {
          ...successful(),
          data: undefined,
          status: "pending",
          isPending: true,
          fetchStatus: "paused",
        };
        mount();
        expect(screen.getByRole("status")).toHaveTextContent(/Waiting for connection/);
        noSummary();
      });
      it(`fails closed after ${source} read error and retries all required reads`, async () => {
        H[source] = { ...successful(), data: undefined, status: "error", isError: true };
        mount();
        expect(screen.getByRole("alert")).toHaveTextContent(/Daily Grow Check is unavailable/);
        noSummary();
        fireEvent.click(screen.getByRole("button", { name: "Retry Daily Grow Check" }));
        await waitFor(() => {
          expect(H.diary.refetch).toHaveBeenCalledTimes(1);
          expect(H.sensors.refetch).toHaveBeenCalledTimes(1);
          expect(H.plants.refetch).toHaveBeenCalledTimes(1);
        });
      });
      it(`disables retry and shows progress while ${source} refetch is in flight`, () => {
        H[source] = {
          ...successful(),
          data: undefined,
          status: "error",
          isError: true,
          isFetching: true,
        };
        mount();
        const retry = screen.getByRole("button", { name: "Retry Daily Grow Check" });
        expect(retry).toBeDisabled();
        expect(retry).toHaveTextContent("Retrying…");
      });
      it(`does not turn cached ${source} data into a verified summary after failed refresh`, () => {
        H.diary = successful([note()]);
        H[source] = { ...H[source], status: "error", isError: true };
        mount();
        expect(screen.getByRole("alert")).toHaveTextContent(/Daily Grow Check is unavailable/);
        noSummary();
      });
    }
    it("keeps successful empty-read behavior", () => {
      mount();
      expect(screen.getByText("Start today's grow check")).toBeInTheDocument();
      expect(screen.queryByRole("alert")).toBeNull();
    });
    it("keeps a successfully read note in today's summary", () => {
      H.diary = successful([note()]);
      mount();
      expect(screen.queryByText("Start today's grow check")).toBeNull();
      const id =
        name === "consistency"
          ? "plant-daily-grow-check-today-method"
          : "plant-daily-grow-check-recent-activity-cue";
      expect(screen.getByTestId(id)).toHaveTextContent(
        /checked by|Today has a Daily Grow Check entry/i,
      );
    });
    it("does not require tent reads for an unassigned plant", () => {
      H.diary = successful([note()]);
      H.sensors = { ...successful(), data: undefined, isPending: true, fetchStatus: "idle" };
      H.plants = { ...successful(), data: undefined, isError: true };
      mount(null);
      expect(H.sensorScope).toHaveBeenLastCalledWith(null);
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText("Start today's grow check")).toBeNull();
    });
    it("retries only the diary for an unassigned plant", () => {
      H.diary = { ...successful(), data: undefined, isError: true };
      mount(null);
      fireEvent.click(screen.getByRole("button", { name: "Retry Daily Grow Check" }));
      expect(H.diary.refetch).toHaveBeenCalledTimes(1);
      expect(H.sensors.refetch).not.toHaveBeenCalled();
      expect(H.plants.refetch).not.toHaveBeenCalled();
    });
  });
}
