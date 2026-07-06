/**
 * pheno-candidate-scores-migration-safety
 *
 * Static assertions over the pheno_candidate_scores migration proving it is
 * private-by-default and user-scoped on every access path. Guards the
 * RLS operator-asymmetry invariant: trait-score rows are owner-only, never
 * readable/writable by operators or anon.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260706120000_pheno_candidate_scores_foundation.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("pheno_candidate_scores migration safety", () => {
  const sql = read(MIGRATION);

  it("creates the table and enables row level security", () => {
    expect(sql).toMatch(/CREATE TABLE public\.pheno_candidate_scores/);
    expect(sql).toMatch(/ALTER TABLE public\.pheno_candidate_scores ENABLE ROW LEVEL SECURITY/);
  });

  it("owns rows via user_id referencing auth.users with cascade delete", () => {
    expect(sql).toMatch(/user_id uuid NOT NULL REFERENCES auth\.users\(id\) ON DELETE CASCADE/);
  });

  it("grants only to authenticated and service_role — never anon/public", () => {
    expect(sql).toMatch(/GRANT[^;]*ON public\.pheno_candidate_scores TO authenticated/);
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_candidate_scores TO anon/i);
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_candidate_scores TO public/i);
  });

  it("scopes SELECT and DELETE to the owner via auth.uid() = user_id", () => {
    expect(sql).toMatch(
      /pheno_candidate_scores_select_own[\s\S]*?FOR SELECT[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
    expect(sql).toMatch(
      /pheno_candidate_scores_delete_own[\s\S]*?FOR DELETE[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
  });

  it("requires caller ownership of the row, hunt, AND plant on INSERT and UPDATE", () => {
    for (const policy of ["insert_own", "update_own"]) {
      const re = new RegExp(
        `pheno_candidate_scores_${policy}[\\s\\S]*?WITH CHECK \\(([\\s\\S]*?)\\);`,
      );
      const m = sql.match(re);
      expect(m, `${policy} WITH CHECK block present`).toBeTruthy();
      const check = m![1];
      expect(check).toMatch(/auth\.uid\(\) = user_id/);
      expect(check).toMatch(/pheno_hunts h[\s\S]*?h\.user_id = auth\.uid\(\)/);
      expect(check).toMatch(/plants p[\s\S]*?p\.user_id = auth\.uid\(\)/);
      // Plant must actually be a candidate of the hunt (no cross-hunt scoring).
      expect(check).toMatch(/p\.pheno_hunt_id = hunt_id/);
    }
  });

  it("constrains traits to a jsonb object and keeps one card per candidate", () => {
    expect(sql).toMatch(/CHECK \(jsonb_typeof\(traits\) = 'object'\)/);
    expect(sql).toMatch(/UNIQUE \(hunt_id, plant_id\)/);
  });

  it("keeps updated_at fresh via the shared trigger, adds no automation", () => {
    expect(sql).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
    expect(sql.toLowerCase()).not.toMatch(/device[_-]?control/);
    // No selection/ranking machinery baked into the schema.
    expect(sql.toLowerCase()).not.toMatch(/\bwinner\b|\bbest[_\s]pheno\b|materialized\s+view/);
  });
});
