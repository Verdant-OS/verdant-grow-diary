/**
 * 20261104233500 removes client privileges on public.stripe_payment_receipts:
 * PUBLIC and anon get nothing, authenticated keeps SELECT for the owner-read
 * policy, service_role keeps all. The runtime contract is
 * scripts/sql/verify-stripe-payment-receipts-privileges.sql (catalog asserts).
 *
 * @source-scan-justified: privileges are a fact about the SQL statements in
 * the migration; there is no resolved value to import, and vitest has no
 * database here. The runtime proof is the pgTAP-style contract file above.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  KNOWN_MONEY_MIGRATIONS,
  REQUIRED_MONEY_MIGRATIONS,
  isMoneyMigrationFilename,
} from "../../scripts/required-money-migrations.mjs";

const MIGRATION = "20261104233500_stripe_payment_receipts_billing_privileges.sql";
const code = readFileSync(`supabase/migrations/${MIGRATION}`, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");
const statements = code
  .split(";")
  .map((s) => s.replace(/\s+/g, " ").trim())
  .filter(Boolean);

describe("stripe_payment_receipts billing privileges migration", () => {
  it("is a money migration the firewall knows and production does not require", () => {
    expect(isMoneyMigrationFilename(MIGRATION)).toBe(true);
    expect(KNOWN_MONEY_MIGRATIONS.has(MIGRATION)).toBe(true);
    expect(REQUIRED_MONEY_MIGRATIONS).not.toContain(MIGRATION);
  });

  it("is exactly the revoke-then-regrant sequence and nothing else", () => {
    expect(statements).toEqual([
      "REVOKE ALL ON TABLE public.stripe_payment_receipts FROM PUBLIC",
      "REVOKE ALL ON TABLE public.stripe_payment_receipts FROM anon",
      "REVOKE ALL ON TABLE public.stripe_payment_receipts FROM authenticated",
      "GRANT SELECT ON TABLE public.stripe_payment_receipts TO authenticated",
      "GRANT ALL ON TABLE public.stripe_payment_receipts TO service_role",
    ]);
  });

  it("never grants a client role anything beyond SELECT", () => {
    for (const s of statements.filter((x) => x.startsWith("GRANT"))) {
      if (/\bTO (anon|PUBLIC)\b/i.test(s)) throw new Error(`client grant: ${s}`);
      if (/\bTO authenticated\b/i.test(s)) expect(s).toMatch(/^GRANT SELECT ON /);
    }
  });
});
