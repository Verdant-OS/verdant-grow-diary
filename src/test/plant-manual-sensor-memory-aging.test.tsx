import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlantManualSensorFreshnessCard from "@/components/PlantManualSensorFreshnessCard";
import type { PlantManualSensorHistory } from "@/hooks/usePlantManualSensorHistory";

const NOW = new Date("2026-09-23T12:00:00Z");
const state = vi.hoisted(() => ({ data: undefined as PlantManualSensorHistory | undefined }));
vi.mock("@/hooks/usePlantManualSensorHistory", () => ({
  usePlantManualSensorHistory: () => ({ data: state.data, isLoading: false }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.data = { temp_f: null, humidity_percent: null, ph: null, ec: null };
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Manual Sensor Memory ages with unchanged history", () => {
  it.each([
    [24, "fresh", "aging"],
    [48, "aging", "stale"],
  ] as const)("crosses the %ih boundary without new query data", (hours, before, after) => {
    state.data!.temp_f = {
      value: 77,
      loggedAt: new Date(NOW.getTime() - hours * 3_600_000 + 60_000).toISOString(),
    };
    const original = state.data;
    const onUpdate = vi.fn();
    render(<PlantManualSensorFreshnessCard plantId="plant-a" onUpdate={onUpdate} />);
    const tile = screen.getByTestId("plant-manual-sensor-freshness-temp_f");
    expect(tile).toHaveAttribute("data-state", before);
    if (before === "fresh") {
      expect(screen.queryByTestId("plant-manual-sensor-freshness-update")).toBeNull();
    }
    act(() => vi.advanceTimersByTime(120_000));
    expect(tile).toHaveAttribute("data-state", after);
    expect(tile).toHaveTextContent("77");
    expect(screen.getByTestId("plant-manual-sensor-freshness-source-badge")).toHaveTextContent(
      "Manual",
    );
    const update = screen.getByTestId("plant-manual-sensor-freshness-update");
    expect(update).toHaveAttribute("data-cta", "update");
    fireEvent.click(update);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(state.data).toBe(original);
  });

  it("keeps missing metrics missing while time advances", () => {
    render(<PlantManualSensorFreshnessCard plantId="plant-a" onUpdate={vi.fn()} />);
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByTestId("plant-manual-sensor-freshness-temp_f")).toHaveAttribute(
      "data-state",
      "missing",
    );
    expect(screen.getByTestId("plant-manual-sensor-freshness-update")).toHaveAttribute(
      "data-cta",
      "add_first",
    );
  });

  it("cleans up its clock when unmounted", () => {
    const timersBefore = vi.getTimerCount();
    const { unmount } = render(<PlantManualSensorFreshnessCard plantId="plant-a" />);
    unmount();
    expect(vi.getTimerCount()).toBe(timersBefore);
  });

  it("does not nag when fresh and missing metrics stay within the fresh window", () => {
    state.data!.temp_f = {
      value: 77,
      loggedAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
    };
    render(<PlantManualSensorFreshnessCard plantId="plant-a" onUpdate={vi.fn()} />);
    const card = screen.getByTestId("plant-manual-sensor-freshness-card");
    expect(card).toHaveAttribute("data-cta", "none");
    expect(screen.queryByTestId("plant-manual-sensor-freshness-update")).toBeNull();
    act(() => vi.advanceTimersByTime(120_000));
    expect(card).toHaveAttribute("data-cta", "none");
    expect(screen.queryByTestId("plant-manual-sensor-freshness-update")).toBeNull();
  });

  it("shows the aging indicator and card CTA when a metric crosses fresh to aging", () => {
    state.data!.temp_f = {
      value: 77,
      loggedAt: new Date(NOW.getTime() - 24 * 3_600_000 + 60_000).toISOString(),
    };
    render(<PlantManualSensorFreshnessCard plantId="plant-a" onUpdate={vi.fn()} />);
    const card = screen.getByTestId("plant-manual-sensor-freshness-card");
    expect(card).toHaveAttribute("data-cta", "none");
    expect(screen.queryByTestId("plant-manual-sensor-freshness-temp_f-indicator")).toBeNull();
    act(() => vi.advanceTimersByTime(120_000));
    expect(card).toHaveAttribute("data-cta", "update");
    expect(screen.getByTestId("plant-manual-sensor-freshness-temp_f-indicator")).toBeVisible();
  });

  it("ages only the metric that crosses a boundary while siblings stay fresh", () => {
    state.data!.temp_f = {
      value: 77,
      loggedAt: new Date(NOW.getTime() - 24 * 3_600_000 + 60_000).toISOString(),
    };
    state.data!.humidity_percent = {
      value: 55,
      loggedAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString(),
    };
    render(<PlantManualSensorFreshnessCard plantId="plant-a" onUpdate={vi.fn()} />);
    expect(screen.getByTestId("plant-manual-sensor-freshness-temp_f")).toHaveAttribute(
      "data-state",
      "fresh",
    );
    expect(screen.getByTestId("plant-manual-sensor-freshness-humidity_percent")).toHaveAttribute(
      "data-state",
      "fresh",
    );
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByTestId("plant-manual-sensor-freshness-temp_f")).toHaveAttribute(
      "data-state",
      "aging",
    );
    expect(screen.getByTestId("plant-manual-sensor-freshness-humidity_percent")).toHaveAttribute(
      "data-state",
      "fresh",
    );
    expect(
      screen.queryByTestId("plant-manual-sensor-freshness-humidity_percent-indicator"),
    ).toBeNull();
  });

  it("refreshes the last-log stamp label while history data stays unchanged", () => {
    state.data!.temp_f = {
      value: 77,
      loggedAt: new Date(NOW.getTime() - 24 * 3_600_000 + 60_000).toISOString(),
    };
    render(<PlantManualSensorFreshnessCard plantId="plant-a" onUpdate={vi.fn()} />);
    const stamp = screen.getByTestId("plant-manual-sensor-freshness-temp_f-last-log");
    expect(stamp.textContent ?? "").toMatch(/^Fresh · Last manual log/i);
    act(() => vi.advanceTimersByTime(120_000));
    expect(stamp.textContent ?? "").toMatch(/^Aging · Last manual log/i);
  });
});
