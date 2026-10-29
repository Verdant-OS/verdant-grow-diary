/**
 * Shared notice state model (Simple View Phase 3): "Not now" hides for a day
 * and counts, the third retires, "Remind me later" hides for 3 days without
 * counting, restore clears. Malformed values read as "no record".
 */
import { describe, expect, it } from "vitest";
import {
  applyNoticeAction,
  NOTICE_DISMISS_LIMIT,
  parseNoticeRecord,
  resolveNoticeVisibility,
} from "@/lib/noticeStateRules";

const T0 = new Date("2026-10-29T12:00:00.000Z");
const hours = (h: number) => new Date(T0.getTime() + h * 3_600_000);

describe("resolveNoticeVisibility", () => {
  it("no record is visible", () => {
    expect(resolveNoticeVisibility(null, T0)).toBe("visible");
    expect(resolveNoticeVisibility(undefined, T0)).toBe("visible");
  });

  it("Not now hides for 24 hours, then the notice is visible again", () => {
    const once = applyNoticeAction(null, "dismiss", T0);
    expect(once).toMatchObject({ dismissCount: 1, dismissedAt: T0.toISOString() });
    expect(resolveNoticeVisibility(once, hours(23.9))).toBe("dismissed");
    expect(resolveNoticeVisibility(once, hours(24))).toBe("visible");
  });

  it("the third Not now retires the notice for good", () => {
    let r = applyNoticeAction(null, "dismiss", T0);
    r = applyNoticeAction(r, "dismiss", hours(30));
    expect(resolveNoticeVisibility(r, hours(60))).toBe("visible");
    r = applyNoticeAction(r, "dismiss", hours(60));
    expect(r?.dismissCount).toBe(NOTICE_DISMISS_LIMIT);
    expect(resolveNoticeVisibility(r, hours(24 * 365))).toBe("retired");
    // A further dismiss never pushes the count past the limit.
    expect(applyNoticeAction(r, "dismiss", hours(61))?.dismissCount).toBe(NOTICE_DISMISS_LIMIT);
  });

  it("Remind me later hides for 3 days and does not count toward the limit", () => {
    const snoozed = applyNoticeAction(null, "snooze", T0);
    expect(snoozed?.dismissCount).toBe(0);
    expect(resolveNoticeVisibility(snoozed, hours(71.9))).toBe("snoozed");
    expect(resolveNoticeVisibility(snoozed, hours(72))).toBe("visible");
  });

  it("retired wins over an active snooze", () => {
    const r = { dismissCount: 3, dismissedAt: null, snoozedUntil: hours(10).toISOString() };
    expect(resolveNoticeVisibility(r, T0)).toBe("retired");
  });

  it("restore clears the record", () => {
    const retired = { dismissCount: 3, dismissedAt: T0.toISOString(), snoozedUntil: null };
    expect(applyNoticeAction(retired, "restore", T0)).toBeNull();
  });

  it("is deterministic", () => {
    expect(applyNoticeAction(null, "dismiss", T0)).toEqual(applyNoticeAction(null, "dismiss", T0));
  });
});

describe("parseNoticeRecord", () => {
  it("rejects malformed values instead of inventing a choice", () => {
    for (const bad of [
      null,
      "x",
      3,
      [],
      {},
      { dismissCount: -1 },
      { dismissCount: 1.5 },
      { dismissCount: "2" },
    ]) {
      expect(parseNoticeRecord(bad)).toBeNull();
    }
  });

  it("keeps valid fields, drops bad timestamps and clamps the count", () => {
    expect(
      parseNoticeRecord({ dismissCount: 9, dismissedAt: "nope", snoozedUntil: T0.toISOString() }),
    ).toEqual({ dismissCount: 3, dismissedAt: null, snoozedUntil: T0.toISOString() });
  });
});
