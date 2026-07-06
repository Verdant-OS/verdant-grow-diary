/**
 * pheno-smoke-coa-migration-safety
 *
 * Static assertions over the pheno_smoke_tests and pheno_lab_results migrations:
 * private, user-scoped, candidate-consistent, honest (subjective 1-5 ranges;
 * COA source never defaulted to 'coa'), and no ranking/automation machinery.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

const TABLES: Array<{ table: string; migration: string }> = [
  {
    table: "pheno_smoke_tests",
    migration: "supabase/migrations/20260706185000_pheno_smoke_tests_foundation.sql",
  },
  {
    table: "pheno_lab_results",
    migration: "supabase/migrations/20260706185500_pheno_lab_results_foundation.sql",
  },
];

describe.each(TABLES)("$table migration safety", ({ table, migration }) => {
  const sql = read(migration);

  it("creates the table and enables RLS", () => {
    expect(sql).toMatch(new RegExp(`CREATE TABLE public\\.${table}`));
    expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${table} ENABLE ROW LEVEL SECURITY`));
  });

  it("grants only to authenticated and service_role — never anon/public", () => {
    expect(sql).toMatch(new RegExp(`GRANT[^;]*ON public\\.${table} TO authenticated`));
    expect(sql).not.toMatch(new RegExp(`GRANT[^;]*ON public\\.${table} TO anon`, "i"));
    expect(sql).not.toMatch(new RegExp(`GRANT[^;]*ON public\\.${table} TO public`, "i"));
  });

  it("scopes SELECT and DELETE to the owner via auth.uid() = user_id", () => {
    expect(sql).toMatch(
      new RegExp(
        `${table}_select_own[\\s\\S]*?FOR SELECT[\\s\\S]*?USING \\(auth\\.uid\\(\\) = user_id\\)`,
      ),
    );
    expect(sql).toMatch(
      new RegExp(
        `${table}_delete_own[\\s\\S]*?FOR DELETE[\\s\\S]*?USING \\(auth\\.uid\\(\\) = user_id\\)`,
      ),
    );
  });

  it("requires caller ownership of row, hunt, AND plant on INSERT and UPDATE", () => {
    for (const policy of ["insert_own", "update_own"]) {
      const m = sql.match(new RegExp(`${table}_${policy}[\\s\\S]*?WITH CHECK \\(([\\s\\S]*?)\\);`));
      expect(m, `${table} ${policy} WITH CHECK present`).toBeTruthy();
      const check = m![1];
      expect(check).toMatch(/auth\.uid\(\) = user_id/);
      expect(check).toMatch(/pheno_hunts h[\s\S]*?h\.user_id = auth\.uid\(\)/);
      expect(check).toMatch(/plants p[\s\S]*?p\.user_id = auth\.uid\(\)/);
      expect(check).toMatch(/p\.pheno_hunt_id = hunt_id/);
    }
  });

  it("keeps updated_at fresh and adds no ranking/automation machinery", () => {
    expect(sql).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(/\bwinner\b|\bbest[_\s]pheno\b|materialized\s+view/);
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|target_device|device_command|mqtt/,
    );
  });
});

describe("pheno_smoke_tests specifics", () => {
  const sql = read(TABLES[0].migration);
  it("clamps smoothness + potency_impression to a subjective 1-5 (nullable)", () => {
    expect(sql).toMatch(/smoothness IS NULL OR \(smoothness BETWEEN 1 AND 5\)/);
    expect(sql).toMatch(/potency_impression IS NULL OR \(potency_impression BETWEEN 1 AND 5\)/);
  });
  it("keeps flavor/effect as jsonb arrays and one smoke test per candidate", () => {
    expect(sql).toMatch(/jsonb_typeof\(flavor_descriptors\) = 'array'/);
    expect(sql).toMatch(/jsonb_typeof\(effect_descriptors\) = 'array'/);
    expect(sql).toMatch(/UNIQUE \(hunt_id, plant_id\)/);
  });
});

describe("pheno_lab_results specifics (honest COA)", () => {
  const sql = read(TABLES[1].migration);
  it("source is CHECK-constrained and defaults to 'unspecified', NEVER 'coa'", () => {
    expect(sql).toMatch(/source text NOT NULL DEFAULT 'unspecified'/);
    expect(sql).toMatch(/CHECK \(source IN \('coa', 'estimate', 'unspecified'\)\)/);
    expect(sql).not.toMatch(/source text NOT NULL DEFAULT 'coa'/);
  });
  it("lets an estimate and a COA coexist per candidate", () => {
    expect(sql).toMatch(/UNIQUE \(hunt_id, plant_id, source\)/);
    expect(sql).toMatch(/jsonb_typeof\(dominant_terpenes\) = 'array'/);
  });
});
