/**
 * Adoption tests for QuickLogSensorSnapshotStrip ↔ the new pure
 * `quickLogSensorSnapshotViewModel`. Verifies that the strip's
 * additive advisory line renders one consistent freshness/empty
 * message derived from the view-model — without altering the existing
 * Quick Log save path or strip status pill behavior.
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

function freshSnapshot(
  partial: Partial<StrictSensorSnapshot> = {},
): StrictSensorSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "snap-1",
    tent_id: "t1",
    captured_at: FIVE_MIN_AGO,
    age_minutes: 5,
    source: "live",
    confidence: 0.9,
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
    ...partial,
  };
}

function stateReady(snap: StrictSensorSnapshot): LatestTentSensorSnapshotState {
  return { status: "ready", snapshot: snap, lastUpdatedAt: NOW.getTime() };
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

describe("QuickLogSensorSnapshotStrip — view-model adoption advisory", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(NOW);
    mockUseLatestTentSensorSnapshot.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fresh live snapshot — no advisory is rendered", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(stateReady(freshSnapshot()));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(
      screen.queryByTestId("quicklog-sensor-snapshot-advisory"),
    ).not.toBeInTheDocument();
  });

  it("fresh manual snapshot — no advisory is rendered", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      stateReady(freshSnapshot({ source: "manual" })),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(
      screen.queryByTestId("quicklog-sensor-snapshot-advisory"),
    ).not.toBeInTheDocument();
  });

  it("fresh csv snapshot — no advisory is rendered", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      stateReady(freshSnapshot({ source: "csv" })),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(
      screen.queryByTestId("quicklog-sensor-snapshot-advisory"),
    ).not.toBeInTheDocument();
  });

  it("stale snapshot — renders stale advisory copy from the view-model", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      stateReady(
        freshSnapshot({
          captured_at: TWO_DAYS_AGO,
          age_minutes: 2880,
          freshness: "stale",
          status: "stale" as SensorSnapshotStatus,
          badge_label: "Stale • as of 48 hr ago • source: live",
        }),
      ),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const advisory = screen.getByTestId("quicklog-sensor-snapshot-advisory");
    expect(advisory).toHaveAttribute("data-advisory-kind", "stale");
    expect(advisory.textContent ?? "").toMatch(/stale/i);
  });

  it("invalid snapshot — renders invalid advisory copy", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      stateReady(
        freshSnapshot({
          freshness: "invalid",
          status: "invalid" as SensorSnapshotStatus,
          badge_label: "Invalid • source: live",
        }),
      ),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const advisory = screen.getByTestId("quicklog-sensor-snapshot-advisory");
    expect(advisory).toHaveAttribute("data-advisory-kind", "invalid");
    expect(advisory.textContent ?? "").toMatch(/invalid/i);
  });

  it("demo snapshot — renders demo advisory and never reads as live/current", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(
      stateReady(freshSnapshot({ source: "demo" })),
    );
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const advisory = screen.getByTestId("quicklog-sensor-snapshot-advisory");
    expect(advisory).toHaveAttribute("data-advisory-kind", "demo");
    expect(advisory.textContent ?? "").toMatch(/demo/i);
    expect(advisory.textContent ?? "").not.toMatch(/\blive\b/i);
  });

  it("missing snapshot (no tent) — renders 'No sensor snapshot available.'", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(stateAs("idle"));
    render(<QuickLogSensorSnapshotStrip tentId={null} />);
    const advisory = screen.getByTestId("quicklog-sensor-snapshot-advisory");
    expect(advisory).toHaveAttribute("data-advisory-kind", "missing");
    expect(advisory).toHaveTextContent("No sensor snapshot available.");
  });

  it("missing snapshot (empty state) — renders 'No sensor snapshot available.'", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(stateAs("empty"));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const advisory = screen.getByTestId("quicklog-sensor-snapshot-advisory");
    expect(advisory).toHaveTextContent("No sensor snapshot available.");
  });

  it("never renders raw payload, secrets, tokens, or private identifiers", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(stateReady(freshSnapshot()));
    const { container } = render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/raw_payload/i);
    expect(text).not.toMatch(/service_role/i);
    expect(text).not.toMatch(/api[_-]?key/i);
    expect(text).not.toMatch(/bridge[_-]?token/i);
    expect(text).not.toMatch(/[0-9a-f]{2}(:[0-9a-f]{2}){5}/i); // MAC
  });
});
