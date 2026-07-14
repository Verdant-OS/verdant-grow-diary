/**
 * pheno-keeper-decisions-migration-safety
 *
 * Static assertions over the pheno_keeper_decisions migration. Proves the
 * decision store is private, user-scoped, suggest-only (a data note — no
 * execute/automation machinery, no plant deletes), and enumerates exactly the
 * four allowed decisions.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260706121500_pheno_keeper_decisions_foundation.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("pheno_keeper_decisions migration safety", () => {
  const sql = read(MIGRATION);

  it("creates the table and enables row level security", () => {
    expect(sql).toMatch(/CREATE TABLE public\.pheno_keeper_decisions/);
    expect(sql).toMatch(/ALTER TABLE public\.pheno_keeper_decisions ENABLE ROW LEVEL SECURITY/);
  });

  it("constrains decision to exactly keep/cull/hold/undecided", () => {
    expect(sql).toMatch(/CHECK \(decision IN \('keep', 'cull', 'hold', 'undecided'\)\)/);
    expect(sql).toMatch(/decision text NOT NULL DEFAULT 'undecided'/);
  });

  it("grants only to authenticated and service_role — never anon/public", () => {
    expect(sql).toMatch(/GRANT[^;]*ON public\.pheno_keeper_decisions TO authenticated/);
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_keeper_decisions TO anon/i);
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_keeper_decisions TO public/i);
  });

  it("scopes SELECT and DELETE to the owner via auth.uid() = user_id", () => {
    expect(sql).toMatch(
      /pheno_keeper_decisions_select_own[\s\S]*?FOR SELECT[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
    expect(sql).toMatch(
      /pheno_keeper_decisions_delete_own[\s\S]*?FOR DELETE[\s\S]*?USING \(auth\.uid\(\) = user_id\)/,
    );
  });

  it("requires caller ownership of row, hunt, AND plant on INSERT and UPDATE", () => {
    for (const policy of ["insert_own", "update_own"]) {
      const re = new RegExp(
        `pheno_keeper_decisions_${policy}[\\s\\S]*?WITH CHECK \\(([\\s\\S]*?)\\);`,
      );
      const m = sql.match(re);
      expect(m, `${policy} WITH CHECK block present`).toBeTruthy();
      const check = m![1];
      expect(check).toMatch(/auth\.uid\(\) = user_id/);
      expect(check).toMatch(/pheno_hunts h[\s\S]*?h\.user_id = auth\.uid\(\)/);
      expect(check).toMatch(/plants p[\s\S]*?p\.user_id = auth\.uid\(\)/);
      expect(check).toMatch(/p\.pheno_hunt_id = hunt_id/);
    }
  });

  it("keeps one decision per candidate and refreshes updated_at via the shared trigger", () => {
    expect(sql).toMatch(/UNIQUE \(hunt_id, plant_id\)/);
    expect(sql).toMatch(/EXECUTE FUNCTION public\.set_updated_at\(\)/);
  });

  it("is suggest-only: no plant deletes, no device-control / automation machinery", () => {
    // The migration must not delete plant rows or drive any device/automation.
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.plants/i);
    expect(sql.toLowerCase()).not.toMatch(/device[_-]?control/);
    expect(sql.toLowerCase()).not.toMatch(/automation/);
    expect(sql.toLowerCase()).not.toMatch(/autopilot|target_device|device_command/);
  });
});
