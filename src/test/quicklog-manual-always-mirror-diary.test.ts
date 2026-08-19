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

const MANUAL_TYPE_SIGNATURE = [
  "text",
  "uuid",
  "text",
  "numeric",
  "text",
  "numeric",
  "numeric",
  "numeric",
  "timestamptz",
  "jsonb",
  "text",
  "text",
].join("\\s*,\\s*");
const MANUAL_NAMED_SIGNATURE = [
  ["p_target_type", "text"],
  ["p_target_id", "uuid"],
  ["p_action", "text"],
  ["p_volume_ml", "numeric"],
  ["p_note", "text"],
  ["p_temperature_c", "numeric"],
  ["p_humidity_pct", "numeric"],
  ["p_vpd_kpa", "numeric"],
  ["p_occurred_at", "(?:timestamptz|timestamp\\s+with\\s+time\\s+zone)"],
  ["p_details", "jsonb"],
  ["p_idempotency_key", "text"],
  ["p_stage", "text"],
]
  .map(([name, type]) => `${name}\\s+${type}(?:\\s+DEFAULT\\s+[^,)]*)?`)
  .join("\\s*,\\s*");

const manualDefinitionPattern = () =>
  new RegExp(
    `CREATE\\s+(?:OR\\s+REPLACE\\s+)?FUNCTION\\s+public\\.quicklog_save_manual\\s*\\(\\s*${MANUAL_NAMED_SIGNATURE}\\s*\\)\\s*RETURNS\\s+jsonb[\\s\\S]*?AS\\s+(\\$function\\$|\\$\\$)([\\s\\S]*?)\\1`,
    "i",
  );
const manualDelegateDefinitionPattern = () =>
  new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.(?:"quicklog_save_manual_pre_logged_at"|quicklog_save_manual_pre_logged_at)\\s*\\(\\s*${MANUAL_NAMED_SIGNATURE}\\s*\\)\\s*RETURNS\\s+jsonb[\\s\\S]*?AS\\s+(\\$function\\$|\\$\\$)([\\s\\S]*?)\\1`,
    "i",
  );
const manualDelegateRenamePattern = () =>
  new RegExp(
    `ALTER\\s+FUNCTION\\s+public\\.quicklog_save_manual\\s*\\(\\s*${MANUAL_TYPE_SIGNATURE}\\s*\\)\\s+RENAME\\s+TO\\s+quicklog_save_manual_pre_logged_at`,
    "i",
  );

/**
 * Resolve the latest exact 12-argument internal implementation used by the
 * current public timestamp wrapper. A post-wrapper forward repair takes
 * precedence over the historical public implementation that was renamed.
 */
function delegatedSaveManualContract(): {
  delegateBody: string;
  wrapperSql: string;
} {
  const migrations = readdirSync(MIG_DIR)
    .filter((n) => n.endsWith(".sql"))
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIG_DIR, name), "utf8"),
    }));
  let wrapperIndex = -1;
  for (let index = migrations.length - 1; index >= 0; index -= 1) {
    const { sql } = migrations[index];
    if (manualDelegateRenamePattern().test(sql) && manualDefinitionPattern().test(sql)) {
      wrapperIndex = index;
      break;
    }
  }
  if (wrapperIndex < 1) {
    return { delegateBody: "", wrapperSql: "" };
  }

  for (let index = migrations.length - 1; index > wrapperIndex; index -= 1) {
    const match = migrations[index].sql.match(manualDelegateDefinitionPattern());
    if (match?.[2]) {
      return {
        delegateBody: match[2],
        wrapperSql: migrations[wrapperIndex].sql,
      };
    }
  }

  for (let index = wrapperIndex - 1; index >= 0; index -= 1) {
    const match = migrations[index].sql.match(manualDefinitionPattern());
    if (match?.[2]) {
      return {
        delegateBody: match[2],
        wrapperSql: migrations[wrapperIndex].sql,
      };
    }
  }
  return { delegateBody: "", wrapperSql: migrations[wrapperIndex].sql };
}

describe("quicklog_save_manual — unconditional diary mirror", () => {
  const { delegateBody: body, wrapperSql } = delegatedSaveManualContract();

  it("a migration defines quicklog_save_manual", () => {
    expect(wrapperSql).toMatch(manualDelegateRenamePattern());
    expect(body.length).toBeGreaterThan(0);
  });

  it("inserts diary_entries without gating on p_details or v_stage", () => {
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
    expect(body).toMatch(
      /jsonb_build_object\(\s*'linked_grow_event_id'\s*,\s*v_parent_event\s*\)/i,
    );
  });

  it("still persists the soft-validated stage onto the diary row", () => {
    expect(body).toMatch(/note, details, entry_at, stage\)/);
    expect(body).toMatch(/v_diary_note, v_safe_details, v_occurred, v_stage\)/);
  });

  it("still strips auth-rebind keys from persisted details", () => {
    for (const key of ["user_id", "grow_id", "tent_id", "plant_id", "auth_uid"]) {
      expect(body).toMatch(new RegExp(`-\\s*'${key}'`));
    }
  });

  it("returns the diary_entry_id in the success envelope", () => {
    expect(body).toMatch(/'diary_entry_id'\s*,\s*v_diary_id/);
  });
});
