import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantTentEnvironmentPanel from "@/components/PlantTentEnvironmentPanel";
import PlantStatusStrip from "@/components/PlantStatusStrip";

const NOW = new Date("2026-09-23T12:00:00Z");
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], refetch: vi.fn() }));
vi.mock("@/hooks/usePlantTentLatestReadings", () => ({
  usePlantTentLatestReadings: () => ({
    data: state.rows,
    status: "success",
    fetchStatus: "idle",
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: state.refetch,
  }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/hooks/usePlantAssignedTentAlerts", () => ({
  usePlantAssignedTentAlerts: () => ({ openCount: 0, status: "ok" }),
}));
vi.mock("@/hooks/usePlantAssignedTentActions", () => ({
  usePlantAssignedTentActions: () => ({ rows: [], isLoading: false }),
}));
function rows(source: string, ageMinutes: number) {
  const ts = new Date(NOW.getTime() - ageMinutes * 60_000).toISOString();
  return [
    { metric: "temperature_c", value: 24 },
    { metric: "humidity_pct", value: 55 },
    { metric: "vpd_kpa", value: 1 },
  ].map((row) => ({ ...row, ts, captured_at: ts, source }));
}
function mount() {
  return render(
    <MemoryRouter>
      <PlantStatusStrip tentId="tent-a" growId="grow-a" />
      <PlantTentEnvironmentPanel tentId="tent-a" plantStage="veg" />
    </MemoryRouter>,
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.rows = [];
  state.refetch.mockClear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe("Plant environment ages while open", () => {
  it.each([
    ["live", 14],
    ["manual", 1439],
  ] as const)("ages %s evidence in both presenters and removes stage guidance", (source, age) => {
    state.rows = rows(source, age);
    mount();
    expect(screen.getByTestId("plant-status-environment")).toHaveAttribute("data-stale", "false");
    expect(screen.getByTestId("plant-tent-environment-vpd-stage-hint")).toBeVisible();
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByTestId("plant-status-environment")).toHaveAttribute("data-stale", "true");
    expect(screen.getByTestId("plant-tent-environment-stale")).toBeVisible();
    expect(screen.queryByTestId("plant-tent-environment-vpd-stage-hint")).toBeNull();
    expect(screen.getByTestId("plant-tent-environment-metric-temp")).toHaveTextContent("24.0");
    expect(state.refetch).not.toHaveBeenCalled();
  });
  it("preserves usable manual readings within their longer freshness window", () => {
    state.rows = rows("manual", 20);
    mount();
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByTestId("plant-status-environment")).toHaveAttribute("data-stale", "false");
    expect(screen.getByTestId("plant-tent-environment-vpd-stage-hint")).toBeVisible();
  });
  it("keeps confirmed empty reads empty as time passes", () => {
    mount();
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByTestId("plant-tent-environment-empty-no-readings")).toBeVisible();
    expect(screen.getByTestId("plant-status-environment")).toHaveAttribute("data-known", "false");
  });
});
