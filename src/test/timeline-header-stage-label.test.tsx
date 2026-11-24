/**
 * The Timeline header label renders the scoped plant's stage and day, and
 * keeps the grow-only label when no plant or tent is passed.
 */
import { render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { TimelineGrowDayLabel } from "@/components/TimelineGrowDayLabel";

const previousTz = process.env.TZ;
beforeAll(() => {
  process.env.TZ = "America/Chicago";
});
afterAll(() => {
  if (previousTz === undefined) delete process.env.TZ;
  else process.env.TZ = previousTz;
});

describe("TimelineGrowDayLabel stage source", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels a Flower plant in a Veg grow and tent as Flowering, counted from the plant start", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
    render(
      <TimelineGrowDayLabel
        startedAt="2026-08-01T15:00:00Z"
        stage="veg"
        plant={{ stage: "flower", started_at: "2026-10-01" }}
        tent={{ stage: "veg" }}
      />,
    );
    const label = screen.getByTestId("timeline-grow-day");
    expect(label.textContent).toBe("Flowering · day 50");
    expect(label.getAttribute("data-stage-source")).toBe("plant");
  });

  it("keeps the grow's stage and day when no plant or tent is in scope", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 20, 12, 0, 0));
    render(<TimelineGrowDayLabel startedAt="2026-08-01T15:00:00Z" stage="veg" />);
    const label = screen.getByTestId("timeline-grow-day");
    expect(label.textContent).toBe("Vegetative · day 111");
    expect(label.getAttribute("data-stage-source")).toBe("grow");
  });
});
