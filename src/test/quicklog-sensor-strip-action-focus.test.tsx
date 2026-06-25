/**
 * Keyboard / focus tests for QuickLogSensorSnapshotStrip in isolation.
 * Asserts the /sensors action is a real, focusable anchor with visible
 * focus styling.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";
import type { LatestTentSensorSnapshotState } from "@/lib/sensor";

const NOW = new Date("2026-06-08T12:00:00Z");

const mockUseLatestTentSensorSnapshot = vi.fn();
vi.mock("@/lib/sensor", async (orig) => {
  const real = await orig<typeof import("@/lib/sensor")>();
  return {
    ...real,
    useLatestTentSensorSnapshot: (...a: unknown[]) =>
      mockUseLatestTentSensorSnapshot(...a),
  };
});

function staleState(): LatestTentSensorSnapshotState {
  const snap: StrictSensorSnapshot = {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "snap-1",
    tent_id: "t1",
    captured_at: "2026-06-06T12:00:00Z",
    age_minutes: 2880,
    source: "live",
    freshness: "stale",
    status: "stale" as SensorSnapshotStatus,
    badge_label: "Stale",
    metrics: { ...EMPTY_SENSOR_SNAPSHOT.metrics, temp_f: 75 },
    usable: false,
  };
  return { status: "ready", snapshot: snap, lastUpdatedAt: NOW.getTime() };
}

describe("QuickLogSensorSnapshotStrip — keyboard focus", () => {
  beforeEach(() => mockUseLatestTentSensorSnapshot.mockReset());
  afterEach(() => cleanup());

  it("action link is a real <a href='/sensors'> and is focusable", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(staleState());
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const action = screen.getByTestId(
      "quicklog-sensor-snapshot-action",
    ) as HTMLAnchorElement;
    expect(action.tagName).toBe("A");
    expect(action.getAttribute("href")).toBe("/sensors");
    expect(action.tabIndex).not.toBe(-1);
    action.focus();
    expect(document.activeElement).toBe(action);
  });

  it("action link has visible focus styling", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(staleState());
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action.className).toMatch(/focus-visible:ring-2/);
  });

  it("action link has descriptive aria-label", () => {
    mockUseLatestTentSensorSnapshot.mockReturnValue(staleState());
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action.getAttribute("aria-label")).toMatch(
      /opens sensors page/i,
    );
  });
});
