/**
 * The Timeline grow-day header advances at the next local midnight while the
 * page stays open, and the deadline is the next local calendar midnight
 * (DST days are 23 or 25 hours).
 */
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TimelineGrowDayLabel } from "@/components/TimelineGrowDayLabel";
import { nextLocalMidnight } from "@/lib/plantStartDateRules";

describe("nextLocalMidnight", () => {
  const previousTz = process.env.TZ;
  afterEach(() => {
    if (previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = previousTz;
  });

  it("is local midnight of the next calendar day across a spring-forward", () => {
    process.env.TZ = "America/New_York";
    const now = new Date(2026, 2, 8, 1, 30, 0);
    const next = nextLocalMidnight(now);
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(2);
    expect(next.getDate()).toBe(9);
    expect(next.getHours()).toBe(0);
    expect(next.getMinutes()).toBe(0);
    expect(next.getTime() - now.getTime()).toBe(21.5 * 60 * 60 * 1000);
  });

  it("is local midnight of the next calendar day across a fall-back", () => {
    process.env.TZ = "America/New_York";
    const now = new Date(2026, 10, 1, 0, 30, 0);
    const next = nextLocalMidnight(now);
    expect(next.getDate()).toBe(2);
    expect(next.getHours()).toBe(0);
    expect(next.getTime() - now.getTime()).toBe(24.5 * 60 * 60 * 1000);
  });
});

describe("TimelineGrowDayLabel", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the next local day after midnight without another render trigger", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 11, 23, 59, 50));
    const startedAt = new Date(2026, 9, 11, 21, 0, 0).toISOString();
    render(<TimelineGrowDayLabel startedAt={startedAt} stage="vegetative" />);
    expect(screen.getByTestId("timeline-grow-day").textContent).toContain("day 0");
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(screen.getByTestId("timeline-grow-day").textContent).toContain("day 1");
  });
});
