/**
 * Component render tests for QuickLogSensorSnapshotStrip.
 *
 * Migrated to the realtime-aware tent-scoped hook
 * `useLatestTentSensorSnapshot(tentId)` from `src/lib/sensor.ts`.
 *
 * Asserts rendered copy, pill label, description, age, metrics, and
 * navigation action text/href for all four supported strip states:
 * usable, stale, invalid, no_data — derived strictly from the resolver
 * in `latestSensorSnapshotRules.ts`. Provider source labels such as
 * `ecowitt` must NOT render Live.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";
import type {
  LatestTentSensorSnapshotState,
  LatestTentSensorSnapshotStatus,
} from "@/lib/sensor";

const NOW = new Date("2026-06-02T12:00:00Z");
const FIVE_MIN_AGO = "2026-06-02T11:55:00Z";
const TWO_DAYS_AGO = "2026-05-31T12:00:00Z";

const mockUseLatestTentSensorSnapshot = vi.fn();

vi.mock("@/lib/sensor", async (orig) => {
  const real = await orig<typeof import("@/lib/sensor")>();
  return {
    ...real,
    useLatestTentSensorSnapshot: (...args: unknown[]) =>
      mockUseLatestTentSensorSnapshot(...args),
  };
});

function fullSnapshot(
  partial: Partial<StrictSensorSnapshot> = {},
): StrictSensorSnapshot {
  // 24.3°C → 75.74°F (resolver canonicalizes to °F internally)
  const base: StrictSensorSnapshot = {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "snap-1",
    tent_id: "t1",
    captured_at: FIVE_MIN_AGO,
    age_minutes: 5,
    source: "live",
    confidence: null,
    freshness: "fresh",
    status: "fresh_live",
    badge_label: "Live • as of 5 min ago • source: live",
    metrics: {
      temp_f: 75.74,
      humidity_pct: 55,
      vpd_kpa: 1.12,
      soil_moisture_pct: null,
      co2_ppm: null,
    },
    metricDetails: { ...EMPTY_SENSOR_SNAPSHOT.metricDetails },
    warnings: [],
    usable: true,
  };
  return { ...base, ...partial };
}

function stateReady(
  snapshot: StrictSensorSnapshot,
): LatestTentSensorSnapshotState {
  return { status: "ready", snapshot, lastUpdatedAt: NOW.getTime() };
}

function stateAs(
  status: LatestTentSensorSnapshotStatus,
): LatestTentSensorSnapshotState {
  return {
    status,
    snapshot: { ...EMPTY_SENSOR_SNAPSHOT },
    lastUpdatedAt: null,
  };
}

describe("QuickLogSensorSnapshotStrip render (tent-scoped realtime hook)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(NOW);
    mockUseLatestTentSensorSnapshot.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("usable — fresh_live snapshot renders Usable pill and metric chips", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(stateReady(fullSnapshot()));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toHaveAttribute("data-status", "usable");

    expect(screen.getByText("Sensor context ready")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-pill")).toHaveTextContent("Usable");
    expect(screen.getByText("This log will include current sensor context.")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-age")).toHaveTextContent("Captured 5 min ago");

    expect(screen.getByTestId("quicklog-sensor-snapshot-metric-temp")).toHaveTextContent("Temp 24.3°C");
    expect(screen.getByTestId("quicklog-sensor-snapshot-metric-rh")).toHaveTextContent("RH 55%");
    expect(screen.getByTestId("quicklog-sensor-snapshot-metric-vpd")).toHaveTextContent("VPD 1.12 kPa");

    expect(screen.queryByTestId("quicklog-sensor-snapshot-action")).not.toBeInTheDocument();
  });

  it("usable — provider source (ecowitt) is fresh_non_live but still usable, never Live", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      stateReady(
        fullSnapshot({
          source: "ecowitt",
          status: "fresh_non_live" as SensorSnapshotStatus,
          badge_label: "ecowitt • as of 5 min ago",
        }),
      ),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toHaveAttribute("data-status", "usable");
    expect(screen.getByTestId("quicklog-sensor-snapshot-pill")).toHaveTextContent("Usable");
    // No "Live" wording from the strip itself
    expect(strip).not.toHaveTextContent(/Live/i);
  });

  it("stale — resolver-stale snapshot renders Stale pill + refresh action", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      stateReady(
        fullSnapshot({
          captured_at: TWO_DAYS_AGO,
          age_minutes: 2880,
          freshness: "stale",
          status: "stale" as SensorSnapshotStatus,
          badge_label: "Stale • as of 48 hr ago • source: live",
        }),
      ),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toHaveAttribute("data-status", "stale");
    expect(screen.getByText("Sensor snapshot stale")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-pill")).toHaveTextContent("Stale");
    expect(screen.getByText("Refresh before saving for better AI Doctor context.")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-age")).toHaveTextContent("Captured 2 days ago");

    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("data-action-kind", "refresh");
    expect(action).toHaveAttribute("href", "/sensors");
    expect(action).toHaveTextContent("Refresh snapshot");
  });

  it("invalid — resolver-invalid snapshot renders Invalid pill + review action", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      stateReady(
        fullSnapshot({
          status: "invalid" as SensorSnapshotStatus,
          freshness: "invalid",
          badge_label: "Invalid • source: live",
        }),
      ),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toHaveAttribute("data-status", "invalid");
    expect(screen.getByText("Sensor snapshot not trusted")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-pill")).toHaveTextContent("Invalid");

    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("data-action-kind", "review");
    expect(action).toHaveAttribute("href", "/sensors");
    expect(action).toHaveTextContent("Review sensor intake");
  });

  it("no_data — loading state renders no_data + add action", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(stateAs("loading"));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toHaveAttribute("data-status", "no_data");
    expect(screen.getByText("No sensor snapshot attached")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-pill")).toHaveTextContent("No data");
    expect(screen.queryByTestId("quicklog-sensor-snapshot-age")).not.toBeInTheDocument();

    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("data-action-kind", "add");
    expect(action).toHaveAttribute("href", "/sensors");
    expect(action).toHaveTextContent("Add snapshot");
  });

  it("no_data — empty/error/idle states all render no_data", () => {
    for (const s of ["idle", "empty", "error"] as const) {
      mockUseLatestTentSensorSnapshot.mockReturnValue(stateAs(s));
      const { unmount } = render(<QuickLogSensorSnapshotStrip tentId="t1" />);
      expect(screen.getByTestId("quicklog-sensor-snapshot-strip")).toHaveAttribute(
        "data-status",
        "no_data",
      );
      unmount();
    }
  });

  it("no_data — null tentId renders no_data", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(stateAs("idle"));
    render(<QuickLogSensorSnapshotStrip tentId={null} />);
    expect(screen.getByTestId("quicklog-sensor-snapshot-strip")).toHaveAttribute(
      "data-status",
      "no_data",
    );
    expect(screen.getByText("No sensor snapshot attached")).toBeInTheDocument();
  });

  it("attached=false on usable snapshot suppresses 'will include' copy and action", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(stateReady(fullSnapshot()));
    render(<QuickLogSensorSnapshotStrip tentId="t1" attached={false} />);
    expect(screen.getByText("Sensor snapshot available")).toBeInTheDocument();
    expect(screen.queryByText("This log will include current sensor context.")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quicklog-sensor-snapshot-action")).not.toBeInTheDocument();
  });

  it("does not import the legacy dashboard hook", () => {
    // Static guard: the strip must not pull from the grow+tents[] hook.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const src = require("node:fs").readFileSync(
      require("node:path").resolve(__dirname, "../../src/components/QuickLogSensorSnapshotStrip.tsx"),
      "utf8",
    );
    expect(src).not.toMatch(/@\/hooks\/useLatestSensorSnapshot/);
    expect(src).toMatch(/useLatestTentSensorSnapshot/);
    expect(src).toMatch(/from\s+["']@\/lib\/sensor["']/);
  });
});
