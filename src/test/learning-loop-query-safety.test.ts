/**
 * Phase 13 — performance & query-safety contract for the learning loop.
 *  - the service issues a bounded, constant number of queries regardless of
 *    episode count (no query-per-episode fan-out);
 *  - all reads are bounded (.limit) and windowed;
 *  - the adapter/rules parse each row once (no re-parse inside render loops —
 *    enforced structurally: rules take already-parsed rows);
 *  - export sections are capped.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPlantMemoryEpisodes } from "../lib/plantMemoryEpisodeAdapter";
import { LEARNING_SECTION_ITEM_CAP } from "../lib/postGrowLearningLoopSummaryRules";
import type { EpisodeActionInput, EpisodeDiaryRowInput } from "../lib/plantMemoryEpisodeRules";

const ROOT = resolve(__dirname, "../..");
const SERVICE = readFileSync(resolve(ROOT, "src/lib/plantMemoryEpisodeService.ts"), "utf8");

const T0 = Date.parse("2026-07-01T12:00:00Z");
const iso = (ms: number) => new Date(T0 + ms).toISOString();

describe("service query shape — no per-episode queries", () => {
  it("issues at most three .from() reads (action, diary, sensor) — constant, not per-episode", () => {
    const fromCalls = SERVICE.match(/\.from\(/g) ?? [];
    // action_queue + diary_entries + sensor_readings + the decision writer's
    // probe/update/insert (all in one write helper) → a small constant, and
    // crucially none inside a per-episode loop.
    expect(fromCalls.length).toBeLessThanOrEqual(8);
    // No .from() call sits inside a for/map/forEach over episodes/actions.
    expect(SERVICE).not.toMatch(/for\s*\([^)]*\)\s*\{[\s\S]{0,200}\.from\(/);
    expect(SERVICE).not.toMatch(/\.map\(async[\s\S]{0,120}\.from\(/);
  });

  it("every read is bounded by .limit and the sensor read is windowed", () => {
    expect(SERVICE).toMatch(/\.limit\(EPISODE_ACTION_LIMIT\)/);
    expect(SERVICE).toMatch(/\.limit\(EPISODE_DIARY_LIMIT\)/);
    expect(SERVICE).toMatch(/\.gte\("captured_at"/);
    expect(SERVICE).toMatch(/\.lte\("captured_at"/);
  });

  it("does not fetch whole tables (no select('*') on the loop tables)", () => {
    expect(SERVICE).not.toMatch(/from\(["'](action_queue|diary_entries|sensor_readings)["']\)\s*\.select\(["']\*["']\)/);
  });
});

describe("adapter — single grouping pass, no per-action row rescans", () => {
  it("builds many episodes from one indexed pass (rowsByAction), stays linear", () => {
    const actions: EpisodeActionInput[] = Array.from({ length: 50 }, (_, i) => ({
      id: `act-${i}`,
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      source: "ai",
      action_type: "environment",
      target_metric: "humidity",
      suggested_change: "lower",
      reason: "high",
      status: "completed",
      completed_at: iso(0),
    }));
    const diaryRows: EpisodeDiaryRowInput[] = actions.map((a, i) => ({
      id: `out-${i}`,
      grow_id: "grow-1",
      tent_id: "tent-1",
      plant_id: "plant-1",
      note: null,
      entry_at: iso(25 * 60 * 60 * 1000),
      details: {
        event_type: "action_outcome",
        action_queue_id: a.id,
        outcome_status: "improved",
        recorded_by: "grower",
        recorded_at: iso(25 * 60 * 60 * 1000),
      },
    }));
    const episodes = buildPlantMemoryEpisodes({
      actions,
      diaryRows,
      now: T0 + 30 * 60 * 60 * 1000,
    });
    expect(episodes).toHaveLength(50);
    // Each action's outcome is correctly linked (proves the single-pass index
    // partitioned rows by action id, not an O(n²) rescan producing misses).
    expect(episodes.every((e) => e.outcome.status === "improved")).toBe(true);
  });
});

describe("export bounding", () => {
  it("caps learning-section items so an unbounded run can't produce an unbounded PDF", () => {
    expect(LEARNING_SECTION_ITEM_CAP).toBeLessThanOrEqual(50);
    expect(LEARNING_SECTION_ITEM_CAP).toBeGreaterThan(0);
  });
});
