/**
 * pheno-clones-crosses-migration-safety
 *
 * Static assertions over the pheno_keeper_clones and pheno_crosses migrations.
 * These anchor on pheno_keepers (not hunt candidates), so ownership is via the
 * referenced keeper(s). Data-only / record-only: no automation machinery.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

const CLONES = "supabase/migrations/20260706190000_pheno_keeper_clones_foundation.sql";
const CROSSES = "supabase/migrations/20260706191500_pheno_crosses_foundation.sql";

function sharedChecks(table: string, sql: string) {
  expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`));
  expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  expect(sql).toMatch(new RegExp(`GRANT[^;]*ON public\\.${table} TO authenticated`));
  expect(sql).not.toMatch(new RegExp(`GRANT[^;]*ON public\\.${table} TO anon`, "i"));
  expect(sql).not.toMatch(new RegExp(`GRANT[^;]*ON public\\.${table} TO public`, "i"));
  expect(sql).toMatch(
    new RegExp(`${table}_select_own[\\s\\S]*?USING \\(auth\\.uid\\(\\) = user_id\\)`),
  );
  expect(sql).toMatch(
    new RegExp(`${table}_delete_own[\\s\\S]*?USING \\(auth\\.uid\\(\\) = user_id\\)`),
  );
  expect(sql).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
  const lower = sql.toLowerCase();
  expect(lower).not.toMatch(
    /device[_-]?control|automation|autopilot|target_device|device_command|mqtt/,
  );
  expect(lower).not.toMatch(/\bwinner\b|\bbest[_\s]pheno\b/);
}

describe("pheno_keeper_clones migration safety", () => {
  const sql = read(CLONES);

  it("is private, user-scoped, and data-only", () => sharedChecks("pheno_keeper_clones", sql));

  it("owns the keeper, same-keeper parent, and clone plant on write", () => {
    for (const policy of ["insert_own", "update_own"]) {
      const m = sql.match(
        new RegExp(`pheno_keeper_clones_${policy}[\\s\\S]*?WITH CHECK \\(([\\s\\S]*?)\\);`),
      );
      expect(m, `${policy} present`).toBeTruthy();
      const check = m![1];
      expect(check).toMatch(/auth\.uid\(\) = user_id/);
      expect(check).toMatch(/pheno_keepers k[\s\S]*?k\.user_id = auth\.uid\(\)/);
      // parent clone (if set) must be owned AND share the same keeper
      expect(check).toMatch(
        /parent_clone_id IS NULL OR EXISTS[\s\S]*?c\.user_id = auth\.uid\(\)[\s\S]*?c\.keeper_id = keeper_id/,
      );
      // clone plant (if set) must be owned
      expect(check).toMatch(/clone_plant_id IS NULL OR EXISTS[\s\S]*?p\.user_id = auth\.uid\(\)/);
    }
  });

  it("keeps one clone label per keeper and a self-referential parent", () => {
    expect(sql).toMatch(/parent_clone_id uuid REFERENCES public\.pheno_keeper_clones\(id\)/);
    expect(sql).toMatch(/UNIQUE \(keeper_id, clone_label\)/);
  });
});

describe("pheno_crosses migration safety", () => {
  const sql = read(CROSSES);

  it("is private, user-scoped, and record-only", () => sharedChecks("pheno_crosses", sql));

  it("requires DISTINCT female + male keeper parents, both owned", () => {
    expect(sql).toMatch(/CHECK \(female_keeper_id <> male_keeper_id\)/);
    for (const policy of ["insert_own", "update_own"]) {
      const m = sql.match(
        new RegExp(`pheno_crosses_${policy}[\\s\\S]*?WITH CHECK \\(([\\s\\S]*?)\\);`),
      );
      expect(m, `${policy} present`).toBeTruthy();
      const check = m![1];
      expect(check).toMatch(
        /pheno_keepers f[\s\S]*?f\.id = female_keeper_id[\s\S]*?f\.user_id = auth\.uid\(\)/,
      );
      expect(check).toMatch(
        /pheno_keepers m[\s\S]*?m\.id = male_keeper_id[\s\S]*?m\.user_id = auth\.uid\(\)/,
      );
      // hunt (if set) must be owned
      expect(check).toMatch(/hunt_id IS NULL OR EXISTS[\s\S]*?h\.user_id = auth\.uid\(\)/);
    }
  });
});
