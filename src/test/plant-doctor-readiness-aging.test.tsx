import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "@/lib/react-router-compat";
import PlantDetailAiDoctorReadiness from "@/components/PlantDetailAiDoctorReadiness";

const TENT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-09-23T12:00:00Z");
const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], refetch: vi.fn() }));
vi.mock("@/hooks/usePlantRecentActivity", () => ({
  usePlantRecentActivity: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useSensorBridgeHealth", () => ({
  useSensorBridgeHealth: () => ({ data: null }),
}));
vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadingsByTents: (_ids: string[], _limit: number, sources: string[]) => ({
    byTent: { [TENT]: state.rows.filter((row) => sources.includes(String(row.source))) },
    statusByTent: { [TENT]: "success" },
    refetch: state.refetch,
  }),
}));

function row(source: string, ageMinutes: number) {
  return {
    id: source,
    source,
    metric: "temperature_c",
    value: 24,
    quality: "ok",
    captured_at: new Date(NOW.getTime() - ageMinutes * 60_000).toISOString(),
  };
}
function mount() {
  return render(
    <MemoryRouter>
      <PlantDetailAiDoctorReadiness plantId="plant-a" growId="grow-a" tentId={TENT} stage="veg" />
    </MemoryRouter>,
  );
}
function status() {
  return screen
    .getByTestId("plant-detail-ai-doctor-sensor-evidence-panel")
    .getAttribute("data-status");
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

describe("mounted Doctor readiness aging without new network data", () => {
  it("ages a usable live reading into stale on an idle open card", () => {
    state.rows = [row("live", 14)];
    mount();
    expect(status()).toBe("usable");
    act(() => vi.advanceTimersByTime(120_000));
    expect(status()).toBe("stale");
    expect(screen.getByTestId("plant-detail-ai-doctor-sensor-evidence-panel")).toHaveAttribute(
      "data-counts-as-healthy",
      "false",
    );
    expect(state.refetch).not.toHaveBeenCalled();
  });
  it("ages manual evidence after its own 24 hour window", () => {
    state.rows = [row("manual", 1439)];
    mount();
    expect(status()).toBe("usable");
    act(() => vi.advanceTimersByTime(120_000));
    expect(status()).toBe("stale");
  });
  it("keeps usable manual evidence when live evidence ages out", () => {
    state.rows = [row("live", 14), row("manual", 60)];
    mount();
    act(() => vi.advanceTimersByTime(120_000));
    expect(status()).toBe("usable");
  });
});
