/**
 * Quick Log snapshot strip — trust-badge integration tests.
 *
 * Verifies that the strip renders the Live/Stale/Invalid/Manual/Demo/CSV
 * trust badge (from sensorSnapshotTrustBadgeRules) separately from the
 * provider/vendor chip. Vendor identity (e.g. ecowitt, ecowitt_mqtt) must
 * never be promoted to a Live trust state, and stale/invalid/unknown
 * snapshots must never report attachable=true for Live context.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import {
  EMPTY_SENSOR_SNAPSHOT,
  type SensorSnapshot as StrictSensorSnapshot,
  type SensorSnapshotStatus,
} from "@/lib/latestSensorSnapshotRules";
import {
  buildQuickLogStripFromTentState,
} from "@/lib/quickLogSnapshotStripAdapter";
import type { LatestTentSensorSnapshotState } from "@/lib/sensor";

const NOW = new Date("2026-06-02T12:00:00Z");
const FIVE_MIN_AGO = "2026-06-02T11:55:00Z";

const mockHook = vi.fn();
vi.mock("@/lib/sensor", async (orig) => {
  const real = await orig<typeof import("@/lib/sensor")>();
  return { ...real, useLatestTentSensorSnapshot: (...a: unknown[]) => mockHook(...a) };
});

function snap(partial: Partial<StrictSensorSnapshot> = {}): StrictSensorSnapshot {
  return {
    ...EMPTY_SENSOR_SNAPSHOT,
    sensor_snapshot_id: "s1",
    tent_id: "t1",
    captured_at: FIVE_MIN_AGO,
    age_minutes: 5,
    source: "ecowitt",
    confidence: null,
    freshness: "fresh",
    status: "fresh_live" as SensorSnapshotStatus,
    badge_label: "Live • ecowitt",
    metrics: { temp_f: 75.74, humidity_pct: 55, vpd_kpa: 1.12, soil_moisture_pct: null, co2_ppm: null },
    metricDetails: { ...EMPTY_SENSOR_SNAPSHOT.metricDetails },
    warnings: [],
    usable: true,
    ...partial,
  };
}

function ready(s: StrictSensorSnapshot): LatestTentSensorSnapshotState {
  return { status: "ready", snapshot: s, lastUpdatedAt: NOW.getTime() };
}

describe("QuickLogSensorSnapshotStrip — trust badge rendering", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    vi.setSystemTime(NOW);
    mockHook.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  it("fresh Ecowitt → trust badge Live, provider chip Ecowitt separate", () => {
    mockHook.mockReturnValue(ready(snap({ source: "ecowitt", status: "fresh_live" })));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const badge = screen.getByTestId("snapshot-trust-badge");
    expect(badge).toHaveAttribute("data-badge", "live");
    expect(badge).toHaveAttribute("data-attachable", "true");
    expect(screen.getByTestId("snapshot-trust-badge-label")).toHaveTextContent("Live");
    expect(screen.getByTestId("quicklog-sensor-snapshot-source")).toHaveTextContent(/ecowitt/i);
  });

  it("stale Ecowitt → trust badge Stale, not attachable", () => {
    mockHook.mockReturnValue(ready(snap({ source: "ecowitt", status: "stale", freshness: "stale" })));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const badge = screen.getByTestId("snapshot-trust-badge");
    expect(badge).toHaveAttribute("data-badge", "stale");
    expect(badge).toHaveAttribute("data-attachable", "false");
  });

  it("invalid Ecowitt → trust badge Invalid, not attachable", () => {
    mockHook.mockReturnValue(ready(snap({ source: "ecowitt", status: "invalid", freshness: "invalid" })));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const badge = screen.getByTestId("snapshot-trust-badge");
    expect(badge).toHaveAttribute("data-badge", "invalid");
    expect(badge).toHaveAttribute("data-attachable", "false");
  });

  it("manual source → Manual badge", () => {
    mockHook.mockReturnValue(ready(snap({ source: "manual", status: "fresh_non_live" })));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(screen.getByTestId("snapshot-trust-badge")).toHaveAttribute("data-badge", "manual");
  });

  it("demo/sim source → Demo badge, not attachable", () => {
    mockHook.mockReturnValue(ready(snap({ source: "sim", status: "fresh_non_live" })));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    const b = screen.getByTestId("snapshot-trust-badge");
    expect(b).toHaveAttribute("data-badge", "demo");
    expect(b).toHaveAttribute("data-attachable", "false");
  });

  it("csv source → CSV badge", () => {
    mockHook.mockReturnValue(ready(snap({ source: "csv", status: "fresh_non_live" })));
    render(<QuickLogSensorSnapshotStrip tentId="t1" />);
    expect(screen.getByTestId("snapshot-trust-badge")).toHaveAttribute("data-badge", "csv");
  });
});

describe("buildQuickLogStripFromTentState — trust badge gating (no Live for vendor)", () => {
  it("ecowitt_mqtt vendor without fresh_live resolver verdict is NOT Live", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "ecowitt_mqtt", status: "stale", freshness: "stale" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.trustBadge.badge).not.toBe("live");
    expect(v.trustBadge.badge).toBe("stale");
    expect(v.trustBadge.attachable).toBe(false);
  });

  it("unknown vendor source resolved as stale is not attachable", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "wat", status: "stale", freshness: "stale" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.trustBadge.badge).not.toBe("live");
    expect(v.trustBadge.attachable).toBe(false);
  });

  it("empty/no_data trust resolves to invalid (never live)", () => {
    const v = buildQuickLogStripFromTentState({
      status: "empty",
      snapshot: { ...EMPTY_SENSOR_SNAPSHOT },
      hasTent: true,
      now: NOW,
    });
    expect(v.status).toBe("no_data");
    expect(v.trustBadge.badge).not.toBe("live");
    expect(v.trustBadge.attachable).toBe(false);
  });

  it("provider chip and trust badge are separate fields", () => {
    const v = buildQuickLogStripFromTentState({
      status: "ready",
      snapshot: snap({ source: "ecowitt", status: "fresh_live" }),
      hasTent: true,
      now: NOW,
    });
    expect(v.trustBadge.badge).toBe("live");
    expect(v.providerLabel).toBe("EcoWitt");
    expect(v.trustBadge.providerLabel).toBe("EcoWitt");
  });
});
