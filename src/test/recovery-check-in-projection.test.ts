// Tranche B+ slice B3a — check-in-only projection for the recovery prompt.
//
// The Dashboard and Grow Detail "recent activity" lists MERGE Action Queue
// events (and, on Grow Detail, alert-adjacent rows) with diary check-ins.
// Feeding those merged rows straight into the shipped recovery engine would
// falsely suppress "No recent check-in" for a grower who has recent Action
// Queue activity but has not actually checked in on a plant.
//
// This projection is a filter, not a second rules engine: the 72 h window,
// the copy, and the decision all stay in noRecentLogRecoveryRules.
import { describe, expect, it } from "vitest";

import { buildNoRecentLogRecovery } from "@/lib/noRecentLogRecoveryRules";
import { selectRecoveryCheckInRows } from "@/lib/recoveryCheckInProjection";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");
const HOUR = 60 * 60 * 1000;

function item(kind: "diary" | "action_event" | "alert_event", ts: string, id: string = kind) {
  return { id, kind, ts, title: `${kind} row` };
}

describe("selectRecoveryCheckInRows", () => {
  it("keeps diary check-ins and drops Action Queue and alert events", () => {
    const rows = selectRecoveryCheckInRows([
      item("action_event", "2026-08-19T11:00:00.000Z"),
      item("diary", "2026-08-17T09:00:00.000Z"),
      item("alert_event", "2026-08-19T10:00:00.000Z"),
    ]);
    expect(rows).toEqual([{ occurredAt: "2026-08-17T09:00:00.000Z" }]);
  });

  it("drops rows whose timestamp is missing or unparseable — unknown is not a check-in", () => {
    const rows = selectRecoveryCheckInRows([
      item("diary", ""),
      item("diary", "not-a-date", "bad"),
      { id: "null-ts", kind: "diary", ts: null as unknown as string, title: "legacy row" },
      item("diary", "2026-08-18T09:00:00.000Z", "good"),
    ]);
    expect(rows).toEqual([{ occurredAt: "2026-08-18T09:00:00.000Z" }]);
  });

  it("returns an empty list for null/undefined/empty input", () => {
    expect(selectRecoveryCheckInRows(null)).toEqual([]);
    expect(selectRecoveryCheckInRows(undefined)).toEqual([]);
    expect(selectRecoveryCheckInRows([])).toEqual([]);
  });

  it("is deterministic and preserves input order", () => {
    const input = [
      item("diary", "2026-08-18T09:00:00.000Z", "a"),
      item("diary", "2026-08-19T09:00:00.000Z", "b"),
    ];
    expect(selectRecoveryCheckInRows(input)).toEqual(selectRecoveryCheckInRows(input));
    expect(selectRecoveryCheckInRows(input).map((r) => r.occurredAt)).toEqual([
      "2026-08-18T09:00:00.000Z",
      "2026-08-19T09:00:00.000Z",
    ]);
  });
});

describe("projection + shipped engine — the false-negative regression", () => {
  it("still prompts when Action Queue activity is recent but no check-in is", () => {
    const merged = [
      item("action_event", new Date(NOW - 1 * HOUR).toISOString()),
      item("alert_event", new Date(NOW - 2 * HOUR).toISOString()),
      item("diary", new Date(NOW - 100 * HOUR).toISOString()),
    ];
    const recovery = buildNoRecentLogRecovery({
      rows: selectRecoveryCheckInRows(merged),
      now: NOW,
    });
    expect(recovery.showPrompt).toBe(true);
    expect(recovery.reason).toBe("stale_activity");
    // Reusing the shipped engine means reusing its ratified copy verbatim.
    expect(recovery.headline).toBe("No recent check-in.");
    expect(recovery.body).toBe("Add a 10-second status: Better, Same, or Worse.");
    expect(recovery.ctaLabel).toBe("Add quick check");
  });

  it("does not prompt when a real check-in is recent", () => {
    const merged = [
      item("action_event", new Date(NOW - 90 * HOUR).toISOString()),
      item("diary", new Date(NOW - 2 * HOUR).toISOString()),
    ];
    const recovery = buildNoRecentLogRecovery({
      rows: selectRecoveryCheckInRows(merged),
      now: NOW,
    });
    expect(recovery.showPrompt).toBe(false);
    expect(recovery.reason).toBe("recent_activity");
  });

  it("prompts with no_activity when the grower has never checked in", () => {
    const recovery = buildNoRecentLogRecovery({
      rows: selectRecoveryCheckInRows([item("action_event", new Date(NOW - HOUR).toISOString())]),
      now: NOW,
    });
    expect(recovery.showPrompt).toBe(true);
    expect(recovery.reason).toBe("no_activity");
  });
});
