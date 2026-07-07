/**
 * Static safety test for breeding_* RLS migration.
 * Reads the migration file and asserts required security posture — no anon
 * grants, no USING(true) / WITH CHECK(true), and every WITH CHECK references
 * the incoming row's parent id (the pattern we fixed on pheno_keeper_clones).
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function findMigration(needle: string): string {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  for (const f of files) {
    const body = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    if (body.includes(needle)) return body;
  }
  throw new Error(`Migration referencing '${needle}' not found`);
}

const migration = findMigration("CREATE TABLE public.breeding_programs");

describe("breeding schema safety", () => {
  it("creates the three expected tables", () => {
    expect(migration).toMatch(/CREATE TABLE public\.breeding_programs/);
    expect(migration).toMatch(/CREATE TABLE public\.breeding_program_steps/);
    expect(migration).toMatch(/CREATE TABLE public\.breeding_step_evidence/);
  });

  it("enables RLS on every breeding table", () => {
    for (const t of [
      "breeding_programs",
      "breeding_program_steps",
      "breeding_step_evidence",
    ]) {
      expect(migration).toMatch(
        new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`),
      );
    }
  });

  it("grants owner CRUD to authenticated and ALL to service_role, never to anon", () => {
    for (const t of [
      "breeding_programs",
      "breeding_program_steps",
      "breeding_step_evidence",
    ]) {
      expect(migration).toMatch(
        new RegExp(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON public\\.${t} TO authenticated`,
        ),
      );
      expect(migration).toMatch(new RegExp(`GRANT ALL ON public\\.${t} TO service_role`));
      expect(migration).not.toMatch(new RegExp(`GRANT [^;]*ON public\\.${t}[^;]*TO anon`));
    }
  });

  it("SAFETY: never uses USING(true) or WITH CHECK(true) on breeding tables", () => {
    // Slice out only the breeding sections of the migration to avoid unrelated file noise.
    const breedingSection = migration
      .split(/CREATE TABLE public\.(?=breeding_)/)
      .slice(1)
      .join("");
    expect(breedingSection).not.toMatch(/USING\s*\(\s*true\s*\)/i);
    expect(breedingSection).not.toMatch(/WITH CHECK\s*\(\s*true\s*\)/i);
  });

  it("every INSERT/UPDATE policy is scoped by auth.uid() = user_id", () => {
    const matches = migration.match(
      /CREATE POLICY breeding_[a-z_]+ ON public\.breeding_[a-z_]+\s+FOR (INSERT|UPDATE)[\s\S]*?;/g,
    );
    expect(matches, "expected INSERT/UPDATE policies present").toBeTruthy();
    for (const m of matches ?? []) {
      expect(m).toMatch(/auth\.uid\(\)\s*=\s*user_id/);
    }
  });

  it("cross-table WITH CHECK predicates reference the incoming row's column (not tautologies)", () => {
    // Guard against the pheno_keeper_clones-style bug where a subquery aliased
    // the table as `c` then compared c.id = c.parent_clone_id AND
    // c.keeper_id = c.keeper_id — always trivially true.
    expect(migration).not.toMatch(/c\.id\s*=\s*c\.parent_clone_id/);
    expect(migration).not.toMatch(/c\.keeper_id\s*=\s*c\.keeper_id/);
    // Every cross-table EXISTS should scope by auth.uid()
    const exists = migration.match(/EXISTS\s*\(\s*SELECT 1[\s\S]*?\)/g) ?? [];
    expect(exists.length).toBeGreaterThan(0);
    for (const e of exists) {
      expect(e).toMatch(/auth\.uid\(\)/);
    }
  });

  it("breeding_step_evidence verifies BOTH program and diary_entry ownership in one predicate", () => {
    const evidenceInsert = migration.match(
      /CREATE POLICY breeding_step_evidence_insert_own[\s\S]*?;/,
    )?.[0];
    expect(evidenceInsert).toBeDefined();
    expect(evidenceInsert!).toMatch(/breeding_programs/);
    expect(evidenceInsert!).toMatch(/breeding_program_steps/);
    expect(evidenceInsert!).toMatch(/diary_entries/);
  });
});
