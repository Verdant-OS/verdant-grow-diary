/**
 * Manual reading observed-at under TZ=America/Chicago.
 *
 * `vi.hoisted` pins the zone before this module evaluates `Date`, matching
 * `src/test/timeline-local-day-query-integration.test.tsx`.
 */
import { afterAll, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const originalTz = process.env.TZ;
  process.env.TZ = "America/Chicago";
  return { originalTz };
});

afterAll(() => {
  if (harness.originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = harness.originalTz;
});

import { decideManualReadingObservedAt } from "@/lib/manualSensorObservedAtRules";

describe("manual reading observed-at in America/Chicago", () => {
  it("converts a CDT wall time to UTC", () => {
    const decision = decideManualReadingObservedAt({
      touched: true,
      localValue: "2026-10-08T21:30",
      now: new Date("2026-10-09T02:30:00.000Z"),
    });
    expect(decision).toEqual({ kind: "observed", iso: "2026-10-09T02:30:00.000Z" });
  });

  it("converts the spring-forward 03:00 wall time to UTC and rejects the missing 02:30", () => {
    const valid = decideManualReadingObservedAt({
      touched: true,
      localValue: "2026-03-08T03:00",
      now: new Date("2026-03-08T08:00:00.000Z"),
    });
    expect(valid).toEqual({ kind: "observed", iso: "2026-03-08T08:00:00.000Z" });

    const gap = decideManualReadingObservedAt({
      touched: true,
      localValue: "2026-03-08T02:30",
      now: new Date("2026-03-08T12:00:00.000Z"),
    });
    expect(gap).toMatchObject({ kind: "rejected", reason: "invalid" });
  });

  it("locks the fall-back 01:30 wall time to the daylight occurrence Node returns", () => {
    const decision = decideManualReadingObservedAt({
      touched: true,
      localValue: "2026-11-01T01:30",
      now: new Date("2026-11-01T06:30:00.000Z"),
    });
    expect(decision).toEqual({ kind: "observed", iso: "2026-11-01T06:30:00.000Z" });
  });
});
