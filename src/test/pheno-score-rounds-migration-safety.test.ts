/**
 * pheno-score-rounds-migration-safety
 *
 * Static assertions over the pheno_score_rounds migration: staged/per-round
 * scoring stays private, user-scoped, candidate-consistent, and descriptive
 * (no ranking machinery, no automation).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260706180000_pheno_score_rounds_foundation.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("pheno_score_rounds migration safety", () => {
  const sql = read(MIGRATION);

  it("creates the table and enables row level security", () => {
    expect(sql).toMatch(/CREATE TABLE public\.pheno_score_rounds/);
    expect(sql).toMatch(/ALTER TABLE public\.pheno_score_rounds ENABLE ROW LEVEL SECURITY/);
  });

  it("constrains round to the five staged cull-down rounds", () => {
    expect(sql).toMatch(
      /CHECK \(round IN \('veg', 'early_flower', 'mid_flower', 'late_flower', 'post_cure'\)\)/,
    );
    // One card per (hunt, plant, round) — same plant, separate rounds.
    expect(sql).toMatch(/UNIQUE \(hunt_id, plant_id, round\)/);
  });

  it("constrains jsonb shapes (traits/loud_traits objects, aroma array)", () => {
    expect(sql).toMatch(/CHECK \(jsonb_typeof\(traits\) = 'object'\)/);
    expect(sql).toMatch(/CHECK \(jsonb_typeof\(loud_traits\) = 'object'\)/);
    expect(sql).toMatch(/CHECK \(jsonb_typeof\(aroma_descriptors\) = 'array'\)/);
  });

  it("grants only to authenticated and service_role — never anon/public", () => {
    expect(sql).toMatch(/GRANT[^;]*ON public\.pheno_score_rounds TO authenticated/);
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_score_rounds TO anon/i);
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_score_rounds TO public/i);
  });

  it("scopes SELECT and DELETE to the owner via auth.uid() = user_id", () => {
    expect(sql).toMatch(
      /pheno_score_rounds_select_own[\s\S]*?FOR SELECT[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
    expect(sql).toMatch(
      /pheno_score_rounds_delete_own[\s\S]*?FOR DELETE[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
  });

  it("requires caller ownership of row, hunt, AND plant on INSERT and UPDATE", () => {
    for (const policy of ["insert_own", "update_own"]) {
      const re = new RegExp(`pheno_score_rounds_${policy}[\\s\\S]*?WITH CHECK \\(([\\s\\S]*?)\\);`);
      const m = sql.match(re);
      expect(m, `${policy} WITH CHECK block present`).toBeTruthy();
      const check = m![1];
      expect(check).toMatch(/auth\.uid\(\) = user_id/);
      expect(check).toMatch(/pheno_hunts h[\s\S]*?h\.user_id = auth\.uid\(\)/);
      expect(check).toMatch(/plants p[\s\S]*?p\.user_id = auth\.uid\(\)/);
      expect(check).toMatch(/p\.pheno_hunt_id = hunt_id/);
    }
  });

  it("is descriptive-only: no ranking machinery, no automation, keeps updated_at trigger", () => {
    expect(sql).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(/\bwinner\b|\bbest[_\s]pheno\b|materialized\s+view/);
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|target_device|device_command|mqtt/,
    );
    expect(lower).not.toMatch(/delete\s+from\s+public\.plants/);
  });
});
