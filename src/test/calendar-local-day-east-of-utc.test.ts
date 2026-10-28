/**
 * The calendar's local-day key east of UTC. The process timezone is pinned to
 * Pacific/Auckland before the calendar module loads, the same hoisted pin as
 * calendar-local-day-grouping.test.ts; the first test asserts the pin took.
 */
import { afterAll, describe, expect, it, vi } from "vitest";
import { calendarInstantDayKey } from "@/lib/calendarLocalDayRules";

const harness = vi.hoisted(() => {
  const originalTz = process.env.TZ;
  process.env.TZ = "Pacific/Auckland";
  return { originalTz };
});

afterAll(() => {
  if (harness.originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = harness.originalTz;
});

describe("calendar local day east of UTC (Pacific/Auckland)", () => {
  it("runs in Pacific/Auckland", () => {
    // NZDT is UTC+13 on 2026-10-11.
    expect(new Date("2026-10-11T00:00:00Z").getTimezoneOffset()).toBe(-780);
  });

  it("buckets a UTC-afternoon instant on the next local day", () => {
    expect(calendarInstantDayKey("2026-10-10T12:30:00Z")).toBe("2026-10-11");
    expect(calendarInstantDayKey("2026-10-10T10:30:00Z")).toBe("2026-10-10");
  });

  it("keeps a bare date on its own civil day", () => {
    expect(calendarInstantDayKey("2026-10-10")).toBe("2026-10-10");
  });
});
