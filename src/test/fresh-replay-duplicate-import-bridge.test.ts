import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const BRIDGE = "supabase/migrations/20260721180000_fresh_replay_duplicate_import_bridge.sql";
const sql = readFileSync(resolve(ROOT, BRIDGE), "utf8");
const QUICKLOG_BRIDGE =
  "supabase/migrations/20260722160000_fresh_replay_quicklog_stage_import_bridge.sql";
const quicklogSql = readFileSync(resolve(ROOT, QUICKLOG_BRIDGE), "utf8");

describe("fresh replay duplicate-import bridge", () => {
  it("is a new additive version ordered before the immutable imported batch", () => {
    expect(BRIDGE).toMatch(/20260721180000_/);
    expect("20260721180000" < "20260721182752").toBe(true);
    expect(sql).toContain("20260721182752");
  });

  it("no-ops only when the first imported migration is recorded", () => {
    const historyGuard = sql.indexOf("FROM supabase_migrations.schema_migrations");
    const returnIndex = sql.indexOf("RETURN;", historyGuard);
    const firstDrop = sql.indexOf("DROP CONSTRAINT");
    expect(historyGuard).toBeGreaterThan(-1);
    expect(returnIndex).toBeGreaterThan(historyGuard);
    expect(firstDrop).toBeGreaterThan(returnIndex);
    expect(sql).toMatch(/WHERE version = '20260721182752'/);
    expect(sql).not.toMatch(/WHERE version\s*(?:>=|>|<=|<)\s*'20260721182752'/);
  });

  it("aborts on data before executing any duplicate-table drop", () => {
    const countGuard = sql.indexOf("SELECT count(*) FROM %s");
    const nonEmptyAbort = sql.indexOf(
      "fresh replay bridge refused to remove a non-empty duplicate object",
    );
    const dynamicDrop = sql.indexOf("DROP TABLE %s CASCADE");
    expect(countGuard).toBeGreaterThan(-1);
    expect(nonEmptyAbort).toBeGreaterThan(countGuard);
    expect(dynamicDrop).toBeGreaterThan(nonEmptyAbort);
  });

  it("never edits or marks an imported migration as applied", () => {
    expect(sql).not.toMatch(/INSERT\s+INTO\s+supabase_migrations\.schema_migrations/i);
    expect(sql).not.toMatch(/UPDATE\s+supabase_migrations\.schema_migrations/i);
    expect(sql).not.toMatch(/DELETE\s+FROM\s+supabase_migrations\.schema_migrations/i);
  });

  it("restores the pre-import grow cascade that the immutable ledger migration validates", () => {
    expect(sql).toMatch(
      /ADD CONSTRAINT ai_credit_spends_grow_id_fkey[\s\S]*FOREIGN KEY \(grow_id\)[\s\S]*REFERENCES public\.grows\(id\)[\s\S]*ON DELETE CASCADE/,
    );
  });

  it("establishes the hardened-local ACL baseline required by the immutable revoke", () => {
    expect(sql).toMatch(
      /GRANT SELECT ON TABLE[\s\S]*public\.grow_events,[\s\S]*public\.watering_events,[\s\S]*public\.feeding_events[\s\S]*TO authenticated/,
    );
    expect(sql).toMatch(
      /GRANT ALL ON TABLE[\s\S]*public\.grow_events,[\s\S]*public\.watering_events,[\s\S]*public\.feeding_events[\s\S]*TO service_role/,
    );
  });
});

describe("fresh replay Quick Log stage import bridge", () => {
  it("is ordered between the descriptive migration and immutable import", () => {
    expect(QUICKLOG_BRIDGE).toMatch(/20260722160000_/);
    expect("20260722100000" < "20260722160000").toBe(true);
    expect("20260722160000" < "20260722165149").toBe(true);
  });

  it("no-ops only when the immutable import is recorded", () => {
    const historyGuard = quicklogSql.indexOf("FROM supabase_migrations.schema_migrations");
    const returnIndex = quicklogSql.indexOf("RETURN;", historyGuard);
    const dropIndex = quicklogSql.indexOf("DROP FUNCTION");
    expect(historyGuard).toBeGreaterThan(-1);
    expect(returnIndex).toBeGreaterThan(historyGuard);
    expect(dropIndex).toBeGreaterThan(returnIndex);
    expect(quicklogSql).toMatch(/WHERE version = '20260722165149'/);
    expect(quicklogSql).not.toMatch(/WHERE version\s*(?:>=|>|<=|<)\s*'20260722165149'/);
  });

  it("drops only the exact duplicate 12-argument overload without CASCADE", () => {
    expect(quicklogSql).toMatch(
      /DROP FUNCTION IF EXISTS public\.quicklog_save_manual\(\s*text,\s*uuid,\s*text,\s*numeric,\s*text,\s*numeric,\s*numeric,\s*numeric,\s*timestamptz,\s*jsonb,\s*text,\s*text\s*\)/,
    );
    expect(quicklogSql).not.toMatch(/\bCASCADE\b/i);
  });

  it("never edits or marks migration history as applied", () => {
    expect(quicklogSql).not.toMatch(/INSERT\s+INTO\s+supabase_migrations\.schema_migrations/i);
    expect(quicklogSql).not.toMatch(/UPDATE\s+supabase_migrations\.schema_migrations/i);
    expect(quicklogSql).not.toMatch(/DELETE\s+FROM\s+supabase_migrations\.schema_migrations/i);
  });
});
