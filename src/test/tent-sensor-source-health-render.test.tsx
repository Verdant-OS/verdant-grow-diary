/**
 * Render tests for TentSensorSourceHealthCard. Presenter-only behavior:
 * empty state, active/stale badge rendering, deterministic ordering.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";

const setReadings = vi.fn();
let mockReadings: unknown[] = [];

vi.mock("@/hooks/use-sensor-readings", () => ({
  useSensorReadings: () => ({ data: mockReadings, isLoading: false, error: null }),
}));

import TentSensorSourceHealthCard from "@/components/TentSensorSourceHealthCard";

function setMockReadings(rows: unknown[]) {
  mockReadings = rows;
  setReadings(rows);
}

const now = Date.now();
const minutesAgo = (m: number) => new Date(now - m * 60_000).toISOString();

describe("<TentSensorSourceHealthCard />", () => {
  it("renders a clear empty state when no readings exist", () => {
    setMockReadings([]);
    render(<TentSensorSourceHealthCard tentId="tent-1" />);
    expect(
      screen.getByTestId("tent-sensor-source-health-empty"),
    ).toHaveTextContent(/no sensor readings received for this tent yet/i);
  });

  it("renders active and stale source badges correctly", () => {
    setMockReadings([
      { source: "esp32_arduino", metric: "temperature_c", captured_at: minutesAgo(2), ts: minutesAgo(2) },
      { source: "old_bridge", metric: "humidity_pct", captured_at: minutesAgo(120), ts: minutesAgo(120) },
    ]);
    render(<TentSensorSourceHealthCard tentId="tent-2" />);

    const rows = screen.getAllByTestId("tent-sensor-source-health-row");
    expect(rows).toHaveLength(2);
    // Deterministic: active first, then stale.
    expect(rows[0].getAttribute("data-source")).toBe("esp32_arduino");
    expect(rows[0].getAttribute("data-status")).toBe("active");
    expect(within(rows[0]).getByText("active")).toBeInTheDocument();

    expect(rows[1].getAttribute("data-source")).toBe("old_bridge");
    expect(rows[1].getAttribute("data-status")).toBe("stale");
    expect(within(rows[1]).getByText("stale")).toBeInTheDocument();
  });
});
