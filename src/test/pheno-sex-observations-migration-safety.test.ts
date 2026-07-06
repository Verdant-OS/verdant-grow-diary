/**
 * pheno-sex-observations-migration-safety
 *
 * Static assertions over the append-only sex/herm observation log: immutable
 * rows, user-scoped + candidate-consistent inserts, the four-value sex CHECK,
 * and no auto-cull / device machinery in the schema.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260706183000_pheno_sex_observations_foundation.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("pheno_sex_observations migration safety", () => {
  const sql = read(MIGRATION);

  it("creates the table and enables row level security", () => {
    expect(sql).toMatch(/CREATE TABLE public\.pheno_sex_observations/);
    expect(sql).toMatch(/ALTER TABLE public\.pheno_sex_observations ENABLE ROW LEVEL SECURITY/);
  });

  it("constrains sex to exactly female/male/hermaphrodite/unknown", () => {
    expect(sql).toMatch(/CHECK \(sex IN \('female', 'male', 'hermaphrodite', 'unknown'\)\)/);
  });

  it("is APPEND-ONLY: authenticated granted only SELECT + INSERT", () => {
    const grant = sql.match(/GRANT ([^;]*) ON public\.pheno_sex_observations TO authenticated/);
    expect(grant, "authenticated grant present").toBeTruthy();
    const cols = grant![1].toUpperCase();
    expect(cols).toMatch(/SELECT/);
    expect(cols).toMatch(/INSERT/);
    expect(cols).not.toMatch(/UPDATE/);
    expect(cols).not.toMatch(/DELETE/);
    expect(cols).not.toMatch(/ALL/);
  });

  it("has NO update or delete policy (immutable log)", () => {
    expect(sql).not.toMatch(/FOR UPDATE/i);
    expect(sql).not.toMatch(/FOR DELETE/i);
  });

  it("grants nothing to anon/public", () => {
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_sex_observations TO anon/i);
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_sex_observations TO public/i);
  });

  it("scopes SELECT to owner and INSERT to owner + hunt + plant + consistency", () => {
    expect(sql).toMatch(/_select_own[\s\S]*?FOR SELECT[\s\S]*?USING \(auth\.uid\(\) = user_id\)/);
    const m = sql.match(/_insert_own[\s\S]*?WITH CHECK \(([\s\S]*?)\);/);
    expect(m, "insert WITH CHECK present").toBeTruthy();
    const check = m![1];
    expect(check).toMatch(/auth\.uid\(\) = user_id/);
    expect(check).toMatch(/pheno_hunts h[\s\S]*?h\.user_id = auth\.uid\(\)/);
    expect(check).toMatch(/plants p[\s\S]*?p\.user_id = auth\.uid\(\)/);
    expect(check).toMatch(/p\.pheno_hunt_id = hunt_id/);
  });

  it("has no auto-cull / plant-delete / device machinery in the schema", () => {
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(/delete\s+from\s+public\.plants/);
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|target_device|device_command|mqtt/,
    );
  });
});
