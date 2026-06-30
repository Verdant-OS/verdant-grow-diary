/**
 * Verdant QuickLog Post-Save "What Was Saved" Breakdown v1
 *
 * Pure helper tests for `buildDailyCheckSavedItems`. Confirms the
 * breakdown is derived only from confirmed save state, never invents
 * items, never labels manual sensor data as live, and never claims
 * plant health from a single log/snapshot.
 */
import { describe, it, expect } from "vitest";
import {
  DAILY_CHECK_SAVED_BREAKDOWN_TITLE,
  DAILY_CHECK_SAVED_ITEM_NOTE_LABEL,
  DAILY_CHECK_SAVED_ITEM_MANUAL_SNAPSHOT_LABEL,
  buildDailyCheckSavedItems,
} from "@/lib/dailyCheckPostSubmitRules";

const FORBIDDEN = [
  /\bhealthy\b/i,
  /\bperfect\b/i,
  /\bdiagnos/i,
  /\blive (sensor|data|reading)\b/i,
];

function assertSafeCopy(s: string) {
  for (const re of FORBIDDEN) {
    expect(s, `forbidden phrase ${re} in: ${s}`).not.toMatch(re);
  }
}

describe("buildDailyCheckSavedItems", () => {
  it("returns [] when no submit has been confirmed", () => {
    expect(buildDailyCheckSavedItems({ source: null, submittedAt: null })).toEqual(
      [],
    );
    expect(
      buildDailyCheckSavedItems({ source: "note", submittedAt: null }),
    ).toEqual([]);
    expect(
      buildDailyCheckSavedItems({ source: "sensor", submittedAt: undefined }),
    ).toEqual([]);
    expect(
      buildDailyCheckSavedItems({ source: "note", submittedAt: NaN }),
    ).toEqual([]);
  });

  it("returns Plant note item when a note save is confirmed", () => {
    const items = buildDailyCheckSavedItems({
      source: "note",
      submittedAt: 1_700_000_000_000,
    });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("note");
    expect(items[0].label).toBe(DAILY_CHECK_SAVED_ITEM_NOTE_LABEL);
    assertSafeCopy(items[0].label);
  });

  it("returns Manual snapshot item, labeled manual not live, when sensor save is confirmed", () => {
    const items = buildDailyCheckSavedItems({
      source: "sensor",
      submittedAt: 1_700_000_000_000,
    });
    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("manual-snapshot");
    expect(items[0].label).toBe(DAILY_CHECK_SAVED_ITEM_MANUAL_SNAPSHOT_LABEL);
    expect(items[0].label.toLowerCase()).toContain("manual");
    expect(items[0].label.toLowerCase()).toContain("not live");
    assertSafeCopy(items[0].label);
  });

  it("breakdown title is calm and does not claim health/diagnosis", () => {
    expect(DAILY_CHECK_SAVED_BREAKDOWN_TITLE).toBe("What was saved");
    assertSafeCopy(DAILY_CHECK_SAVED_BREAKDOWN_TITLE);
  });
});
