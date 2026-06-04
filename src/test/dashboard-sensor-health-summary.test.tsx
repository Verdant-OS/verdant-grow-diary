/**
 * Tests for `DashboardSensorHealthSummary` — read-only presenter.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DashboardSensorHealthSummary from "@/components/DashboardSensorHealthSummary";
import {
  buildDashboardSensorHealthSummary,
} from "@/lib/dashboardSensorHealthViewModel";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";

const NOW = new Date("2026-05-20T12:00:00Z").getTime();

function renderSummary(state: SnapshotState, activeAlertCount = 0) {
  const summary = buildDashboardSensorHealthSummary(state, NOW);
  return render(
    <MemoryRouter>
      <DashboardSensorHealthSummary
        summary={summary}
        activeAlertCount={activeAlertCount}
        growId="grow-1"
      />
    </MemoryRouter>,
  );
}

const fresh = (): SnapshotState => ({
  status: "ok",
  snapshot: {
    ...EMPTY_SNAPSHOT,
    source: "live",
    ts: new Date(NOW - 60_000).toISOString(),
    temp: 24,
    rh: 55,
    vpd: 1.1,
  },
});

describe("DashboardSensorHealthSummary", () => {
  it("renders Sensor Health summary card with status pill", () => {
    renderSummary(fresh());
    expect(
      screen.getByTestId("dashboard-sensor-health-summary"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("sensor-health-status-pill")).toHaveTextContent(
      /Healthy/i,
    );
    expect(screen.getByTestId("sensor-health-source-label")).toHaveTextContent(
      /Live/,
    );
  });

  it("does not render fake values while loading", () => {
    renderSummary({ status: "loading", snapshot: EMPTY_SNAPSHOT });
    const pill = screen.getByTestId("sensor-health-status-pill");
    expect(pill).toHaveAttribute("data-status", "loading");
    const source = screen.getByTestId("sensor-health-source-label");
    expect(source).toHaveTextContent(/—/);
    expect(source).not.toHaveTextContent(/Live/);
  });

  it("never renders missing data as healthy", () => {
    renderSummary({ status: "unavailable", snapshot: EMPTY_SNAPSHOT });
    expect(
      screen.getByTestId("sensor-health-status-pill"),
    ).toHaveAttribute("data-status", "missing");
    expect(
      screen.queryByText(/Healthy/i),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("sensor-health-source-label")).toHaveTextContent(
      /Unknown/,
    );
  });

  it("renders Stale label honestly for old reading even when source==live", () => {
    renderSummary({
      status: "ok",
      snapshot: {
        ...EMPTY_SNAPSHOT,
        source: "live",
        ts: new Date(NOW - 60 * 60_000).toISOString(),
        temp: 24,
        rh: 55,
        vpd: 1.1,
      },
    });
    expect(
      screen.getByTestId("sensor-health-status-pill"),
    ).toHaveAttribute("data-status", "stale");
    expect(screen.getByTestId("sensor-health-source-label")).toHaveTextContent(
      /Stale/,
    );
  });

  it("renders Invalid label for suspicious readings", () => {
    renderSummary({
      status: "ok",
      snapshot: {
        ...EMPTY_SNAPSHOT,
        source: "live",
        ts: new Date(NOW - 60_000).toISOString(),
        temp: 24,
        rh: 100,
        vpd: 1.1,
      },
    });
    expect(
      screen.getByTestId("sensor-health-status-pill"),
    ).toHaveAttribute("data-status", "invalid");
    expect(screen.getByTestId("sensor-health-suspicious")).toHaveTextContent(
      /rh/,
    );
  });

  it("preserves Manual/CSV/Demo source labels (never Live)", () => {
    for (const [source, expected] of [
      ["manual", "Manual"],
      ["diary", "Manual"],
      ["sim", "Demo"],
    ] as const) {
      const { unmount } = renderSummary({
        status: "ok",
        snapshot: {
          ...EMPTY_SNAPSHOT,
          source,
          ts: new Date(NOW - 60_000).toISOString(),
          temp: 24,
          rh: 55,
          vpd: 1.1,
        },
      });
      expect(screen.getByTestId("sensor-health-source-label")).toHaveTextContent(
        new RegExp(expected),
      );
      expect(
        screen.queryByText(/Source: Live/),
      ).not.toBeInTheDocument();
      unmount();
    }
  });

  it("renders Safe by Design read-only note", () => {
    renderSummary(fresh());
    expect(
      screen.getByTestId("sensor-health-safe-by-design"),
    ).toHaveTextContent(/Safe by Design/);
    expect(
      screen.getByTestId("sensor-health-safe-by-design"),
    ).toHaveTextContent(/Read-only/);
  });

  it("shows calm empty-alerts copy with guidance when activeAlertCount=0", () => {
    renderSummary(fresh(), 0);
    const empty = screen.getByTestId("sensor-health-empty-alerts");
    expect(empty).toHaveTextContent("No active alerts right now.");
    expect(empty).toHaveTextContent(/Log a manual reading/);
    expect(empty).toHaveTextContent(/Review sensor setup/);
  });

  it("hides empty-alerts block when there are active alerts", () => {
    renderSummary(fresh(), 3);
    expect(
      screen.queryByTestId("sensor-health-empty-alerts"),
    ).not.toBeInTheDocument();
  });
});
