/**
 * Static checks for the Plant Detail Daily Grow Check visual hierarchy
 * polish. No new logic — confirms grouping, ordering, and that key
 * test IDs were preserved across the refactor.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const PLANT_DETAIL = readFileSync(
  resolve(__dirname, "../pages/PlantDetail.tsx"),
  "utf-8",
);
const HISTORY = readFileSync(
  resolve(__dirname, "../components/PlantDailyGrowCheckHistoryCard.tsx"),
  "utf-8",
);
const CONSISTENCY = readFileSync(
  resolve(__dirname, "../components/PlantDailyGrowCheckConsistencyCard.tsx"),
  "utf-8",
);

describe("Plant Detail · Daily Grow Check section grouping", () => {
  it("wraps the Daily Grow Check cards in a labeled section", () => {
    expect(PLANT_DETAIL).toContain('data-testid="plant-daily-grow-check-section"');
    expect(PLANT_DETAIL).toContain('id="plant-daily-grow-check-section-heading"');
    expect(PLANT_DETAIL).toContain('aria-labelledby="plant-daily-grow-check-section-heading"');
  });

  it("places today's status (Consistency) before History inside the section", () => {
    const consIdx = PLANT_DETAIL.indexOf("PlantDailyGrowCheckConsistencyCard");
    const histIdx = PLANT_DETAIL.indexOf("PlantDailyGrowCheckHistoryCard\n", 0) >= 0
      ? PLANT_DETAIL.indexOf("PlantDailyGrowCheckHistoryCard\n")
      : PLANT_DETAIL.indexOf("PlantDailyGrowCheckHistoryCard");
    expect(consIdx).toBeGreaterThan(-1);
    expect(histIdx).toBeGreaterThan(-1);
    expect(consIdx).toBeLessThan(histIdx);
  });

  it("preserves key Daily Grow Check test IDs after the polish", () => {
    const required = [
      "plant-daily-grow-check-history",
      "plant-daily-grow-check-history-rows",
      "plant-daily-grow-check-history-onboarding",
      "plant-daily-grow-check-recent-activity-cue",
      "plant-daily-grow-check-consistency",
      "plant-daily-grow-check-consistency-cta",
      "plant-daily-grow-check-guidance",
      "plant-daily-grow-check-method-breakdown",
    ];
    const combined = `${HISTORY}\n${CONSISTENCY}`;
    for (const id of required) {
      expect(combined).toContain(id);
    }
  });

  it("does not introduce forbidden celebratory/health copy in the section", () => {
    const banned = ["healthy", "perfect", "complete", "completed", "success", "successful"];
    // Restrict to the section block only.
    const start = PLANT_DETAIL.indexOf('data-testid="plant-daily-grow-check-section"');
    const end = PLANT_DETAIL.indexOf("</section>", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const section = PLANT_DETAIL.slice(start, end).toLowerCase();
    for (const term of banned) {
      expect(section).not.toContain(term);
    }
  });

  it("section uses mobile-friendly stacked spacing (space-y-*)", () => {
    const start = PLANT_DETAIL.indexOf('data-testid="plant-daily-grow-check-section"');
    const end = PLANT_DETAIL.indexOf("</section>", start);
    const section = PLANT_DETAIL.slice(start, end);
    expect(section).toMatch(/space-y-\d/);
  });

  it("does not add Supabase writes, action_queue, alerts, automation, AI Coach, or device control in the section block", () => {
    const start = PLANT_DETAIL.indexOf('data-testid="plant-daily-grow-check-section"');
    const end = PLANT_DETAIL.indexOf("</section>", start);
    const section = PLANT_DETAIL.slice(start, end).toLowerCase();
    for (const term of [
      ".insert(",
      ".update(",
      ".delete(",
      ".upsert(",
      "action_queue",
      "ai-coach",
      "ai_coach",
      "mqtt",
      "home_assistant",
      "service_role",
      "device_command",
    ]) {
      expect(section).not.toContain(term);
    }
  });
});
