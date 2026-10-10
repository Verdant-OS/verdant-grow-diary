import { describe, expect, it } from "vitest";
import { toDateTimeLocalInputValue } from "@/lib/dateTimeLocalRules";
import {
  MANUAL_READING_OBSERVED_AT_FUTURE_MESSAGE,
  MANUAL_READING_OBSERVED_AT_INVALID_MESSAGE,
  MANUAL_READING_OBSERVED_AT_LOOKBACK_MS,
  MANUAL_READING_OBSERVED_AT_TOO_OLD_MESSAGE,
  MANUAL_READING_OBSERVED_AT_WINDOW_LABEL,
  decideManualReadingObservedAt,
  manualReadingObservedAtWindowLabel,
} from "@/lib/manualSensorObservedAtRules";

const NOW = new Date("2026-10-10T16:00:00.000Z");

function localAt(instant: Date): string {
  return toDateTimeLocalInputValue(instant);
}

describe("MANUAL_READING_OBSERVED_AT_LOOKBACK_MS", () => {
  it("is the 7-day owner decision, and copy derives from that constant", () => {
    expect(MANUAL_READING_OBSERVED_AT_LOOKBACK_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(manualReadingObservedAtWindowLabel(MANUAL_READING_OBSERVED_AT_LOOKBACK_MS)).toBe(
      MANUAL_READING_OBSERVED_AT_WINDOW_LABEL,
    );
    expect(MANUAL_READING_OBSERVED_AT_TOO_OLD_MESSAGE).toContain(
      MANUAL_READING_OBSERVED_AT_WINDOW_LABEL,
    );
    expect(MANUAL_READING_OBSERVED_AT_TOO_OLD_MESSAGE).not.toMatch(/24 hours|VALUE PENDING/i);
  });
});

describe("decideManualReadingObservedAt", () => {
  it("leaves an untouched field as the device instant, even if the displayed value is stale", () => {
    const decision = decideManualReadingObservedAt({
      touched: false,
      localValue: "1999-01-01T00:00",
      now: NOW,
    });
    expect(decision).toEqual({ kind: "device_now" });
  });

  it("accepts a touched time equal to now and a time exactly at the lookback", () => {
    const atNow = decideManualReadingObservedAt({
      touched: true,
      localValue: localAt(NOW),
      now: NOW,
    });
    expect(atNow.kind).toBe("observed");
    if (atNow.kind === "observed") expect(Date.parse(atNow.iso)).toBe(NOW.getTime());

    const boundary = new Date(NOW.getTime() - MANUAL_READING_OBSERVED_AT_LOOKBACK_MS);
    const atBoundary = decideManualReadingObservedAt({
      touched: true,
      localValue: localAt(boundary),
      now: NOW,
    });
    expect(atBoundary.kind).toBe("observed");
    if (atBoundary.kind === "observed") {
      expect(NOW.getTime() - Date.parse(atBoundary.iso)).toBe(
        MANUAL_READING_OBSERVED_AT_LOOKBACK_MS,
      );
    }
  });

  it("rejects one millisecond past the lookback and any future time", () => {
    const tooOld = new Date(NOW.getTime() - MANUAL_READING_OBSERVED_AT_LOOKBACK_MS - 1);
    const rejectedOld = decideManualReadingObservedAt({
      touched: true,
      localValue: localAt(tooOld),
      now: NOW,
    });
    expect(rejectedOld.kind).toBe("rejected");
    if (rejectedOld.kind === "rejected") {
      expect(rejectedOld.reason).toBe("too_old");
      expect(rejectedOld.message).toBe(MANUAL_READING_OBSERVED_AT_TOO_OLD_MESSAGE);
      expect(rejectedOld.parsedIso).toBeTruthy();
    }

    const future = new Date(NOW.getTime() + 60_000);
    const rejectedFuture = decideManualReadingObservedAt({
      touched: true,
      localValue: localAt(future),
      now: NOW,
    });
    expect(rejectedFuture).toMatchObject({
      kind: "rejected",
      reason: "future",
      message: MANUAL_READING_OBSERVED_AT_FUTURE_MESSAGE,
    });
  });

  it("rejects empty, impossible, and non-datetime values", () => {
    for (const localValue of ["", "   ", "tomorrow", "2026-02-31T12:00", "2026-13-01T00:00"]) {
      const decision = decideManualReadingObservedAt({
        touched: true,
        localValue,
        now: NOW,
      });
      expect(decision).toMatchObject({
        kind: "rejected",
        reason: "invalid",
        message: MANUAL_READING_OBSERVED_AT_INVALID_MESSAGE,
      });
    }
  });

  it("repeats the same decision for the same inputs", () => {
    const args = {
      touched: true,
      localValue: localAt(new Date(NOW.getTime() - 2 * 24 * 60 * 60 * 1000)),
      now: NOW,
    };
    expect(decideManualReadingObservedAt(args)).toEqual(decideManualReadingObservedAt(args));
  });
});
