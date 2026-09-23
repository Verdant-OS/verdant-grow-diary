import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import GuidedActionChecklistPanel from "@/components/GuidedActionChecklistPanel";

const state = vi.hoisted(() => ({
  plants: {} as Record<string, unknown>,
  tents: {} as Record<string, unknown>,
  diary: {} as Record<string, unknown>,
  readings: {} as Record<string, unknown>,
  alerts: {} as Record<string, unknown>,
}));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowPlants: () => state.plants,
  useGrowTents: () => state.tents,
}));
vi.mock("@/hooks/use-diary-entries", () => ({ useDiaryEntries: () => state.diary }));
vi.mock("@/hooks/use-sensor-readings", () => ({ useSensorReadings: () => state.readings }));
vi.mock("@/hooks/useAlertsList", () => ({ useAlertsList: () => state.alerts }));
const NOW = Date.parse("2026-09-23T12:00:00Z");
const reading = (source = "live", age = 300_000) => ({
  tent_id: "t1",
  source,
  quality: "ok",
  metric: "temperature",
  value: 25,
  captured_at: new Date(NOW - age).toISOString(),
});
const show = () =>
  render(
    <MemoryRouter>
      <GuidedActionChecklistPanel scopedGrowId="g1" />
    </MemoryRouter>,
  );
const gap = () => screen.queryByTestId("guided-action-checklist-item-sensor:t1");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  for (const key of ["plants", "tents", "diary", "readings"] as const)
    state[key] = { data: [], isLoading: false, refetch: vi.fn().mockResolvedValue({}) };
  state.tents.data = [{ id: "t1", name: "Tent A" }];
  state.alerts = { alerts: [], status: "ok", reload: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("guided checklist evidence honesty", () => {
  it.each([
    { manual_sensor_snapshot: { source: "manual", temp_f: 77, humidity_percent: 55 } },
    { environment_check: { temp_c: 25, humidity_pct: 55 } },
  ])("recognizes scoped manual diary evidence %j", (details) => {
    state.diary.data = [
      {
        id: "d1",
        grow_id: "g1",
        tent_id: "t1",
        entry_at: new Date(NOW - 3_600_000).toISOString(),
        details,
      },
    ];
    show();
    expect(gap()).toBeNull();
  });
  it("keeps manual sensor context for its 24-hour window", () => {
    state.readings.data = [reading("manual", 3_600_000)];
    show();
    expect(gap()).toBeNull();
  });
  it("rejects future live readings", () => {
    state.readings.data = [reading("live", -60_000)];
    show();
    expect(gap()).not.toBeNull();
    expect(screen.getByText(/future/i)).toBeTruthy();
  });
  it("uses observation ts when captured_at is absent", () => {
    state.readings.data = [
      { ...reading(), captured_at: null, ts: new Date(NOW - 60_000).toISOString() },
    ];
    show();
    expect(gap()).toBeNull();
  });
  it("keeps usable manual evidence over a newer stale live candidate", () => {
    state.readings.data = [reading("live", 1_200_000), reading("manual", 3_600_000)];
    show();
    expect(gap()).toBeNull();
  });
  it.each(["plants", "tents", "diary", "readings"] as const)(
    "withholds advice after failed %s read, including cached results",
    (key) => {
      state[key].isError = true;
      show();
      expect(screen.getByText(/could not confirm/i)).toBeTruthy();
      expect(screen.queryByTestId("guided-action-checklist-items")).toBeNull();
      expect(screen.queryByTestId("guided-action-checklist-empty")).toBeNull();
    },
  );
  it("does not build advice while the first read is pending", () => {
    state.diary = { data: undefined, isPending: true, isLoading: true };
    show();
    expect(screen.getByTestId("guided-action-checklist-loading")).toBeTruthy();
    expect(gap()).toBeNull();
  });
  it("withholds cached guidance while a refresh is paused", () => {
    state.readings.fetchStatus = "paused";
    show();
    expect(screen.getByText(/waiting for connection/i)).toBeTruthy();
    expect(gap()).toBeNull();
  });
  it("withholds advice on unavailable alerts and retries all required reads", async () => {
    state.alerts.status = "unavailable";
    show();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    });
    for (const key of ["plants", "tents", "diary", "readings"] as const)
      expect(state[key].refetch).toHaveBeenCalledTimes(1);
    expect(state.alerts.reload).toHaveBeenCalledTimes(1);
    expect(gap()).toBeNull();
  });
  it("expires live evidence on an open tab without a data update", () => {
    state.readings.data = [reading("live", 14 * 60_000)];
    show();
    expect(gap()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(gap()).not.toBeNull();
  });
  it("limits the absence claim to loaded evidence", () => {
    show();
    expect(
      screen.getByText(/No usable sensor or manual reading in the loaded history/),
    ).toBeTruthy();
    expect(screen.queryByText("No sensor reading captured yet.")).toBeNull();
  });
});
