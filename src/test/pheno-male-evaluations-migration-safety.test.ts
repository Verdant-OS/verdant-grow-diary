/**
 * pheno-male-evaluations-migration-safety
 *
 * Static assertions over the male-evaluation foundation:
 *  - pheno_male_evaluations: an updatable, owner-scoped card with a jsonb
 *    ratings object, hunt-optional but hunt-consistent inserts/updates.
 *  - pheno_pollen_viability_tests: an APPEND-ONLY, owner-scoped log (viability
 *    is a gate, and each test is immutable).
 *  - No ranking / auto-promotion / device machinery in the schema.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260709120000_pheno_male_evaluations_foundation.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

/** authenticated GRANT column list for a given table, upper-cased. */
function authGrantCols(sql: string, table: string): string {
  const m = sql.match(new RegExp(`GRANT ([^;]*) ON public\\.${table} TO authenticated`));
  expect(m, `authenticated grant present for ${table}`).toBeTruthy();
  return m![1].toUpperCase();
}

describe("pheno_male_evaluations migration safety", () => {
  const sql = read(MIGRATION);

  it("creates both tables and enables row level security on each", () => {
    expect(sql).toMatch(/CREATE TABLE public\.pheno_male_evaluations/);
    expect(sql).toMatch(/ALTER TABLE public\.pheno_male_evaluations ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/CREATE TABLE public\.pheno_pollen_viability_tests/);
    expect(sql).toMatch(
      /ALTER TABLE public\.pheno_pollen_viability_tests ENABLE ROW LEVEL SECURITY/,
    );
  });

  it("stores ratings as a jsonb object (shape enforced in the schema)", () => {
    expect(sql).toMatch(/ratings jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
    expect(sql).toMatch(/CHECK \(jsonb_typeof\(ratings\) = 'object'\)/);
  });

  it("grants full CRUD on the evaluation card (it is updatable, not append-only)", () => {
    const cols = authGrantCols(sql, "pheno_male_evaluations");
    for (const op of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
      expect(cols).toMatch(new RegExp(op));
    }
    expect(cols).not.toMatch(/\bALL\b/);
  });

  it("keeps a set_updated_at trigger on the card", () => {
    expect(sql).toMatch(
      /CREATE TRIGGER pheno_male_evaluations_set_updated_at[\s\S]*?EXECUTE FUNCTION public\.set_updated_at\(\)/,
    );
  });

  it("scopes card SELECT to owner and writes to owner + plant + optional-but-consistent hunt", () => {
    expect(sql).toMatch(
      /pheno_male_evaluations_select_own[\s\S]*?FOR SELECT[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
    for (const policy of [
      "pheno_male_evaluations_insert_own",
      "pheno_male_evaluations_update_own",
    ]) {
      const m = sql.match(new RegExp(`${policy}[\\s\\S]*?WITH CHECK \\(([\\s\\S]*?)\\);`));
      expect(m, `${policy} WITH CHECK present`).toBeTruthy();
      const check = m![1];
      expect(check).toMatch(/auth\.uid\(\) = user_id/);
      expect(check).toMatch(/plants p[\s\S]*?p\.user_id = auth\.uid\(\)/);
      // hunt is optional, but when present it must be owned AND consistent.
      expect(check).toMatch(/hunt_id IS NULL OR/);
      expect(check).toMatch(/pheno_hunts h[\s\S]*?h\.user_id = auth\.uid\(\)/);
      expect(check).toMatch(/p\.pheno_hunt_id = hunt_id/);
    }
  });

  it("viability tests are APPEND-ONLY: authenticated granted only SELECT + INSERT", () => {
    const cols = authGrantCols(sql, "pheno_pollen_viability_tests");
    expect(cols).toMatch(/SELECT/);
    expect(cols).toMatch(/INSERT/);
    expect(cols).not.toMatch(/UPDATE/);
    expect(cols).not.toMatch(/DELETE/);
    expect(cols).not.toMatch(/\bALL\b/);
  });

  it("has NO update or delete policy on the viability log (immutable)", () => {
    expect(sql).not.toMatch(/ON public\.pheno_pollen_viability_tests FOR UPDATE/i);
    expect(sql).not.toMatch(/ON public\.pheno_pollen_viability_tests FOR DELETE/i);
  });

  it("constrains viability result and germination percentage", () => {
    expect(sql).toMatch(
      /CHECK \(result IN \('viable', 'nonviable', 'inconclusive', 'untested'\)\)/,
    );
    expect(sql).toMatch(/germination_pct >= 0 AND germination_pct <= 100/);
  });

  it("scopes viability SELECT to owner and INSERT to owner + evaluation ownership", () => {
    expect(sql).toMatch(
      /pheno_pollen_viability_tests_select_own[\s\S]*?FOR SELECT[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
    const m = sql.match(
      /pheno_pollen_viability_tests_insert_own[\s\S]*?WITH CHECK \(([\s\S]*?)\);/,
    );
    expect(m, "viability insert WITH CHECK present").toBeTruthy();
    const check = m![1];
    expect(check).toMatch(/auth\.uid\(\) = user_id/);
    expect(check).toMatch(/pheno_male_evaluations e[\s\S]*?e\.user_id = auth\.uid\(\)/);
  });

  it("grants nothing to anon/public on either table", () => {
    for (const table of ["pheno_male_evaluations", "pheno_pollen_viability_tests"]) {
      expect(sql).not.toMatch(new RegExp(`GRANT[^;]*ON public\\.${table} TO anon`, "i"));
      expect(sql).not.toMatch(new RegExp(`GRANT[^;]*ON public\\.${table} TO public`, "i"));
    }
  });

  it("has no ranking / auto-promotion / plant-delete / device machinery", () => {
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(/delete\s+from\s+public\.plants/);
    expect(lower).not.toMatch(/order\s+by[\s\S]*?score/);
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|target_device|device_command|mqtt/,
    );
  });
});
