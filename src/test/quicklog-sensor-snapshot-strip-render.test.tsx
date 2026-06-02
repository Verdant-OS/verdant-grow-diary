/**
 * Component render tests for QuickLogSensorSnapshotStrip.
 *
 * Asserts exact rendered copy (title, pill label, description, age,
 * metrics), labels, and navigation action text/href for all four
 * supported states: usable, stale, invalid, no_data.
 *
 * Mocks useLatestSensorSnapshot so these tests are fast, deterministic,
 * and independent of backend state.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import QuickLogSensorSnapshotStrip from "@/components/QuickLogSensorSnapshotStrip";
import type { SensorSnapshot } from "@/lib/sensorSnapshot";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";

const NOW_ISO = "2026-06-02T12:00:00Z";
const FIVE_MIN_AGO = "2026-06-02T11:55:00Z";
const TWO_DAYS_AGO = "2026-05-31T12:00:00Z";

const mockUseLatestSensorSnapshot = vi.fn();

vi.mock("@/hooks/useLatestSensorSnapshot", () => ({
  useLatestSensorSnapshot: (...args: unknown[]) => mockUseLatestSensorSnapshot(...args),
}));

function mockState(partial: Partial<SnapshotState>): SnapshotState {
  return {
    snapshot: null,
    status: "success",
    ...partial,
  } as SnapshotState;
}

function fullSnapshot(partial: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    ts: FIVE_MIN_AGO,
    temp: 24.3,
    rh: 55,
    vpd: 1.12,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    device_id: null,
    ...partial,
  };
}

describe("QuickLogSensorSnapshotStrip render — exact copy, labels, and navigation", () => {
  beforeEach(() => {
    mockUseLatestSensorSnapshot.mockReset();
  });

  it("usable — renders exact title, pill, description, age, metrics, and no action link", () => {
    mockUseLatestSensorSnapshot.mockReturnValue(
      mockState({ snapshot: fullSnapshot(), status: "success" }),
    );
    render(<QuickLogSensorSnapshotStrip growId="g1" tentId="t1" />);

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

  it("stale — renders exact title, pill, description, age, metrics, and refresh action", () => {
    mockUseLatestSensorSnapshot.mockReturnValue(
      mockState({
        snapshot: fullSnapshot({ ts: TWO_DAYS_AGO }),
        status: "success",
      }),
    );
    render(<QuickLogSensorSnapshotStrip growId="g1" tentId="t1" />);

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

  it("invalid — renders exact title, pill, description, age, and review action", () => {
    mockUseLatestSensorSnapshot.mockReturnValue(
      mockState({
        snapshot: fullSnapshot({ source: "sim" }),
        status: "success",
      }),
    );
    render(<QuickLogSensorSnapshotStrip growId="g1" tentId="t1" />);

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toHaveAttribute("data-status", "invalid");

    expect(screen.getByText("Sensor snapshot not trusted")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-pill")).toHaveTextContent("Invalid");
    expect(screen.getByText("This reading will not be treated as reliable context.")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-age")).toHaveTextContent("Captured 5 min ago");

    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("data-action-kind", "review");
    expect(action).toHaveAttribute("href", "/sensors");
    expect(action).toHaveTextContent("Review sensor intake");
  });

  it("no_data — renders exact title, pill, description, and add action when loading", () => {
    mockUseLatestSensorSnapshot.mockReturnValue(
      mockState({ snapshot: null, status: "loading" }),
    );
    render(<QuickLogSensorSnapshotStrip growId="g1" tentId="t1" />);

    const strip = screen.getByTestId("quicklog-sensor-snapshot-strip");
    expect(strip).toHaveAttribute("data-status", "no_data");

    expect(screen.getByText("No sensor snapshot attached")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-pill")).toHaveTextContent("No data");
    expect(screen.getByText("Add a snapshot so this log has room context.")).toBeInTheDocument();

    expect(screen.queryByTestId("quicklog-sensor-snapshot-age")).not.toBeInTheDocument();

    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("data-action-kind", "add");
    expect(action).toHaveAttribute("href", "/sensors");
    expect(action).toHaveTextContent("Add snapshot");
  });

  it("no_data — renders exact copy when there is no tent", () => {
    mockUseLatestSensorSnapshot.mockReturnValue(
      mockState({ snapshot: null, status: "success" }),
    );
    render(<QuickLogSensorSnapshotStrip growId="g1" tentId={null} />);

    expect(screen.getByTestId("quicklog-sensor-snapshot-strip")).toHaveAttribute("data-status", "no_data");
    expect(screen.getByText("No sensor snapshot attached")).toBeInTheDocument();
    expect(screen.getByTestId("quicklog-sensor-snapshot-pill")).toHaveTextContent("No data");

    const action = screen.getByTestId("quicklog-sensor-snapshot-action");
    expect(action).toHaveAttribute("data-action-kind", "add");
    expect(action).toHaveAttribute("href", "/sensors");
    expect(action).toHaveTextContent("Add snapshot");
  });

  it("all non-none actions use href /sensors — never automation endpoints", () => {
    const actionCases = [
      {
        snapshot: fullSnapshot({ ts: TWO_DAYS_AGO }),
        status: "success" as const,
        expectedKind: "refresh",
        expectedLabel: "Refresh snapshot",
      },
      {
        snapshot: fullSnapshot({ source: "sim" }),
        status: "success" as const,
        expectedKind: "review",
        expectedLabel: "Review sensor intake",
      },
      {
        snapshot: null,
        status: "loading" as const,
        expectedKind: "add",
        expectedLabel: "Add snapshot",
      },
    ];

    for (const { snapshot, status, expectedKind, expectedLabel } of actionCases) {
      mockUseLatestSensorSnapshot.mockReturnValue(mockState({ snapshot, status }));
      const { unmount } = render(<QuickLogSensorSnapshotStrip growId="g1" tentId="t1" />);

      const action = screen.getByTestId("quicklog-sensor-snapshot-action");
      expect(action).toHaveAttribute("data-action-kind", expectedKind);
      expect(action).toHaveAttribute("href", "/sensors");
      expect(action).toHaveTextContent(expectedLabel);
      unmount();
    }
  });

  it("usable with partial metrics omits null metrics from the DOM", () => {
    mockUseLatestSensorSnapshot.mockReturnValue(
      mockState({
        snapshot: fullSnapshot({ temp: null, vpd: null }),
        status: "success",
      }),
    );
    render(<QuickLogSensorSnapshotStrip growId="g1" tentId="t1" />);

    expect(screen.getByTestId("quicklog-sensor-snapshot-metric-rh")).toHaveTextContent("RH 55%");
    expect(screen.queryByTestId("quicklog-sensor-snapshot-metric-temp")).not.toBeInTheDocument();
    expect(screen.queryByTestId("quicklog-sensor-snapshot-metric-vpd")).not.toBeInTheDocument();
  });
});
