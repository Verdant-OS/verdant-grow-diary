/**
 * Tests for the Daily Grow Check recent-activity confirmation cue helper.
 *
 * Pure, deterministic, no I/O. The cue is factual only — it must never
 * claim health, completion, or success.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  getDailyGrowCheckRecentActivityCue,
  RECENT_ACTIVITY_CUE_LABEL,
  RECENT_ACTIVITY_CUE_DETAIL_PREFIX,
} from "@/lib/dailyGrowCheckGuidanceRules";

describe("getDailyGrowCheckRecentActivityCue", () => {
  it("does not show when today has no activity", () => {
    const cue = getDailyGrowCheckRecentActivityCue({
      todayHasActivity: false,
      latestAt: null,
    });
    expect(cue.shouldShow).toBe(false);
    expect(cue.detail).toBeNull();
  });

  it("does not show when older activity exists but today is unchecked", () => {
    // Caller derives todayHasActivity from rows[0]; older days are not
    // forwarded to this helper. Same shape — should remain hidden.
    const cue = getDailyGrowCheckRecentActivityCue({
      todayHasActivity: false,
      latestAt: new Date(2026, 4, 20, 9, 30).toISOString(),
    });
    expect(cue.shouldShow).toBe(false);
  });

  it("shows factual label + time detail when today has activity", () => {
    const cue = getDailyGrowCheckRecentActivityCue({
      todayHasActivity: true,
      latestAt: new Date(2026, 4, 24, 14, 5).toISOString(),
    });
    expect(cue.shouldShow).toBe(true);
    expect(cue.label).toBe(RECENT_ACTIVITY_CUE_LABEL);
    expect(cue.detail).toMatch(new RegExp(`^${RECENT_ACTIVITY_CUE_DETAIL_PREFIX} \\d{1,2}:\\d{2} (AM|PM)$`));
  });

  it("omits detail when latestAt is missing or invalid", () => {
    expect(
      getDailyGrowCheckRecentActivityCue({ todayHasActivity: true, latestAt: null }).detail,
    ).toBeNull();
    expect(
      getDailyGrowCheckRecentActivityCue({ todayHasActivity: true, latestAt: "not-a-date" })
        .detail,
    ).toBeNull();
  });

  it("uses cautious, factual language — never health/success/completion", () => {
    const cue = getDailyGrowCheckRecentActivityCue({
      todayHasActivity: true,
      latestAt: new Date().toISOString(),
    });
    const text = `${cue.label} ${cue.detail ?? ""}`.toLowerCase();
    for (const banned of ["healthy", "perfect", "complete", "completed", "success", "successful", "great job"]) {
      expect(text).not.toContain(banned);
    }
  });
});

describe("PlantDailyGrowCheckHistoryCard · static safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../components/PlantDailyGrowCheckHistoryCard.tsx"),
    "utf-8",
  );

  it("wires the recent-activity cue helper rather than duplicating logic", () => {
    expect(src).toContain("getDailyGrowCheckRecentActivityCue");
    expect(src).toContain("plant-daily-grow-check-recent-activity-cue");
  });

  it("does not add Supabase writes, action_queue, alerts, automation, or device control", () => {
    const forbidden = [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "action_queue",
      "alerts",
      "ai-coach",
      "ai_coach",
      "mqtt",
      "home_assistant",
      "service_role",
      "device_command",
    ];
    for (const term of forbidden) {
      expect(src.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it("does not contain forbidden celebratory/health copy", () => {
    const lower = src.toLowerCase();
    for (const banned of ["healthy", "perfect", "complete", "completed", "success", "successful"]) {
      expect(lower).not.toContain(banned);
    }
  });
});

describe("dailyGrowCheckGuidanceRules · helper purity", () => {
  it("recent-activity cue helper is deterministic for identical inputs", () => {
    const a = getDailyGrowCheckRecentActivityCue({
      todayHasActivity: true,
      latestAt: new Date(2026, 4, 24, 9, 7).toISOString(),
    });
    const b = getDailyGrowCheckRecentActivityCue({
      todayHasActivity: true,
      latestAt: new Date(2026, 4, 24, 9, 7).toISOString(),
    });
    expect(a).toEqual(b);
  });
});
