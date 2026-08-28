/**
 * pheno-hunts-ownership-restore-migration-safety
 *
 * Static assertions over 20260825233000_pheno_hunts_ownership_check_restore.
 * The v2 pheno_hunts policies (20260618233452) lost the v1 rule that grow_id
 * and tent_id must reference the CALLER'S OWN grow/tent, so a cross-tenant
 * reference was storable. This migration restores it for INSERT and UPDATE
 * and closes the Pro-entitlement gap on the two pheno_* tables added after
 * the 20260709192453 restrictive-policy sweep.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260825233000_pheno_hunts_ownership_check_restore.sql";

const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

describe("pheno_hunts ownership-check restore migration", () => {
  it("replaces exactly the two v2 policy names, idempotently", () => {
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Users insert own pheno_hunts"/);
    expect(sql).toMatch(/DROP POLICY IF EXISTS "Users update own pheno_hunts"/);
    // No other pheno_hunts policy (SELECT/DELETE/operator/restrictive) is touched.
    expect(sql).not.toMatch(/Users view own pheno_hunts/);
    expect(sql).not.toMatch(/Users delete own pheno_hunts/);
    expect(sql).not.toMatch(/Operators view all pheno_hunts/);
  });

  it("verifies grow ownership on INSERT and UPDATE via auth.uid()", () => {
    const growChecks = sql.match(
      /SELECT 1 FROM public\.grows g\s+WHERE g\.id = pheno_hunts\.grow_id AND g\.user_id = auth\.uid\(\)/g,
    );
    expect(growChecks).toHaveLength(2); // once per policy
  });

  it("verifies tent ownership and tent-grow consistency, tolerating unassigned tents", () => {
    const tentChecks = sql.match(
      /t\.id = pheno_hunts\.tent_id\s+AND t\.user_id = auth\.uid\(\)\s+AND \(t\.grow_id IS NULL OR t\.grow_id = pheno_hunts\.grow_id\)/g,
    );
    expect(tentChecks).toHaveLength(2);
    // tent_id stays optional — a hunt without a tent is valid.
    expect(sql.match(/pheno_hunts\.tent_id IS NULL/g)).toHaveLength(2);
  });

  it("the UPDATE policy carries an explicit WITH CHECK (the v2 gap)", () => {
    expect(sql).toMatch(
      /FOR UPDATE\s+USING \(auth\.uid\(\) = user_id\)\s+WITH CHECK \(\s+auth\.uid\(\) = user_id/,
    );
  });

  it("adds RESTRICTIVE Pro-entitlement policies for the two late pheno_* tables, guarded", () => {
    expect(sql).toMatch(/pheno_male_evaluations/);
    expect(sql).toMatch(/pheno_pollen_viability_tests/);
    expect(sql).toMatch(/to_regclass\('public\.' \|\| t\) IS NULL/);
    expect(sql).toMatch(/AS RESTRICTIVE FOR INSERT TO authenticated/);
    expect(sql).toMatch(/has_pheno_tracker_entitlement\(auth\.uid\(\)\)/);
  });

  it("stays additive: no table/column/data change, no grants, no service_role, no anon", () => {
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).not.toMatch(/ALTER TABLE/i);
    expect(sql).not.toMatch(/DROP TABLE/i);
    expect(sql).not.toMatch(/\bDELETE FROM\b/i);
    expect(sql).not.toMatch(/\bUPDATE public\./i);
    expect(sql).not.toMatch(/\bINSERT INTO\b/i);
    expect(sql).not.toMatch(/GRANT/);
    expect(sql).not.toMatch(/TO anon/i);
  });
});
