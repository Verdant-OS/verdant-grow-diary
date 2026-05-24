/**
 * Tests for Daily Grow Check history (plant scope).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildDailyGrowCheckHistory,
  HISTORY_LABELS,
} from "@/lib/dailyGrowCheckHistoryRules";

const NOW = new Date(2026, 4, 24, 15, 0, 0); // local May 24 2026 15:00
const PLANT = "plant-1";
const TENT = "tent-1";

function isoLocal(y: number, m: number, d: number, hh = 8, mm = 0) {
  return new Date(y, m, d, hh, mm).toISOString();
}

describe("buildDailyGrowCheckHistory · pure rules", () => {
  it("groups activity by day and includes today + yesterday labels", () => {
    const rows = buildDailyGrowCheckHistory({
      now: NOW,
      days: 5,
      plantId: PLANT,
      currentTentId: TENT,
      plantsInTentCount: 1,
      manualReadings: [],
      diaryEntries: [],
    });
    expect(rows).toHaveLength(5);
    expect(rows[0].label).toBe("Today");
    expect(rows[1].label).toBe("Yesterday");
    // Day 3 is a date label like "May 22"
    expect(rows[2].label).toMatch(/^[A-Z][a-z]{2} \d+$/);
  });

  it("returns 'No check activity' for empty days", () => {
    const rows = buildDailyGrowCheckHistory({
      now: NOW,
      days: 3,
      plantId: PLANT,
      currentTentId: TENT,
      plantsInTentCount: 1,
      manualReadings: [],
      diaryEntries: [],
    });
    for (const r of rows) {
      expect(r.kind).toBe("none");
      expect(r.activityLabel).toBe(HISTORY_LABELS.none);
    }
  });

  it("returns 'Quick Log added' for plant diary activity only", () => {
    const rows = buildDailyGrowCheckHistory({
      now: NOW,
      days: 3,
      plantId: PLANT,
      currentTentId: TENT,
      plantsInTentCount: 1,
      manualReadings: [],
      diaryEntries: [
        { entry_at: isoLocal(2026, 4, 24, 9), id: "d1", plant_id: PLANT },
      ],
    });
    expect(rows[0].kind).toBe("quicklog-only");
    expect(rows[0].activityLabel).toBe(HISTORY_LABELS.quickLogOnly);
  });

  it("returns 'Tent manual snapshot added' when multiple plants share tent", () => {
    const rows = buildDailyGrowCheckHistory({
      now: NOW,
      days: 3,
      plantId: PLANT,
      currentTentId: TENT,
      plantsInTentCount: 3,
      manualReadings: [
        { ts: isoLocal(2026, 4, 24, 10), id: "m1", tent_id: TENT },
      ],
      diaryEntries: [],
    });
    expect(rows[0].kind).toBe("tent-manual-only");
    expect(rows[0].activityLabel).toBe(HISTORY_LABELS.tentManualOnly);
    expect(rows[0].tentLevel).toBe(true);
  });

  it("returns 'Manual snapshot added' for single-plant tent", () => {
    const rows = buildDailyGrowCheckHistory({
      now: NOW,
      days: 3,
      plantId: PLANT,
      currentTentId: TENT,
      plantsInTentCount: 1,
      manualReadings: [
        { ts: isoLocal(2026, 4, 24, 10), id: "m1", tent_id: TENT },
      ],
      diaryEntries: [],
    });
    expect(rows[0].kind).toBe("manual-only");
    expect(rows[0].activityLabel).toBe(HISTORY_LABELS.manualOnly);
  });

  it("returns 'Daily check activity detected' when manual + diary close", () => {
    const rows = buildDailyGrowCheckHistory({
      now: NOW,
      days: 3,
      plantId: PLANT,
      currentTentId: TENT,
      plantsInTentCount: 1,
      manualReadings: [
        { ts: isoLocal(2026, 4, 24, 10, 0), id: "m1", tent_id: TENT },
      ],
      diaryEntries: [
        { entry_at: isoLocal(2026, 4, 24, 10, 15), id: "d1", plant_id: PLANT },
      ],
    });
    expect(rows[0].kind).toBe("both");
    expect(rows[0].activityLabel).toBe(HISTORY_LABELS.both);
  });

  it("never uses the word 'completed'", () => {
    for (const v of Object.values(HISTORY_LABELS)) {
      expect(v.toLowerCase()).not.toContain("completed");
    }
  });

  it("ignores manual readings when plant has no tent assigned", () => {
    const rows = buildDailyGrowCheckHistory({
      now: NOW,
      days: 3,
      plantId: PLANT,
      currentTentId: null,
      plantsInTentCount: 0,
      manualReadings: [
        { ts: isoLocal(2026, 4, 24, 10), id: "m1", tent_id: TENT },
      ],
      diaryEntries: [],
    });
    expect(rows[0].kind).toBe("none");
  });

  it("ignores diary entries for other plants", () => {
    const rows = buildDailyGrowCheckHistory({
      now: NOW,
      days: 3,
      plantId: PLANT,
      currentTentId: TENT,
      plantsInTentCount: 1,
      manualReadings: [],
      diaryEntries: [
        { entry_at: isoLocal(2026, 4, 24, 9), id: "d1", plant_id: "other" },
      ],
    });
    expect(rows[0].kind).toBe("none");
  });

  it("sorts deterministically by ts desc, created_at desc, id desc within day", () => {
    const rows = buildDailyGrowCheckHistory({
      now: NOW,
      days: 1,
      plantId: PLANT,
      currentTentId: TENT,
      plantsInTentCount: 1,
      combineWindowMinutes: 5,
      manualReadings: [
        { ts: isoLocal(2026, 4, 24, 9), id: "m-old", tent_id: TENT },
        { ts: isoLocal(2026, 4, 24, 14), id: "m-new", tent_id: TENT },
      ],
      diaryEntries: [
        { entry_at: isoLocal(2026, 4, 24, 1), id: "d1", plant_id: PLANT },
      ],
    });
    // Manual newer than diary and > 5min apart → manual-only with manual latest time
    expect(rows[0].kind).toBe("manual-only");
    expect(rows[0].latestAt).toBe(isoLocal(2026, 4, 24, 14));
  });
});

describe("Daily Grow Check history · wiring + safety", () => {
  const root = resolve(__dirname, "../..");
  const card = readFileSync(
    resolve(root, "src/components/PlantDailyGrowCheckHistoryCard.tsx"),
    "utf8",
  );
  const rules = readFileSync(
    resolve(root, "src/lib/dailyGrowCheckHistoryRules.ts"),
    "utf8",
  );
  const page = readFileSync(resolve(root, "src/pages/PlantDetail.tsx"), "utf8");

  it("Plant Detail renders the history card with plantId + currentTentId", () => {
    expect(page).toMatch(/PlantDailyGrowCheckHistoryCard/);
    expect(page).toMatch(/currentTentId=/);
  });

  it("CTA links to /daily-check with plantId prefill", () => {
    expect(card).toMatch(/\/daily-check\?plantId=\$\{plantId\}/);
    expect(card).toMatch(/Start Daily Grow Check/);
  });

  it("shows unassigned note when no current tent", () => {
    expect(card).toMatch(/Assign this plant to a tent/);
  });

  it("no completed wording in card or rules", () => {
    expect(card.toLowerCase()).not.toMatch(/\bcompleted\b/);
    expect(rules.toLowerCase()).not.toMatch(/\bcompleted\b/);
  });

  it("no forbidden integrations / write surfaces", () => {
    for (const src of [card, rules]) {
      for (const re of [
        /service_role/i,
        /mqtt/i,
        /home[_-]?assistant/i,
        /pi[_-]?bridge/i,
        /\bactuator\b/i,
        /device[_-]?command/i,
        /auto[_-]?pilot/i,
        /\.insert\(/,
        /\.update\(/,
        /\.delete\(/,
        /\.upsert\(/,
        /\.rpc\(/,
      ]) {
        expect(src).not.toMatch(re);
      }
    }
  });

  it("rules module is I/O-free", () => {
    expect(rules).not.toMatch(/@\/integrations\/supabase/);
    expect(rules).not.toMatch(/from\s+["']react["']/);
  });
});
