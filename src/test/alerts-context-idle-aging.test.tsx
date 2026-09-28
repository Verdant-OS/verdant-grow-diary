import type { ReactNode } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SnapshotState } from "@/hooks/useLatestSensorSnapshot";
import { EMPTY_SNAPSHOT } from "@/lib/sensorSnapshot";
import AlertsContextHeaderForGrow from "@/components/AlertsContextHeaderForGrow";
import AlertsEmptyStateSnapshotCta from "@/components/AlertsEmptyStateSnapshotCta";
import { useAlertsPresentationClock } from "@/hooks/useAlertsPresentationClock";

const h = vi.hoisted(() => ({ state: null as SnapshotState | null }));
vi.mock("@/hooks/useGrowData", () => ({
  useGrowTents: () => ({ data: [{ id: "tent-a", stage: "veg" }] }),
}));
vi.mock("@/hooks/useLatestSensorSnapshot", () => ({ useLatestSensorSnapshot: () => h.state }));
vi.mock("@/hooks/useGrowTargets", () => ({
  useGrowTargets: () => ({ status: "idle", targets: null }),
}));
vi.mock("@/hooks/useTemperatureUnitPreference", () => ({
  useTemperatureUnitPreference: () => "celsius",
}));
vi.mock("@/components/GrowTargetsEditor", () => ({ default: () => null }));
vi.mock("@/lib/react-router-compat", () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-23T12:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function SharedAlerts({ showEmptyState = true }: { showEmptyState?: boolean }) {
  const clock = useAlertsPresentationClock();
  return (
    <>
      <AlertsContextHeaderForGrow growId="grow-a" growName="Grow A" stage="veg" clock={clock} />
      {showEmptyState ? <AlertsEmptyStateSnapshotCta growId="grow-a" clock={clock} /> : null}
    </>
  );
}

describe("Alerts presentation ages without a new query result", () => {
  it.each(["live", "manual"] as const)(
    "does not label a newly arrived %s observation future-dated between ticks",
    (source) => {
      h.state = { status: "ok", snapshot: EMPTY_SNAPSHOT };
      const view = render(
        <AlertsContextHeaderForGrow growId="grow-a" growName="Grow A" stage="veg" />,
      );
      act(() => vi.advanceTimersByTime(20_000));
      h.state = {
        status: "ok",
        snapshot: {
          ...EMPTY_SNAPSHOT,
          source,
          ts: new Date(Date.now()).toISOString(),
          tent_id: "tent-a",
          temp: 24,
          rh: 55,
        },
      };
      view.rerender(<AlertsContextHeaderForGrow growId="grow-a" growName="Grow A" stage="veg" />);
      expect(screen.getByTestId("alerts-context-header-latest-detail")).not.toHaveTextContent(
        /captured in/i,
      );
      expect(screen.getByTestId("alerts-context-header-source-chip")).toHaveAttribute(
        "data-can-persist",
        "true",
      );
    },
  );
  it("keeps genuinely future-dated evidence ineligible", () => {
    h.state = {
      status: "ok",
      snapshot: { ...EMPTY_SNAPSHOT, source: "live", ts: "2026-09-23T12:01:00Z", temp: 24 },
    };
    render(<SharedAlerts />);
    expect(screen.getByTestId("alerts-context-header-latest-detail")).toHaveTextContent(
      /captured in/i,
    );
    expect(screen.getByTestId("alerts-context-header-source-chip")).toHaveAttribute(
      "data-can-persist",
      "false",
    );
  });
  it("shares one timer and expires both surfaces together after delayed empty-state mount", () => {
    h.state = {
      status: "ok",
      snapshot: {
        ...EMPTY_SNAPSHOT,
        source: "manual",
        ts: "2026-09-23T11:45:45Z",
        temp: 24,
        rh: 55,
      },
    };
    const view = render(<SharedAlerts showEmptyState={false} />);
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(30_000));
    view.rerender(<SharedAlerts />);
    expect(vi.getTimerCount()).toBe(1);
    expect(screen.queryByTestId("alerts-empty-state-snapshot-cta")).toBeNull();
    act(() => vi.advanceTimersByTime(30_000));
    expect(screen.getByTestId("alerts-context-header-source-chip")).toHaveAttribute(
      "data-can-persist",
      "false",
    );
    expect(screen.getByTestId("alerts-empty-state-snapshot-cta")).toHaveAttribute(
      "data-kind",
      "stale",
    );
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("refreshes both surfaces for new evidence and continues idle expiry on the same timer", () => {
    h.state = { status: "ok", snapshot: EMPTY_SNAPSHOT };
    const view = render(<SharedAlerts />);
    act(() => vi.advanceTimersByTime(20_000));
    h.state = {
      status: "ok",
      snapshot: {
        ...EMPTY_SNAPSHOT,
        source: "manual",
        ts: new Date(Date.now()).toISOString(),
        temp: 24,
        rh: 55,
      },
    };
    view.rerender(<SharedAlerts />);
    expect(screen.getByTestId("alerts-context-header-source-chip")).toHaveAttribute(
      "data-can-persist",
      "true",
    );
    expect(screen.queryByTestId("alerts-empty-state-snapshot-cta")).toBeNull();
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(960_000));
    expect(screen.getByTestId("alerts-context-header-source-chip")).toHaveAttribute(
      "data-can-persist",
      "false",
    );
    expect(screen.getByTestId("alerts-empty-state-snapshot-cta")).toHaveAttribute(
      "data-kind",
      "stale",
    );
  });
  it.each(["live", "manual"] as const)(
    "withdraws %s persistence guidance after the alert window expires",
    (source) => {
      h.state = {
        status: "ok",
        snapshot: {
          ...EMPTY_SNAPSHOT,
          source,
          ts: "2026-09-23T11:46:00Z",
          tent_id: "tent-a",
          temp: 24,
          rh: 55,
          vpd: 1.1,
        },
      };
      render(
        <>
          <AlertsContextHeaderForGrow growId="grow-a" growName="Grow A" stage="veg" />
          <AlertsEmptyStateSnapshotCta growId="grow-a" />
        </>,
      );
      expect(screen.getByTestId("alerts-context-header-source-chip")).toHaveAttribute(
        "data-can-persist",
        "true",
      );
      expect(screen.queryByTestId("alerts-empty-state-snapshot-cta")).toBeNull();

      act(() => vi.advanceTimersByTime(120_000));

      expect(screen.getByTestId("alerts-context-header-source-chip")).toHaveAttribute(
        "data-can-persist",
        "false",
      );
      expect(screen.getByTestId("alerts-context-header-freshness-window")).toHaveTextContent(
        /will not persist/i,
      );
      expect(screen.getByTestId("alerts-context-header-latest-detail")).toHaveAttribute(
        "data-can-persist",
        "false",
      );
      expect(screen.getByTestId("alerts-empty-state-snapshot-cta")).toHaveAttribute(
        "data-kind",
        "stale",
      );
      expect(screen.getByTestId("alerts-empty-state-snapshot-cta")).toHaveTextContent(
        /outside the 15-minute alert window/i,
      );
      expect(screen.getByTestId("alerts-context-header-source-chip")).toHaveTextContent(
        source === "live" ? /live/i : /manual/i,
      );
    },
  );
});
