/**
 * Tests for the read-only Daily Grow Check status derivation and wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  deriveDailyGrowCheckStatus,
  DAILY_CHECK_LABELS,
} from "@/lib/dailyGrowCheckStatusRules";

const NOW = new Date("2026-05-24T15:00:00Z");
const TODAY_EARLIER = "2026-05-24T08:00:00Z";
const TODAY_LATER = "2026-05-24T08:30:00Z";
const TODAY_FAR = "2026-05-24T01:00:00Z";
const YESTERDAY = "2026-05-23T20:00:00Z";

describe("deriveDailyGrowCheckStatus · pure rules", () => {
  it("returns 'No check activity today' when nothing exists today", () => {
    const s = deriveDailyGrowCheckStatus({
      now: NOW,
      manualReadings: [{ ts: YESTERDAY, id: "m1" }],
      diaryEntries: [{ entry_at: YESTERDAY, id: "d1" }],
    });
    expect(s.kind).toBe("none");
    expect(s.label).toBe(DAILY_CHECK_LABELS.none);
    expect(s.lastActivityAt).toBeNull();
    expect(s.occurredToday).toBe(false);
  });

  it("returns 'Manual snapshot added' when only manual reading today", () => {
    const s = deriveDailyGrowCheckStatus({
      now: NOW,
      manualReadings: [
        { ts: TODAY_EARLIER, id: "m1", tent_id: "tent-1" },
      ],
      diaryEntries: [],
    });
    expect(s.kind).toBe("manual-only");
    expect(s.label).toBe(DAILY_CHECK_LABELS.manualOnly);
    expect(s.tentId).toBe("tent-1");
  });

  it("returns 'Quick Log added' when only diary entry today", () => {
    const s = deriveDailyGrowCheckStatus({
      now: NOW,
      manualReadings: [],
      diaryEntries: [
        { entry_at: TODAY_EARLIER, id: "d1", tent_id: "tent-2", plant_id: "p-1" },
      ],
    });
    expect(s.kind).toBe("quicklog-only");
    expect(s.label).toBe(DAILY_CHECK_LABELS.quickLogOnly);
    expect(s.tentId).toBe("tent-2");
    expect(s.plantId).toBe("p-1");
  });

  it("returns 'Daily check activity detected' when manual + diary are close", () => {
    const s = deriveDailyGrowCheckStatus({
      now: NOW,
      manualReadings: [{ ts: TODAY_EARLIER, id: "m1", tent_id: "tent-1" }],
      diaryEntries: [{ entry_at: TODAY_LATER, id: "d1", plant_id: "p-1" }],
    });
    expect(s.kind).toBe("both");
    expect(s.label).toBe(DAILY_CHECK_LABELS.both);
    expect(s.plantId).toBe("p-1");
  });

  it("never claims 'completed'", () => {
    const s = deriveDailyGrowCheckStatus({
      now: NOW,
      manualReadings: [{ ts: TODAY_EARLIER, id: "m1" }],
      diaryEntries: [{ entry_at: TODAY_LATER, id: "d1" }],
    });
    expect(s.label.toLowerCase()).not.toContain("completed");
  });

  it("sorts deterministically by ts desc, created_at desc, id desc", () => {
    const s = deriveDailyGrowCheckStatus({
      now: NOW,
      manualReadings: [
        { ts: TODAY_EARLIER, id: "m1", tent_id: "older-tent" },
        { ts: TODAY_LATER, id: "m2", tent_id: "newer-tent" },
        { ts: TODAY_FAR, id: "m3", tent_id: "earliest-tent" },
      ],
      diaryEntries: [],
    });
    expect(s.tentId).toBe("newer-tent");
  });

  it("falls back to more recent of the two when manual+diary not close", () => {
    const s = deriveDailyGrowCheckStatus({
      now: NOW,
      combineWindowMinutes: 5,
      manualReadings: [{ ts: TODAY_FAR, id: "m1" }],
      diaryEntries: [{ entry_at: TODAY_LATER, id: "d1" }],
    });
    expect(s.kind).toBe("quicklog-only");
  });
});

describe("Daily Grow Check status · wiring", () => {
  const root = resolve(__dirname, "../..");
  const card = readFileSync(
    resolve(root, "src/components/DailyGrowCheckStatusCard.tsx"),
    "utf8",
  );
  const dash = readFileSync(resolve(root, "src/pages/Dashboard.tsx"), "utf8");
  const grow = readFileSync(resolve(root, "src/pages/GrowRoomMode.tsx"), "utf8");
  const rules = readFileSync(
    resolve(root, "src/lib/dailyGrowCheckStatusRules.ts"),
    "utf8",
  );

  it("card file exists and exports default", () => {
    expect(existsSync(resolve(root, "src/components/DailyGrowCheckStatusCard.tsx"))).toBe(true);
    expect(card).toMatch(/export default function DailyGrowCheckStatusCard/);
  });

  it("card includes Start Check CTA linking to /daily-check", () => {
    expect(card).toMatch(/Start Check/);
    expect(card).toMatch(/to=["']\/daily-check["']/);
  });

  it("Dashboard renders the status card", () => {
    expect(dash).toMatch(/DailyGrowCheckStatusCard/);
  });

  it("GrowRoomMode renders the compact status card", () => {
    expect(grow).toMatch(/DailyGrowCheckStatusCard/);
    expect(grow).toMatch(/compact/);
  });

  it("does not introduce forbidden integration or write surfaces", () => {
    for (const src of [card, rules]) {
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/mqtt/i);
      expect(src).not.toMatch(/home[_-]?assistant/i);
      expect(src).not.toMatch(/pi[_-]?bridge/i);
      expect(src).not.toMatch(/\bactuator\b/i);
      expect(src).not.toMatch(/device[_-]?command/i);
      expect(src).not.toMatch(/auto[_-]?pilot/i);
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    }
  });

  it("rules module is I/O-free", () => {
    expect(rules).not.toMatch(/@\/integrations\/supabase/);
    expect(rules).not.toMatch(/from\s+["']react["']/);
  });

  it("card uses Unknown labels rather than guessing when tent/plant missing", () => {
    expect(card).toMatch(/Unknown tent/);
    expect(card).toMatch(/Unknown plant/);
  });
});
