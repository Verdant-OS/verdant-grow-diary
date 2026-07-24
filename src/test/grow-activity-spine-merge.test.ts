/**
 * Grow-scoped activity readers must see the grow_events "spine".
 *
 * Every confirmed Quick Log save writes a grow_events row (source='manual');
 * a diary_entries companion exists only when structured details exist.
 * Readers that counted or listed diary_entries alone made plain quick logs
 * invisible. These tests cover:
 *  - the pure merge/dedupe helpers (linkage + timestamp-pair + env sibling)
 *  - static wiring of useGrowDetailData / useReportsHubData /
 *    useDashboardScopedData onto both tables
 *  - Dashboard's quick-log-carried manual snapshot evidence stays additive
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  countMergedManualGrowActivity,
  dedupeMergedManualGrowActivityRows,
} from "@/lib/connectedOneTentActivationRules";

const ROOT = resolve(__dirname, "../..");
const GROW_DETAIL_HOOK = readFileSync(resolve(ROOT, "src/hooks/useGrowDetailData.ts"), "utf8");
const REPORTS_HOOK = readFileSync(resolve(ROOT, "src/hooks/useReportsHubData.ts"), "utf8");
const DASHBOARD_HOOK = readFileSync(
  resolve(ROOT, "src/hooks/useDashboardScopedData.ts"),
  "utf8",
);
const DASHBOARD_PAGE = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");

const AT = "2026-07-19T12:00:00Z";
const LATER = "2026-07-20T12:00:00Z";

function spine(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-1",
    grow_id: "grow-a",
    tent_id: "tent-a",
    plant_id: "plant-a",
    event_type: "watering",
    occurred_at: AT,
    source: "manual",
    is_deleted: false,
    deleted_at: null,
    ...overrides,
  };
}

function diary(overrides: Record<string, unknown> = {}) {
  return {
    id: "diary-1",
    grow_id: "grow-a",
    tent_id: "tent-a",
    plant_id: "plant-a",
    entry_at: AT,
    details: {},
    ...overrides,
  };
}

describe("countMergedManualGrowActivity", () => {
  it("counts spine-only quick logs alongside standalone diary rows", () => {
    expect(
      countMergedManualGrowActivity({
        growEvents: [
          spine({ id: "water" }),
          spine({ id: "observe", event_type: "observation", occurred_at: LATER }),
        ],
        diaryEntries: [diary({ id: "hand-written", entry_at: "2026-07-18T09:00:00Z" })],
      }),
    ).toBe(3);
  });

  it("drops linked companions even when the parent is outside the window", () => {
    expect(
      countMergedManualGrowActivity({
        growEvents: [spine({ id: "parent" })],
        diaryEntries: [
          diary({ id: "linked", entry_at: LATER, details: { linked_grow_event_id: "parent" } }),
          diary({
            id: "orphan-linked",
            entry_at: LATER,
            details: { linked_grow_event_id: "outside-window" },
          }),
        ],
      }),
    ).toBe(1);
  });

  it("drops unlinked companions sharing an identical (plant_id, timestamp) pair", () => {
    // quicklog_save_manual writes its companion at exactly v_occurred with
    // no linkage — the identical pair is conservatively the same save.
    expect(
      countMergedManualGrowActivity({
        growEvents: [spine({ id: "parent" })],
        diaryEntries: [
          diary({ id: "manual-companion" }),
          diary({ id: "other-plant-same-time", plant_id: "plant-b" }),
        ],
      }),
    ).toBe(2);
  });

  it("collapses same-instant sibling environment rows but keeps standalone checks", () => {
    expect(
      countMergedManualGrowActivity({
        growEvents: [
          spine({ id: "water" }),
          spine({ id: "env-sibling", event_type: "environment" }),
          spine({ id: "env-standalone", event_type: "environment", occurred_at: LATER }),
        ],
      }),
    ).toBe(2);
  });

  it("applies the since bound to both sources", () => {
    expect(
      countMergedManualGrowActivity({
        growEvents: [spine({ id: "old" }), spine({ id: "new", occurred_at: LATER })],
        diaryEntries: [
          diary({ id: "old-diary" }),
          diary({ id: "new-diary", entry_at: LATER, plant_id: "plant-b" }),
        ],
        since: "2026-07-20T00:00:00Z",
      }),
    ).toBe(2);
  });

  it("ignores non-manual, deleted, blank-id, and untimestamped rows; ids count once", () => {
    expect(
      countMergedManualGrowActivity({
        growEvents: [
          spine({ id: "live", source: "live" }),
          spine({ id: "deleted", is_deleted: true }),
          spine({ id: "soft-deleted", deleted_at: AT }),
          spine({ id: "" }),
          spine({ id: "bad-time", occurred_at: "not-a-date", created_at: null }),
          spine({ id: "dupe" }),
          spine({ id: "dupe" }),
          null,
        ],
        diaryEntries: [diary({ id: "" }), diary({ id: "bad", entry_at: "nope" }), null],
      }),
    ).toBe(1);
  });

  it("dedupe returns the surviving rows for list rendering", () => {
    const rows = dedupeMergedManualGrowActivityRows({
      growEvents: [spine({ id: "keep" })],
      diaryEntries: [
        diary({ id: "companion" }),
        diary({ id: "standalone", entry_at: LATER }),
      ],
    });
    expect(rows.growEvents.map((r) => r.id)).toEqual(["keep"]);
    expect(rows.diaryEntries.map((r) => r.id)).toEqual(["standalone"]);
  });
});

describe("useGrowDetailData — reads the grow_events spine", () => {
  it("counts manual, non-deleted grow_events for the merged diary counter", () => {
    expect(GROW_DETAIL_HOOK).toMatch(
      /countFrom\(\s*["']grow_events["']\s*,\s*\(q\)\s*=>\s*q\.eq\(\s*["']source["']\s*,\s*["']manual["']\s*\)\.eq\(\s*["']is_deleted["']\s*,\s*false\s*\)\s*\)/,
    );
    expect(GROW_DETAIL_HOOK).toContain("countMergedManualGrowActivity(");
  });

  it("merges the latest manual grow_events into recent activity, deduped", () => {
    expect(GROW_DETAIL_HOOK).toMatch(
      /from\(\s*["']grow_events["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]*?\.eq\(\s*["']source["']\s*,\s*["']manual["']\s*\)[\s\S]*?\.eq\(\s*["']is_deleted["']\s*,\s*false\s*\)[\s\S]*?\.order\(\s*["']occurred_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)[\s\S]*?\.limit\(\s*5\s*\)/,
    );
    expect(GROW_DETAIL_HOOK).toContain("dedupeMergedManualGrowActivityRows(");
    expect(GROW_DETAIL_HOOK).toMatch(/mergeRecent\(\[\s*\.\.\.diaryItems,\s*\.\.\.growEventItems/);
  });

  it("derives freshness from the later of last diary and last manual event", () => {
    expect(GROW_DETAIL_HOOK).toContain("lastManualEventAt");
    expect(GROW_DETAIL_HOOK).toMatch(
      /from\(\s*["']grow_events["']\s*\)[\s\S]*?\.select\(\s*["']occurred_at["']\s*\)[\s\S]*?\.limit\(\s*1\s*\)/,
    );
  });

  it("stays read-only", () => {
    expect(GROW_DETAIL_HOOK).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  });
});

describe("useReportsHubData — merged diary totals", () => {
  it("includes the manual grow_events spine in diaryTotal/diary7d", () => {
    expect(REPORTS_HOOK).toMatch(
      /from\(\s*["']grow_events["']\s*\)[\s\S]*?\.eq\(\s*["']source["']\s*,\s*["']manual["']\s*\)[\s\S]*?\.eq\(\s*["']is_deleted["']\s*,\s*false\s*\)/,
    );
    expect(REPORTS_HOOK).toContain("countMergedManualGrowActivity(");
    expect(REPORTS_HOOK).toMatch(/since:\s*sevenDaysAgo/);
    expect(REPORTS_HOOK).toMatch(/diaryEntriesTotal,\s*\n\s*diaryEntriesLast7d,/);
  });

  it("stays read-only", () => {
    expect(REPORTS_HOOK).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  });
});

describe("useDashboardScopedData — merged recent activity", () => {
  it("reads latest manual grow_events next to diary entries and dedupes", () => {
    expect(DASHBOARD_HOOK).toMatch(
      /from\(\s*["']grow_events["']\s*\)[\s\S]*?\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)[\s\S]*?\.eq\(\s*["']source["']\s*,\s*["']manual["']\s*\)[\s\S]*?\.eq\(\s*["']is_deleted["']\s*,\s*false\s*\)[\s\S]*?\.limit\(\s*5\s*\)/,
    );
    expect(DASHBOARD_HOOK).toContain("dedupeMergedManualGrowActivityRows(");
    expect(DASHBOARD_HOOK).toMatch(/mergeRecent\(\[\s*\.\.\.diaryItems,\s*\.\.\.growEventItems/);
  });

  it("stays read-only", () => {
    expect(DASHBOARD_HOOK).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  });
});

describe("Dashboard — quick-log manual snapshot evidence is additive", () => {
  it("adds manualSnapshotCount to the sensor step without weakening sensor_readings", () => {
    // Existing sensor_readings path untouched…
    expect(DASHBOARD_PAGE).toContain(
      "countActivatingSensorReadings(readingsByTent[activationGraph.tentId] ?? [])",
    );
    // …and quick-log-carried manual snapshot evidence is added on top.
    expect(DASHBOARD_PAGE).toContain("manualSnapshotCount ?? 0");
    expect(DASHBOARD_PAGE).toContain(
      "sensorReadingCount: connectedSensorReadingCount + quickLogManualSnapshotCount",
    );
  });
});
