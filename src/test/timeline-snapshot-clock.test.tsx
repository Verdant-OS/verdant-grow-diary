import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TimelineSnapshotClock from "@/components/TimelineSnapshotClock";
import { classifyVpdAgainstStage } from "@/lib/vpdStageTargetRules";
import { LIVE_CURRENT_STATE_STALE_MS } from "@/lib/sensorTruthCanon";

const NOW = new Date("2026-09-23T12:00:00Z");

describe("Timeline snapshot clock isolation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("ages stage guidance without rerendering its parent or losing historical values", () => {
    const parentRendered = vi.fn();
    const capturedAt = NOW.getTime() - LIVE_CURRENT_STATE_STALE_MS + 60_000;
    function Parent() {
      parentRendered();
      return (
        <TimelineSnapshotClock changesAt={capturedAt + LIVE_CURRENT_STATE_STALE_MS}>
          {(nowMs) => (
            <div>
              <span>VPD 1.1 — Source: manual</span>
              <span>
                {
                  classifyVpdAgainstStage({
                    value: 1.1,
                    stage: "veg",
                    stale: nowMs - capturedAt > LIVE_CURRENT_STATE_STALE_MS,
                  }).label
                }
              </span>
            </div>
          )}
        </TimelineSnapshotClock>
      );
    }
    render(<Parent />);
    expect(screen.getByText("In Veg VPD range")).toBeInTheDocument();
    const parentCount = parentRendered.mock.calls.length;
    act(() => vi.advanceTimersByTime(120_000));
    expect(screen.getByText("In Veg VPD range (historical, stale reading)")).toBeInTheDocument();
    expect(screen.getByText("VPD 1.1 — Source: manual")).toBeInTheDocument();
    expect(parentRendered).toHaveBeenCalledTimes(parentCount);
  });

  it("cleans up the timer on unmount", () => {
    const renderSnapshot = vi.fn(() => <span>Snapshot</span>);
    const view = render(
      <TimelineSnapshotClock changesAt={NOW.getTime() + 60_000}>
        {renderSnapshot}
      </TimelineSnapshotClock>,
    );
    view.unmount();
    const count = renderSnapshot.mock.calls.length;
    act(() => vi.advanceTimersByTime(120_000));
    expect(renderSnapshot).toHaveBeenCalledTimes(count);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses the current clock when a new row mounts after being absent", () => {
    const view = render(<div />);
    act(() => vi.advanceTimersByTime(120_000));
    view.rerender(
      <TimelineSnapshotClock changesAt={null}>
        {(nowMs) => <output>{nowMs}</output>}
      </TimelineSnapshotClock>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(String(NOW.getTime() + 120_000));
  });

  it("re-renders once just past the boundary and then holds no timer", () => {
    const renderSnapshot = vi.fn((nowMs: number) => <output>{nowMs}</output>);
    const changesAt = NOW.getTime() + 60_000;
    render(<TimelineSnapshotClock changesAt={changesAt}>{renderSnapshot}</TimelineSnapshotClock>);
    expect(vi.getTimerCount()).toBe(1);
    const mounted = renderSnapshot.mock.calls.length;

    act(() => vi.advanceTimersByTime(60_001));
    expect(renderSnapshot).toHaveBeenCalledTimes(mounted + 1);
    expect(Number(screen.getByRole("status").textContent)).toBeGreaterThan(changesAt);
    expect(vi.getTimerCount()).toBe(0);

    act(() => vi.advanceTimersByTime(60 * 60_000));
    expect(renderSnapshot).toHaveBeenCalledTimes(mounted + 1);
  });

  it("never arms a timer for a row already past its boundary or without one", () => {
    const renderSnapshot = vi.fn(() => <span>Historical</span>);
    for (const changesAt of [NOW.getTime() - 1, null, Number.NaN]) {
      const view = render(
        <TimelineSnapshotClock changesAt={changesAt}>{renderSnapshot}</TimelineSnapshotClock>,
      );
      expect(vi.getTimerCount()).toBe(0);
      view.unmount();
    }
  });

  it("does not spin on a boundary beyond the longest browser timeout", () => {
    const renderSnapshot = vi.fn(() => <span>Future-dated</span>);
    render(
      <TimelineSnapshotClock changesAt={NOW.getTime() + 400 * 24 * 60 * 60_000}>
        {renderSnapshot}
      </TimelineSnapshotClock>,
    );
    const mounted = renderSnapshot.mock.calls.length;
    act(() => vi.advanceTimersByTime(1_000));
    expect(renderSnapshot).toHaveBeenCalledTimes(mounted);
    expect(vi.getTimerCount()).toBe(1);
  });
});
