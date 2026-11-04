/**
 * 20261104184500 records Stripe billing schema that production already
 * carries. It must be known to the money filename firewall, must never be a
 * required production apply, and every DDL step must stay catalog-guarded so
 * that running it against production changes nothing.
 *
 * @source-scan-justified: the guard property is a fact about the SQL text
 * itself (which statements sit behind catalog checks); there is no resolved
 * value to import.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KNOWN_MONEY_MIGRATIONS,
  REQUIRED_MONEY_MIGRATIONS,
  isMoneyMigrationFilename,
} from "../../scripts/required-money-migrations.mjs";

const MIGRATION = "20261104184500_record_live_stripe_billing_schema.sql";
const sql = readFileSync(`supabase/migrations/${MIGRATION}`, "utf8");
const code = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

describe("record-live Stripe billing schema migration", () => {
  it("is a money migration that the firewall knows and production does not require", () => {
    expect(isMoneyMigrationFilename(MIGRATION)).toBe(true);
    expect(KNOWN_MONEY_MIGRATIONS.has(MIGRATION)).toBe(true);
    expect(REQUIRED_MONEY_MIGRATIONS).not.toContain(MIGRATION);
  });

  it("creates objects only behind IF NOT EXISTS or a catalog check", () => {
    expect(code).toMatch(/CREATE TABLE public\.stripe_payment_receipts/);
    expect(code).toMatch(/CREATE UNIQUE INDEX subscriptions_stripe_identity/);
    expect(code).toMatch(
      /to_regprocedure\('public\.stripe_record_credit_payment\(text,text,uuid,text,boolean\)'\) IS NULL/,
    );
    expect(code).not.toMatch(/CREATE OR REPLACE FUNCTION/);
    expect(code).not.toMatch(/ADD COLUMN IF NOT EXISTS/);
  });

  it("keeps every DDL statement inside a catalog-guarded DO block", () => {
    // CREATE INDEX IF NOT EXISTS and ADD COLUMN IF NOT EXISTS lock the table
    // before they skip, so nothing may run at the top level (review 5777101717 P2-1).
    const topLevel = code.replace(/DO \$record\$[\s\S]*?\$record\$;/g, "");
    expect(topLevel).not.toMatch(/\b(CREATE|ALTER|DROP|GRANT|REVOKE)\b/i);
    expect(code).toMatch(/to_regclass\('public\.subscriptions_stripe_identity'\) IS NULL/);
    expect(code).toMatch(/to_regclass\('public\.stripe_payment_receipts'\) IS NULL/);
  });

  it("does not widen privileges", () => {
    expect(code).not.toMatch(/GRANT\s+[^;]*\bTO\s+(anon|authenticated|PUBLIC)\b/i);
    expect(code).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.stripe_record_credit_payment\([^)]*\) TO service_role;/,
    );
  });

  it("never touches the retired 20261101180000 provider column", () => {
    expect(code).not.toMatch(/\bprovider\s+text\b/);
    expect(code).not.toMatch(/DROP CONSTRAINT IF EXISTS subscriptions_provider_check/);
  });
});
