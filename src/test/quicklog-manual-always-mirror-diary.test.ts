/**
 * QuickLog manual save — always-mirror-to-diary regression guard.
 *
 * Bug: quicklog_save_manual only wrote the diary_entries mirror when p_details
 * was non-null, so plain notes/waterings landed ONLY in grow_events. The plant
 * Recent Activity panel + quick-status strip read diary_entries via
 * usePlantRecentActivity, so a simple note showed on the grow Timeline but the
 * plant's own page said "No updates yet".
 *
 * These static assertions pin the fix at the SQL write seam so a future
 * migration edit can't silently reintroduce the conditional mirror:
 *   - the newest quicklog_save_manual definition inserts diary_entries
 *     UNCONDITIONALLY (no `IF p_details IS NOT NULL` gate around the insert);
 *   - the mirror tags details with grow_event_id so mergeTimelineSources dedups
 *     it against the spine grow_events row (no double-show on the Timeline);
 *   - the auth-rebind key stripping is preserved.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

/** Newest migration file that (re)defines quicklog_save_manual. */
function latestSaveManualMigration(): string {
  const files = readdirSync(MIG_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort();
  let latest = "";
  for (const n of files) {
    const sql = readFileSync(join(MIG_DIR, n), "utf8");
    if (/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.quicklog_save_manual/i.test(sql)) {
      latest = sql;
    }
  }
  return latest;
}

/** Body of the quicklog_save_manual definition inside the given migration SQL. */
function saveManualBody(sql: string): string {
  const start = sql.search(
    /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.quicklog_save_manual/i,
  );
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start);
}

describe("quicklog_save_manual — unconditional diary mirror", () => {
  const sql = latestSaveManualMigration();

  it("a migration defines quicklog_save_manual", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("inserts diary_entries without gating on p_details", () => {
    const body = saveManualBody(sql);
    // The diary insert must be present...
    const diaryInsertIdx = body.search(/INSERT\s+INTO\s+public\.diary_entries/i);
    expect(diaryInsertIdx).toBeGreaterThan(-1);
    // ...and must NOT sit under an `IF p_details IS NOT NULL THEN` gate.
    // (The only remaining p_details reference is the type-validation guard
    // near the top, which returns before any write.)
    const conditionalDiary =
      /IF\s+p_details\s+IS\s+NOT\s+NULL\s+THEN[\s\S]*?INSERT\s+INTO\s+public\.diary_entries/i;
    expect(conditionalDiary.test(body)).toBe(false);
  });

  it("tags the diary mirror with grow_event_id for Timeline dedup", () => {
    const body = saveManualBody(sql);
    expect(body).toMatch(/jsonb_build_object\(\s*'grow_event_id'\s*,\s*v_parent_event\s*\)/i);
  });

  it("still strips auth-rebind keys from persisted details", () => {
    const body = saveManualBody(sql);
    for (const key of ["user_id", "grow_id", "tent_id", "plant_id", "auth_uid"]) {
      expect(body).toMatch(new RegExp(`-\\s*'${key}'`));
    }
  });

  it("returns the diary_entry_id in the success envelope", () => {
    const body = saveManualBody(sql);
    expect(body).toMatch(/'diary_entry_id'\s*,\s*v_diary_id/);
  });
});

describe("usePlantRecentActivity — canonical diary read is documented", () => {
  const HOOK = readFileSync(
    resolve(ROOT, "src/hooks/usePlantRecentActivity.ts"),
    "utf8",
  );

  it("reads diary_entries (the canonical plant-activity log)", () => {
    expect(HOOK).toMatch(/\.from\(\s*["']diary_entries["']\s*\)/);
  });

  it("documents that quicklog_save_manual mirrors every save here", () => {
    expect(HOOK).toMatch(/quicklog_save_manual/);
    expect(HOOK).toMatch(/canonical/i);
  });
});
