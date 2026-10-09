import { describe, expect, it } from "vitest";
import { formatQuickLogOccurredAt } from "@/lib/quickLogGroupedTimelineFilterViewModel";
import {
  QUICK_LOG_NOTE_OCCURRED_AT_AFTER_LIFETIME,
  QUICK_LOG_NOTE_OCCURRED_AT_BEFORE_LIFETIME,
  QUICK_LOG_NOTE_OCCURRED_AT_FUTURE,
  QUICK_LOG_NOTE_OCCURRED_AT_INVALID,
  formatQuickLogNoteLocalDateTime,
  parseQuickLogNoteLocalDateTime,
  quickLogNoteLifetimeBounds,
  resolveQuickLogNoteOccurredAt,
} from "@/lib/quickLogNoteOccurredAtRules";

const NOW = new Date(2026, 9, 9, 16, 30, 45);
const GROW_START = new Date(2026, 8, 1, 9, 0, 0).toISOString();
const PLANT_START = new Date(2026, 8, 15, 11, 20, 45).toISOString();

function chosen(date: Date) {
  return resolveQuickLogNoteOccurredAt({
    touched: true,
    localValue: formatQuickLogNoteLocalDateTime(date),
    now: NOW,
    growStartedAt: GROW_START,
    plantStartedAt: PLANT_START,
    endedAt: null,
  });
}

describe("resolveQuickLogNoteOccurredAt", () => {
  it("leaves an untouched field on the default so the save path is unchanged", () => {
    const yesterday = formatQuickLogNoteLocalDateTime(new Date(2026, 9, 8, 14, 15, 0));
    const decision = resolveQuickLogNoteOccurredAt({
      touched: false,
      localValue: yesterday,
      now: NOW,
      growStartedAt: GROW_START,
      plantStartedAt: PLANT_START,
      endedAt: null,
    });
    expect(decision).toEqual({ ok: true, mode: "default", pOccurredAt: null });
  });

  it("treats a cleared field as the default", () => {
    const decision = resolveQuickLogNoteOccurredAt({
      touched: true,
      localValue: "  ",
      now: NOW,
      growStartedAt: GROW_START,
      plantStartedAt: PLANT_START,
      endedAt: null,
    });
    expect(decision).toEqual({ ok: true, mode: "default", pOccurredAt: null });
  });

  it("persists a backdated local minute as the occurred-at instant", () => {
    const yesterday = new Date(2026, 9, 8, 14, 15, 0, 0);
    const decision = chosen(yesterday);
    expect(decision).toEqual({
      ok: true,
      mode: "chosen",
      pOccurredAt: yesterday.toISOString(),
    });
    expect(formatQuickLogOccurredAt(yesterday.toISOString())).not.toBe(
      formatQuickLogOccurredAt(NOW.toISOString()),
    );
    if (decision.ok && decision.mode === "chosen") {
      expect(formatQuickLogOccurredAt(decision.pOccurredAt)).toBe(
        formatQuickLogOccurredAt(yesterday.toISOString()),
      );
    }
  });

  it("rejects a future minute", () => {
    const decision = chosen(new Date(2026, 9, 9, 16, 31, 0, 0));
    expect(decision).toEqual({
      ok: false,
      reason: "occurred_at_in_future",
      message: QUICK_LOG_NOTE_OCCURRED_AT_FUTURE,
    });
  });

  it("accepts the current minute", () => {
    const decision = chosen(new Date(2026, 9, 9, 16, 30, 0, 0));
    expect(decision.ok).toBe(true);
    if (decision.ok) expect(decision.mode).toBe("chosen");
  });

  it("rejects a time before the later of the grow and plant starts", () => {
    const bounds = quickLogNoteLifetimeBounds({
      growStartedAt: GROW_START,
      plantStartedAt: PLANT_START,
      endedAt: null,
    });
    expect(bounds.startMs).toBe(Date.parse(PLANT_START));
    const decision = chosen(new Date(2026, 8, 10, 12, 0, 0, 0));
    expect(decision).toEqual({
      ok: false,
      reason: "occurred_at_before_lifetime",
      message: QUICK_LOG_NOTE_OCCURRED_AT_BEFORE_LIFETIME,
    });
  });

  it("allows the plant-start minute when the start is mid-minute", () => {
    const decision = chosen(new Date(2026, 8, 15, 11, 20, 0, 0));
    expect(decision.ok).toBe(true);
    const minuteBefore = chosen(new Date(2026, 8, 15, 11, 19, 0, 0));
    expect(minuteBefore.ok).toBe(false);
    if (!minuteBefore.ok) expect(minuteBefore.reason).toBe("occurred_at_before_lifetime");
  });

  it("rejects a time after an explicit grow end and still allows an archived grow with no end", () => {
    const endedAt = new Date(2026, 9, 7, 18, 0, 0, 0).toISOString();
    const afterEnd = resolveQuickLogNoteOccurredAt({
      touched: true,
      localValue: formatQuickLogNoteLocalDateTime(new Date(2026, 9, 8, 9, 0, 0, 0)),
      now: NOW,
      growStartedAt: GROW_START,
      plantStartedAt: PLANT_START,
      endedAt,
    });
    expect(afterEnd).toEqual({
      ok: false,
      reason: "occurred_at_after_lifetime",
      message: QUICK_LOG_NOTE_OCCURRED_AT_AFTER_LIFETIME,
    });

    const archived = resolveQuickLogNoteOccurredAt({
      touched: true,
      localValue: formatQuickLogNoteLocalDateTime(new Date(2026, 9, 8, 9, 0, 0, 0)),
      now: NOW,
      growStartedAt: GROW_START,
      plantStartedAt: PLANT_START,
      endedAt: null,
    });
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.mode).toBe("chosen");
  });

  it("rejects an impossible local date", () => {
    expect(parseQuickLogNoteLocalDateTime("2026-02-31T10:00")).toBeNull();
    const decision = resolveQuickLogNoteOccurredAt({
      touched: true,
      localValue: "2026-02-31T10:00",
      now: NOW,
      growStartedAt: GROW_START,
      plantStartedAt: PLANT_START,
      endedAt: null,
    });
    expect(decision).toEqual({
      ok: false,
      reason: "invalid_occurred_at",
      message: QUICK_LOG_NOTE_OCCURRED_AT_INVALID,
    });
  });
});
