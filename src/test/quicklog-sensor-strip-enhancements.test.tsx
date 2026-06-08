/**
 * Render tests for the Quick Log sensor strip enhancements:
 *  - Provider source label chip (non-Live)
 *  - ARIA attributes on pill + action
 *
 * The mini-chart lives in `QuickLog.tsx` (not the strip), so it's
 * covered by its own pure-helper test file.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";
import type { LatestTentSensorSnapshotState } from "@/lib/sensor";

const NOW = new Date("2026-06-08T12:00:00Z");
const FIVE_MIN_AGO = "2026-06-08T11:55:00Z";

const mockUseLatestTentSensorSnapshot = vi.fn();
const mockUseRecentTentSensorSeries = vi.fn();

vi.mock("@/lib/sensor", async (orig) => {
  const real = await orig<typeof import("@/lib/sensor")>();
  return {
    ...real,
    useLatestTentSensorSnapshot: (...a: unknown[]) =>
      mockUseLatestTentSensorSnapshot(...a),
  };
});


function ready(partial: Partial<StrictSensorSnapshot> = {}): LatestTentSensorSnapshotState {
  const snap: StrictSensorSnapshot = {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "snap-1",
    tent_id: "t1",
    captured_at: FIVE_MIN_AGO,
    age_minutes: 5,
    source: "live",
    freshness: "fresh",
    status: "fresh_live",
    badge_label: "Live • 5 min ago",
    metrics: {
      temp_f: 75.74,
      humidity_pct: 55,
      vpd_kpa: 1.12,
      soil_moisture_pct: null,
      co2_ppm: null,
    },
    usable: true,
    ...partial,
  };
  return { status: "ready", snapshot: snap, lastUpdatedAt: NOW.getTime() };
}

describe("QuickLogSensorSnapshotStrip — provider label, ARIA, mini-chart", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(NOW);
    mockUseLatestTentSensorSnapshot.mockReset();
    mockUseRecentTentSensorSeries.mockReset();
    // Default: no chart data.
    mockUseRecentTentSensorSeries.mockReturnValue({ status: "empty", rows: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders provider chip for non-Live source (ecowitt)", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      ready({
        source: "ecowitt",
        status: "fresh_non_live" as SensorSnapshotStatus,
        badge_label: "ecowitt • 5 min ago",
      }),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const src = screen.getByTestId("quicklog-sensor-snapshot-source");
    expect(src).toHaveTextContent("ecowitt");
    expect(src).toHaveAttribute("aria-label", "Sensor source: ecowitt");
    // Pill is still Usable, never Live.
    expect(screen.getByTestId("quicklog-sensor-snapshot-pill")).toHaveTextContent("Usable");
  });

  it("normalizes underscore source labels (home_assistant → home assistant)", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      ready({
        source: "home_assistant",
        status: "fresh_non_live" as SensorSnapshotStatus,
      }),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(screen.getByTestId("quicklog-sensor-snapshot-source")).toHaveTextContent(
      "home assistant",
    );
  });

  it("hides provider chip when source is 'live'", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(ready({ source: "live" }));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(screen.queryByTestId("quicklog-sensor-snapshot-source")).not.toBeInTheDocument();
  });

  it("hides provider chip on no_data state", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue({
      status: "empty",
      snapshot: { ...EMPTY_SENSOR_SNAPSHOT },
      lastUpdatedAt: null,
    });
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(screen.queryByTestId("quicklog-sensor-snapshot-source")).not.toBeInTheDocument();
  });

  it("applies ARIA role and focus-visible classes to action link", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      ready({
        status: "stale" as SensorSnapshotStatus,
        freshness: "stale",
        captured_at: "2026-06-06T12:00:00Z",
        age_minutes: 2880,
        source: "live",
      }),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("aria-label", "Refresh snapshot — opens sensors page");
    expect(action.className).toMatch(/focus-visible:ring-2/);
    const pill = screen.getByTestId("quicklog-sensor-snapshot-pill");
    expect(pill).toHaveAttribute("role", "status");
    expect(pill).toHaveAttribute("aria-label", "Sensor snapshot status: stale");
  });

  it("renders mini-chart when ready snapshot + ≥2 series points", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(ready());
    mockUseRecentTentSensorSeries.mockReturnValue({
      status: "ready",
      rows: [
        { metric: "temperature_c", value: 24, captured_at: "2026-06-08T11:00:00Z" },
        { metric: "temperature_c", value: 25, captured_at: "2026-06-08T11:30:00Z" },
        { metric: "temperature_c", value: 23, captured_at: "2026-06-08T11:55:00Z" },
      ],
    });
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const chart = screen.getByTestId("quicklog-sensor-mini-chart");
    expect(chart).toHaveAttribute("data-metric", "temp_c");
    expect(chart).toHaveAttribute("data-points", "3");
  });

  it("does not render mini-chart on no_data status", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue({
      status: "empty",
      snapshot: { ...EMPTY_SENSOR_SNAPSHOT },
      lastUpdatedAt: null,
    });
    mockUseRecentTentSensorSeries.mockReturnValue({
      status: "ready",
      rows: [
        { metric: "temperature_c", value: 24, captured_at: "2026-06-08T11:00:00Z" },
        { metric: "temperature_c", value: 25, captured_at: "2026-06-08T11:30:00Z" },
      ],
    });
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(screen.queryByTestId("quicklog-sensor-mini-chart")).not.toBeInTheDocument();
  });

  it("does not render mini-chart with <2 series points", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(ready());
    mockUseRecentTentSensorSeries.mockReturnValue({
      status: "ready",
      rows: [
        { metric: "temperature_c", value: 24, captured_at: "2026-06-08T11:00:00Z" },
      ],
    });
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(screen.queryByTestId("quicklog-sensor-mini-chart")).not.toBeInTheDocument();
  });
});
