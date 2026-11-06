import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const RELATIVE = "supabase/migrations/20261106021000_csv_import_batch_undo.sql";
const SQL = readFileSync(resolve(ROOT, RELATIVE), "utf8");
const NORMALIZED = SQL.replace(/\s+/g, " ").trim().toLowerCase();

describe("csv import batch undo migration", () => {
  it("creates the guarded undo_csv_sensor_import_batch RPC", () => {
    expect(NORMALIZED).toMatch(
      /create or replace function public\.undo_csv_sensor_import_batch\(\s*p_tent_id uuid,\s*p_import_batch_id text\s*\)/,
    );
    expect(NORMALIZED).toContain("security definer");
    expect(NORMALIZED).toContain("set search_path = public");
  });

  it("requires auth.uid and tent ownership", () => {
    expect(NORMALIZED).toMatch(/uid uuid := auth\.uid\(\)/);
    expect(NORMALIZED).toMatch(/if uid is null then/);
    expect(NORMALIZED).toMatch(/where t\.id = p_tent_id and t\.user_id = uid/);
  });

  it("deletes only csv rows belonging to one batch in the selected tent", () => {
    expect(NORMALIZED).toMatch(/delete from public\.sensor_readings r/);
    expect(NORMALIZED).toMatch(/r\.user_id = uid/);
    expect(NORMALIZED).toMatch(/r\.tent_id = p_tent_id/);
    expect(NORMALIZED).toMatch(/r\.source = 'csv'/);
    expect(NORMALIZED).toMatch(/coalesce\(r\.raw_payload ->> 'csv_import', ''\) = 'true'/);
    expect(NORMALIZED).toMatch(/r\.raw_payload ->> 'import_batch_id' = v_batch_id/);
  });

  it("grants execute to authenticated callers without exposing PUBLIC/anon", () => {
    expect(NORMALIZED).toContain(
      "revoke all on function public.undo_csv_sensor_import_batch(uuid, text) from public, anon",
    );
    expect(NORMALIZED).toContain(
      "grant execute on function public.undo_csv_sensor_import_batch(uuid, text) to authenticated",
    );
  });
});
