/**
 * pheno-hunt-setup-state-migration-safety
 *
 * Static assertions over the guided-setup persistence migrations:
 * additive nullable columns only, constrained jsonb/notes, legacy hunts
 * backfilled as complete (rerun-safe), and no privilege or policy changes
 * smuggled in.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ONBOARDING_MIGRATION =
  "supabase/migrations/20260709230646_99529e76-f6a7-4ef5-9c4b-98be194e6ac9.sql";
const BACKFILL_MIGRATION =
  "supabase/migrations/20260710002000_pheno_hunt_setup_backfill.sql";

const onboarding = readFileSync(resolve(process.cwd(), ONBOARDING_MIGRATION), "utf8");
const backfill = readFileSync(resolve(process.cwd(), BACKFILL_MIGRATION), "utf8");
const both = onboarding + "\n" + backfill;

describe("pheno_hunt guided-setup migrations safety", () => {
  it("adds only nullable/defaulted setup columns, idempotently", () => {
    expect(onboarding).toMatch(
      /ADD COLUMN IF NOT EXISTS evidence_goals jsonb NOT NULL DEFAULT '\[\]'::jsonb/,
    );
    expect(onboarding).toMatch(/ADD COLUMN IF NOT EXISTS notes text/);
    expect(onboarding).toMatch(/ADD COLUMN IF NOT EXISTS setup_completed_at timestamptz/);
    expect(both).not.toMatch(/DROP\s+(COLUMN|TABLE)/i);
  });

  it("constrains evidence_goals to a json array and bounds notes (1..4000)", () => {
    expect(onboarding).toMatch(/jsonb_typeof\(evidence_goals\) = 'array'/);
    expect(backfill).toMatch(/char_length\(notes\) BETWEEN 1 AND 4000/);
  });

  it("backfills legacy hunts as setup-complete so they never regress to the setup card", () => {
    expect(backfill).toMatch(/SET setup_completed_at = created_at/);
    expect(backfill).toMatch(/WHERE setup_completed_at IS NULL/);
  });

  it("backfill is rerun-safe: bounded to hunts created before guided setup shipped", () => {
    expect(backfill).toMatch(/AND created_at < '2026-07-09T23:06:46Z'/);
  });

  it("changes no policies, grants, or triggers", () => {
    expect(both).not.toMatch(/CREATE POLICY/i);
    expect(both).not.toMatch(/DROP POLICY/i);
    expect(both).not.toMatch(/ALTER POLICY/i);
    // Statement-position only — comments may mention the words.
    expect(both).not.toMatch(/^\s*GRANT /im);
    expect(both).not.toMatch(/^\s*REVOKE /im);
    expect(both).not.toMatch(/CREATE TRIGGER/i);
    expect(both).not.toMatch(/SECURITY DEFINER/i);
    expect(both).not.toMatch(/TO anon/i);
  });

  it("never stores a readiness claim — only what the grower did", () => {
    // Comparison-readiness is derived from recorded evidence in the client;
    // the schema must not carry a readiness/comparison-ready column.
    expect(both).not.toMatch(/ADD COLUMN[^;]*readiness/i);
    expect(both).not.toMatch(/ADD COLUMN[^;]*comparison/i);
  });
});
