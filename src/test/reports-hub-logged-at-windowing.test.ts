/**
 * useReportsHubData must window/order/paginate diary_entries and grow_events
 * activity by the real `logged_at` ("Captured" time) column, not entry_at /
 * occurred_at.
 *
 * Bug (Codex review, PR #442, 10 findings — all one root cause): logged_at
 * lived ONLY inside a JSON `details` blob, applied as a display overlay
 * AFTER the authoritative fetch/pagination already ran against
 * entry_at/occurred_at — so a row whose Captured time sits inside a visible
 * window but whose entry_at/occurred_at sits outside it (or vice versa) was
 * silently missed by the Reports Hub's outcome list, 7-day activity count,
 * and diary+grow_events activity merge window.
 *
 * These are static source pins (this repo's established convention for this
 * hook — see grow-activity-spine-merge.test.ts) rather than a full mocked
 * Supabase behavior test: useReportsHubData fires an 11-way Promise.all, and
 * mocking that whole shape to exercise one column swap would be
 * disproportionate. The pins below lock in the four query-shape sites named
 * in the fix so a future edit can't silently regress back to entry_at/
 * occurred_at.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stripSourceComments } from "./utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const HOOK_SRC = stripSourceComments(
  readFileSync(resolve(ROOT, "src/hooks/useReportsHubData.ts"), "utf8"),
);

describe("useReportsHubData — logged_at windowing", () => {
  it("orders the action_outcome diary query by logged_at, nulls last", () => {
    expect(HOOK_SRC).toMatch(
      /\.eq\(\s*["']details->>event_type["']\s*,\s*["']action_outcome["']\s*\)\s*\n\s*\.order\(\s*["']logged_at["']\s*,\s*\{\s*ascending:\s*false\s*,\s*nullsFirst:\s*false\s*\}\s*\)\s*\n\s*\.limit\(\s*50\s*\)/,
    );
  });

  it("windows the 7-day diary activity count by logged_at, not entry_at", () => {
    expect(HOOK_SRC).toMatch(
      /\.select\(\s*["']id["']\s*,\s*\{\s*count:\s*["']exact["']\s*,\s*head:\s*true\s*\}\s*\)\s*\n\s*\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)\s*\n\s*\.gte\(\s*["']logged_at["']\s*,\s*sevenDaysAgo\s*\)/,
    );
    expect(HOOK_SRC).not.toMatch(/\.gte\(\s*["']entry_at["']/);
  });

  it("orders the diary activity merge window by logged_at, nulls last", () => {
    expect(HOOK_SRC).toMatch(
      /\.select\(\s*["']id,plant_id,entry_at,created_at,details["']\s*\)\s*\n\s*\.eq\(\s*["']grow_id["']\s*,\s*growId\s*\)\s*\n\s*\.order\(\s*["']logged_at["']\s*,\s*\{\s*ascending:\s*false\s*,\s*nullsFirst:\s*false\s*\}\s*\)\s*\n\s*\.limit\(\s*REPORTS_HUB_ACTIVITY_MERGE_WINDOW\s*\)/,
    );
  });

  it("orders the grow_events activity merge window by logged_at, nulls last", () => {
    expect(HOOK_SRC).toMatch(
      /\.eq\(\s*["']source["']\s*,\s*["']manual["']\s*\)\s*\n\s*\.eq\(\s*["']is_deleted["']\s*,\s*false\s*\)\s*\n\s*\.order\(\s*["']logged_at["']\s*,\s*\{\s*ascending:\s*false\s*,\s*nullsFirst:\s*false\s*\}\s*\)\s*\n\s*\.limit\(\s*REPORTS_HUB_ACTIVITY_MERGE_WINDOW\s*\)/,
    );
    // Both merge-window queries must share the same logged_at ordering —
    // exactly two nullsFirst:false logged_at orders in this window pair,
    // plus the outcome-list order above (three total in the whole hook).
    const loggedAtOrders = HOOK_SRC.match(
      /\.order\(\s*["']logged_at["']\s*,\s*\{\s*ascending:\s*false\s*,\s*nullsFirst:\s*false\s*\}\s*\)/g,
    );
    expect(loggedAtOrders?.length).toBe(3);
  });

  it("stays read-only", () => {
    expect(HOOK_SRC).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(/);
  });
});
