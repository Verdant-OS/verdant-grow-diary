/**
 * pheno-hunt-setup-state-migration-safety
 *
 * Static assertions over the guided-setup persistence migration: additive
 * nullable columns only, bounded goal text, legacy hunts backfilled as
 * confirmed, and no privilege or policy changes smuggled in.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = "supabase/migrations/20260709210000_pheno_hunt_setup_state.sql";

const sql = readFileSync(resolve(process.cwd(), MIGRATION), "utf8");

describe("pheno_hunt_setup_state migration safety", () => {
  it("adds only the two nullable setup columns, idempotently", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS goal text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS setup_confirmed_at timestamptz/);
    expect(sql).not.toMatch(/NOT NULL/);
    expect(sql).not.toMatch(/DROP\s+(COLUMN|TABLE)/i);
  });

  it("bounds the goal text (1..500) as defense in depth", () => {
    expect(sql).toMatch(/pheno_hunts_goal_length/);
    expect(sql).toMatch(/char_length\(goal\) BETWEEN 1 AND 500/);
  });

  it("backfills legacy hunts as confirmed so they never regress to continue-setup", () => {
    expect(sql).toMatch(/SET setup_confirmed_at = created_at/);
    expect(sql).toMatch(/WHERE setup_confirmed_at IS NULL/);
  });

  it("changes no policies, grants, or triggers", () => {
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).not.toMatch(/DROP POLICY/i);
    expect(sql).not.toMatch(/ALTER POLICY/i);
    // Statement-position only — the safety comment may mention the words.
    expect(sql).not.toMatch(/^\s*GRANT /im);
    expect(sql).not.toMatch(/^\s*REVOKE /im);
    expect(sql).not.toMatch(/CREATE TRIGGER/i);
    expect(sql).not.toMatch(/SECURITY DEFINER/i);
    expect(sql).not.toMatch(/TO anon/i);
  });

  it("never stores a readiness claim — only what the grower did", () => {
    // The ladder (setup/tracking/comparison-ready) is derived client-side;
    // the schema must not carry a readiness/comparison-ready column.
    expect(sql).not.toMatch(/ADD COLUMN[^;]*readiness/i);
    expect(sql).not.toMatch(/ADD COLUMN[^;]*comparison/i);
    expect(sql).not.toMatch(/ADD COLUMN[^;]*ready/i);
  });
});
