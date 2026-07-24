/**
 * QuickLog manual save — always-mirror-to-diary regression guard (deploy lineage).
 *
 * History of the mirror gate:
 *   20260611…       — mirrored only when p_details was non-null.
 *   20260722100000  — widened to (p_details OR v_stage) for the stage fix.
 *   20260723000000  — UNCONDITIONAL: every successful save leaves a
 *                     diary_entries companion row, so the plant-scoped read
 *                     surfaces (PlantQuickStatusStrip / Recent Activity via
 *                     usePlantRecentActivity) always see the save.
 *
 * These assertions pin the fix at the SQL seam so a future migration can't
 * silently reintroduce a conditional mirror, and pin the restored
 * linked_grow_event_id tag that mergeTimelineSources needs to dedup the mirror
 * against its grow_events spine row (the 20260722 stage migrations had
 * dropped it).
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
    if (/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual/i.test(sql)) {
      latest = sql;
    }
  }
  return latest;
}

function saveManualBody(sql: string): string {
  const start = sql.search(
    /CREATE\s+(OR\s+REPLACE\s+)?FUNCTION\s+public\.quicklog_save_manual/i,
  );
  expect(start).toBeGreaterThan(-1);
  return sql.slice(start);
}

describe("quicklog_save_manual — unconditional diary mirror", () => {
  const sql = latestSaveManualMigration();

  it("a migration defines quicklog_save_manual", () => {
    expect(sql.length).toBeGreaterThan(0);
  });

  it("inserts diary_entries without gating on p_details or v_stage", () => {
    const body = saveManualBody(sql);
    const diaryInsertIdx = body.search(/INSERT\s+INTO\s+public\.diary_entries/i);
    expect(diaryInsertIdx).toBeGreaterThan(-1);
    // Neither historical gate form may wrap the diary insert.
    expect(
      /IF\s+p_details\s+IS\s+NOT\s+NULL\s+THEN[\s\S]*?INSERT\s+INTO\s+public\.diary_entries/i.test(
        body,
      ),
    ).toBe(false);
    expect(
      /IF\s+p_details\s+IS\s+NOT\s+NULL\s+OR\s+v_stage\s+IS\s+NOT\s+NULL\s+THEN[\s\S]*?INSERT\s+INTO\s+public\.diary_entries/i.test(
        body,
      ),
    ).toBe(false);
  });

  it("tags the mirror with linked_grow_event_id for merged-timeline dedup", () => {
    const body = saveManualBody(sql);
    expect(body).toMatch(
      /jsonb_build_object\(\s*'linked_grow_event_id'\s*,\s*v_parent_event\s*\)/i,
    );
  });

  it("still persists the soft-validated stage onto the diary row", () => {
    const body = saveManualBody(sql);
    expect(body).toMatch(/note, details, entry_at, stage\)/);
    expect(body).toMatch(/v_diary_note, v_safe_details, v_occurred, v_stage\)/);
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
