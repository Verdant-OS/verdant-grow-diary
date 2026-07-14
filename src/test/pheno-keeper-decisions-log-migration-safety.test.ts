/**
 * pheno-keeper-decisions-log-migration-safety
 *
 * Static assertions over the append-only keeper decisions log: immutable rows
 * (no UPDATE/DELETE grant to authenticated, no UPDATE/DELETE policy), a required
 * non-empty reason, user-scoped + candidate-consistent inserts, and the exact
 * four-decision CHECK.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260706181500_pheno_keeper_decisions_log_foundation.sql";

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), "utf8");
}

describe("pheno_keeper_decisions_log migration safety", () => {
  const sql = read(MIGRATION);

  it("creates the table and enables row level security", () => {
    expect(sql).toMatch(/CREATE TABLE public\.pheno_keeper_decisions_log/);
    expect(sql).toMatch(/ALTER TABLE public\.pheno_keeper_decisions_log ENABLE ROW LEVEL SECURITY/);
  });

  it("requires a non-empty reason and the four-decision CHECK; keeps history (no UNIQUE)", () => {
    expect(sql).toMatch(/CHECK \(length\(btrim\(reason\)\) > 0\)/);
    expect(sql).toMatch(/CHECK \(decision IN \('keep', 'cull', 'hold', 'undecided'\)\)/);
    expect(sql).not.toMatch(/UNIQUE \(hunt_id, plant_id\)/);
  });

  it("is APPEND-ONLY: authenticated granted only SELECT + INSERT (never UPDATE/DELETE)", () => {
    const grant = sql.match(/GRANT ([^;]*) ON public\.pheno_keeper_decisions_log TO authenticated/);
    expect(grant, "authenticated grant present").toBeTruthy();
    const cols = grant![1].toUpperCase();
    expect(cols).toMatch(/SELECT/);
    expect(cols).toMatch(/INSERT/);
    expect(cols).not.toMatch(/UPDATE/);
    expect(cols).not.toMatch(/DELETE/);
    expect(cols).not.toMatch(/ALL/);
  });

  it("has NO update or delete policy (rows are immutable)", () => {
    expect(sql).not.toMatch(/FOR UPDATE/i);
    expect(sql).not.toMatch(/FOR DELETE/i);
  });

  it("grants nothing to anon/public", () => {
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_keeper_decisions_log TO anon/i);
    expect(sql).not.toMatch(/GRANT[^;]*ON public\.pheno_keeper_decisions_log TO public/i);
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

  it("is suggest-only: no plant deletes, no device/automation machinery", () => {
    const lower = sql.toLowerCase();
    expect(lower).not.toMatch(/delete\s+from\s+public\.plants/);
    expect(lower).not.toMatch(
      /device[_-]?control|automation|autopilot|target_device|device_command|mqtt/,
    );
  });
});
