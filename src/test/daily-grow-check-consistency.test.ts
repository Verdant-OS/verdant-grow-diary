/**
 * Tests for the read-only Daily Grow Check consistency indicator.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildDailyGrowCheckConsistency,
  CONSISTENCY_WINDOW_DAYS,
} from "@/lib/dailyGrowCheckConsistencyRules";

const NOW = new Date(2026, 4, 24, 15, 0, 0);
const PLANT = "plant-1";
const TENT = "tent-1";

function localIso(y: number, m: number, d: number, hh = 9) {
  return new Date(y, m, d, hh, 0, 0).toISOString();
}

const baseInput = (
  overrides: Partial<Parameters<typeof buildDailyGrowCheckConsistency>[0]> = {},
) => ({
  now: NOW,
  windowDays: 7,
  plantId: PLANT,
  currentTentId: TENT,
  plantsInTentCount: 1,
  manualReadings: [],
  diaryEntries: [],
  ...overrides,
});

describe("buildDailyGrowCheckConsistency · pure rules", () => {
  it("returns 0 of last 7 when nothing happened", () => {
    const s = buildDailyGrowCheckConsistency(baseInput());
    expect(s.checkedDays).toBe(0);
    expect(s.currentStreak).toBe(0);
    expect(s.missedDays).toBe(7);
    expect(s.todayHasActivity).toBe(false);
    expect(s.hasAnyActivity).toBe(false);
  });

  it("counts plant QuickLog days", () => {
    const s = buildDailyGrowCheckConsistency(
      baseInput({
        diaryEntries: [
          { entry_at: localIso(2026, 4, 24), id: "d1", plant_id: PLANT },
          { entry_at: localIso(2026, 4, 23), id: "d2", plant_id: PLANT },
        ],
      }),
    );
    expect(s.checkedDays).toBe(2);
    expect(s.currentStreak).toBe(2);
    expect(s.todayHasActivity).toBe(true);
  });

  it("counts current-tent manual snapshot days", () => {
    const s = buildDailyGrowCheckConsistency(
      baseInput({
        manualReadings: [
          { ts: localIso(2026, 4, 24, 10), id: "m1", tent_id: TENT },
        ],
      }),
    );
    expect(s.checkedDays).toBe(1);
  });

  it("does not count diary entries for other plants", () => {
    const s = buildDailyGrowCheckConsistency(
      baseInput({
        diaryEntries: [
          { entry_at: localIso(2026, 4, 24), id: "d1", plant_id: "other" },
        ],
      }),
    );
    expect(s.checkedDays).toBe(0);
  });

  it("labels tent-level sensor days conservatively (still counted)", () => {
    const s = buildDailyGrowCheckConsistency(
      baseInput({
        plantsInTentCount: 3,
        manualReadings: [
          { ts: localIso(2026, 4, 24, 10), id: "m1", tent_id: TENT },
        ],
      }),
    );
    expect(s.checkedDays).toBe(1);
    expect(s.tentLevelDays).toBe(1);
    expect(s.rows[0].kind).toBe("tent-manual-only");
  });

  it("computes current streak from today backward", () => {
    const s = buildDailyGrowCheckConsistency(
      baseInput({
        diaryEntries: [
          { entry_at: localIso(2026, 4, 24), id: "d1", plant_id: PLANT },
          { entry_at: localIso(2026, 4, 23), id: "d2", plant_id: PLANT },
          { entry_at: localIso(2026, 4, 21), id: "d3", plant_id: PLANT },
        ],
      }),
    );
    expect(s.currentStreak).toBe(2);
    expect(s.checkedDays).toBe(3);
    expect(s.missedDays).toBe(4);
  });

  it("returns 0 streak if today has no activity", () => {
    const s = buildDailyGrowCheckConsistency(
      baseInput({
        diaryEntries: [
          { entry_at: localIso(2026, 4, 23), id: "d2", plant_id: PLANT },
          { entry_at: localIso(2026, 4, 22), id: "d3", plant_id: PLANT },
        ],
      }),
    );
    expect(s.currentStreak).toBe(0);
    expect(s.todayHasActivity).toBe(false);
    expect(s.checkedDays).toBe(2);
  });

  it("respects injected now for boundary determinism", () => {
    const s = buildDailyGrowCheckConsistency(
      baseInput({
        now: new Date(2026, 4, 25, 0, 5, 0),
        diaryEntries: [
          { entry_at: localIso(2026, 4, 24, 23), id: "d1", plant_id: PLANT },
        ],
      }),
    );
    // Yesterday counted, today empty → streak 0.
    expect(s.currentStreak).toBe(0);
    expect(s.checkedDays).toBe(1);
  });

  it("uses default 7-day window when windowDays omitted", () => {
    const s = buildDailyGrowCheckConsistency(baseInput({ windowDays: undefined }));
    expect(s.windowDays).toBe(CONSISTENCY_WINDOW_DAYS);
    expect(s.rows.length).toBe(CONSISTENCY_WINDOW_DAYS);
  });
});

describe("Daily Grow Check consistency · wiring + safety", () => {
  const root = resolve(__dirname, "../..");
  const card = readFileSync(
    resolve(root, "src/components/PlantDailyGrowCheckConsistencyCard.tsx"),
    "utf8",
  );
  const rules = readFileSync(
    resolve(root, "src/lib/dailyGrowCheckConsistencyRules.ts"),
    "utf8",
  );
  const page = readFileSync(resolve(root, "src/pages/PlantDetail.tsx"), "utf8");

  it("Plant Detail renders the consistency card", () => {
    expect(page).toMatch(/PlantDailyGrowCheckConsistencyCard/);
  });

  it("card shows X of last 7 days and current streak", () => {
    expect(card).toMatch(/Checked \{summary\.checkedDays\} of last/);
    expect(card).toMatch(/Current streak/);
  });

  it("card shows empty-state copy when no activity", () => {
    expect(card).toMatch(/No check activity in the last/);
  });

  it("card shows assign-tent note when unassigned", () => {
    expect(card).toMatch(/Assign this plant to a tent/);
  });

  it("CTA routes to /daily-check?plantId=<id>", () => {
    expect(card).toMatch(/\/daily-check\?plantId=\$\{plantId\}/);
    expect(card).toMatch(/Start Daily Grow Check/);
  });

  it("no 'completed', 'perfect grow', or health claim wording", () => {
    for (const src of [card, rules]) {
      expect(src.toLowerCase()).not.toMatch(/\bcompleted\b/);
      expect(src.toLowerCase()).not.toMatch(/perfect grow/);
      expect(src.toLowerCase()).not.toMatch(/healthy/);
    }
  });

  it("no forbidden integrations or write surfaces", () => {
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
