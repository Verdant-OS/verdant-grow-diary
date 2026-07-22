/**
 * Plant log streak marker — pure rules + wiring guardrails.
 *
 * The Plant Detail "logged today" marker converts the QuickLog activity fix
 * (PR #405) into a retention surface with a calm, non-gating Pro teaser.
 * These tests pin:
 *  - the streak math (logged today, consecutive days, streak survives until a
 *    full missed day);
 *  - teaser eligibility (free plan + real history only, never for paid);
 *  - teaser copy stays calm (banned-marketing-word free) and never gates data;
 *  - the marker is wired into PlantDetail and its loader stays read-only with
 *    a "diary_entries"-prefixed query key (so the QuickLog post-save refresh
 *    invalidates it for free).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildPlantLogStreakView,
  PLANT_LOG_TEASER_COPY,
  PLANT_LOG_TEASER_MIN_DAYS,
} from "@/lib/plantLogStreakRules";
import { paywallCtaHasBannedWords } from "@/lib/paywallCtaViewModel";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

// Fixed clock: 2026-07-21T12:00:00Z (tests run under TZ=UTC).
const NOW = Date.parse("2026-07-21T12:00:00Z");
const day = (offset: number, hour = 9) =>
  new Date(NOW - offset * 86_400_000 + (hour - 12) * 3_600_000).toISOString();

describe("buildPlantLogStreakView — streak math", () => {
  it("empty input → no logs yet, zero streak, no teaser", () => {
    const v = buildPlantLogStreakView({ entryAts: [], now: NOW, isFreePlan: true });
    expect(v.hasAny).toBe(false);
    expect(v.loggedToday).toBe(false);
    expect(v.streakDays).toBe(0);
    expect(v.statusLabel).toBe("No logs yet");
    expect(v.teaser.show).toBe(false);
  });

  it("entry today → logged today; single day shows no streak label", () => {
    const v = buildPlantLogStreakView({
      entryAts: [day(0)],
      now: NOW,
      isFreePlan: false,
    });
    expect(v.loggedToday).toBe(true);
    expect(v.statusLabel).toBe("Logged today");
    expect(v.streakDays).toBe(1);
    expect(v.streakLabel).toBeNull();
  });

  it("three consecutive days ending today → 3-day streak", () => {
    const v = buildPlantLogStreakView({
      entryAts: [day(0), day(1), day(2)],
      now: NOW,
      isFreePlan: false,
    });
    expect(v.streakDays).toBe(3);
    expect(v.streakLabel).toBe("3-day streak");
  });

  it("streak survives when today has no entry yet (anchored on yesterday)", () => {
    const v = buildPlantLogStreakView({
      entryAts: [day(1), day(2)],
      now: NOW,
      isFreePlan: false,
    });
    expect(v.loggedToday).toBe(false);
    expect(v.statusLabel).toBe("No log yet today");
    expect(v.streakDays).toBe(2);
  });

  it("a fully missed day breaks the streak", () => {
    const v = buildPlantLogStreakView({
      entryAts: [day(2), day(3)],
      now: NOW,
      isFreePlan: false,
    });
    expect(v.streakDays).toBe(0);
    expect(v.streakLabel).toBeNull();
  });

  it("multiple entries in one day count as one streak day", () => {
    const v = buildPlantLogStreakView({
      entryAts: [day(0, 8), day(0, 20), day(1)],
      now: NOW,
      isFreePlan: false,
    });
    expect(v.streakDays).toBe(2);
    expect(v.daysLoggedInWindow).toBe(2);
  });

  it("ignores invalid / null timestamps instead of crashing or counting them", () => {
    const v = buildPlantLogStreakView({
      entryAts: [null, undefined, "not-a-date", day(0)],
      now: NOW,
      isFreePlan: true,
    });
    expect(v.daysLoggedInWindow).toBe(1);
    expect(v.loggedToday).toBe(true);
  });
});

describe("buildPlantLogStreakView — teaser eligibility", () => {
  const threeDays = [day(0), day(1), day(2)];

  it("shows for free plans once real history exists", () => {
    const v = buildPlantLogStreakView({
      entryAts: threeDays,
      now: NOW,
      isFreePlan: true,
    });
    expect(v.daysLoggedInWindow).toBeGreaterThanOrEqual(PLANT_LOG_TEASER_MIN_DAYS);
    expect(v.teaser.show).toBe(true);
    expect(v.teaser.href).toBe("/pricing");
  });

  it("never shows for paid plans", () => {
    const v = buildPlantLogStreakView({
      entryAts: threeDays,
      now: NOW,
      isFreePlan: false,
    });
    expect(v.teaser.show).toBe(false);
  });

  it("never shows before the history threshold (no pestering new growers)", () => {
    const v = buildPlantLogStreakView({
      entryAts: [day(0)],
      now: NOW,
      isFreePlan: true,
    });
    expect(v.teaser.show).toBe(false);
  });

  it("teaser copy is calm — no banned marketing words", () => {
    expect(paywallCtaHasBannedWords(PLANT_LOG_TEASER_COPY)).toBe(false);
  });
});

describe("wiring guardrails", () => {
  const MARKER = read("src/components/PlantLogStreakMarker.tsx");
  const HOOK = read("src/hooks/usePlantLogDays.ts");
  const PLANT_DETAIL = read("src/pages/PlantDetail.tsx");

  it("PlantDetail mounts the marker with the plant id", () => {
    expect(PLANT_DETAIL).toMatch(/<PlantLogStreakMarker\s+plantId=\{plant\.id\}\s*\/>/);
  });

  it("loader is read-only and keyed under diary_entries for free invalidation", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']diary_entries["']\s*\)/);
    expect(HOOK).toMatch(/queryKey:\s*\["diary_entries",\s*"plant_log_days"/);
    expect(HOOK).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
  });

  it("marker fails toward NOT teasing while the plan is unresolved", () => {
    expect(MARKER).toMatch(/!entitlementLoading\s*&&\s*entitlement\.effectivePlanId\s*===\s*"free"/);
  });

  it("marker never hides data — teaser is additive copy with a /pricing link only", () => {
    expect(MARKER).not.toMatch(/return null;?\s*\/\/.*teaser/i);
    expect(MARKER).toMatch(/plant-log-streak-teaser/);
    expect(MARKER).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(|functions\.invoke/);
  });
});
