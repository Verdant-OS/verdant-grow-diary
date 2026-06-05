/**
 * Schema + RLS verification for public.billing_subscriptions.
 *
 * NOTE on test style: this repo verifies RLS/migration shape by scanning the
 * migration SQL (see has-role-security-definer.test.ts, alerts-foundation.test.ts).
 * There is no behavioral runtime DB harness wired into vitest, so these tests
 * verify policy + GRANT + CHECK + index *text* presence. Behavioral runtime
 * verification (signing in as two users and asserting rejected INSERT/UPDATE/
 * DELETE) belongs in supabase/tests/permissions.sql or an edge-function smoke
 * test and is intentionally out of slice 1.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATIONS_DIR = resolve(__dirname, "../../supabase/migrations");

const BILLING_SQL = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(resolve(MIGRATIONS_DIR, f), "utf8"))
  .filter((s) => /public\.billing_subscriptions/i.test(s))
  .join("\n\n");

describe("billing_subscriptions migration shape", () => {
  it("creates the table in public", () => {
    expect(BILLING_SQL).toMatch(
      /CREATE\s+TABLE\s+public\.billing_subscriptions/i,
    );
  });

  it("plan_id has CHECK constraint with the four allowed values", () => {
    expect(BILLING_SQL).toMatch(/plan_id[\s\S]{0,200}CHECK\s*\(\s*plan_id\s+IN\s*\(\s*'free'\s*,\s*'pro_monthly'\s*,\s*'pro_annual'\s*,\s*'founder_lifetime'\s*\)\s*\)/i);
  });

  it("status has CHECK constraint with the five allowed values", () => {
    expect(BILLING_SQL).toMatch(/status[\s\S]{0,200}CHECK\s*\(\s*status\s+IN\s*\(\s*'active'\s*,\s*'past_due'\s*,\s*'canceled'\s*,\s*'paused'\s*,\s*'expired'\s*\)\s*\)/i);
  });

  it("provider CHECK rejects values other than stripe/paddle (NULL allowed)", () => {
    expect(BILLING_SQL).toMatch(
      /provider[\s\S]{0,200}CHECK\s*\(\s*provider\s+IS\s+NULL\s+OR\s+provider\s+IN\s*\(\s*'stripe'\s*,\s*'paddle'\s*\)\s*\)/i,
    );
  });

  it("founder_number CHECK constrains to 1..75 (rejects 0 and 76)", () => {
    expect(BILLING_SQL).toMatch(
      /founder_number[\s\S]{0,200}BETWEEN\s+1\s+AND\s+75/i,
    );
  });

  it("user_id is NOT NULL UNIQUE and references auth.users", () => {
    expect(BILLING_SQL).toMatch(
      /user_id\s+uuid\s+NOT\s+NULL\s+UNIQUE\s+REFERENCES\s+auth\.users/i,
    );
  });

  it("partial unique index on founder_number WHERE NOT NULL", () => {
    expect(BILLING_SQL).toMatch(
      /CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+public\.billing_subscriptions[^;]*\(\s*founder_number\s*\)[^;]*WHERE\s+founder_number\s+IS\s+NOT\s+NULL/i,
    );
  });

  it("partial unique index on (provider, provider_subscription_id) WHERE NOT NULL", () => {
    expect(BILLING_SQL).toMatch(
      /CREATE\s+UNIQUE\s+INDEX[^;]*ON\s+public\.billing_subscriptions[^;]*\(\s*provider\s*,\s*provider_subscription_id\s*\)[^;]*WHERE\s+provider_subscription_id\s+IS\s+NOT\s+NULL/i,
    );
  });

  it("updated_at trigger wires the existing public.set_updated_at() helper", () => {
    expect(BILLING_SQL).toMatch(
      /CREATE\s+TRIGGER[^;]*BEFORE\s+UPDATE\s+ON\s+public\.billing_subscriptions[^;]*EXECUTE\s+FUNCTION\s+public\.set_updated_at/i,
    );
  });
});

describe("billing_subscriptions RLS — locked down by design", () => {
  it("RLS is enabled", () => {
    expect(BILLING_SQL).toMatch(
      /ALTER\s+TABLE\s+public\.billing_subscriptions\s+ENABLE\s+ROW\s+LEVEL\s+SECURITY/i,
    );
  });

  it("GRANT SELECT to authenticated (read-own via policy)", () => {
    expect(BILLING_SQL).toMatch(
      /GRANT\s+SELECT\s+ON\s+public\.billing_subscriptions\s+TO\s+authenticated/i,
    );
  });

  it("GRANT ALL to service_role (webhook write path)", () => {
    expect(BILLING_SQL).toMatch(
      /GRANT\s+ALL\s+ON\s+public\.billing_subscriptions\s+TO\s+service_role/i,
    );
  });

  it("NEVER grants anon (entitlement existence is auth-only)", () => {
    expect(BILLING_SQL).not.toMatch(
      /GRANT[^;]*ON\s+public\.billing_subscriptions[^;]*TO[^;]*\banon\b/i,
    );
  });

  it("defines a SELECT-own policy bound to auth.uid()", () => {
    expect(BILLING_SQL).toMatch(
      /CREATE\s+POLICY[^;]*ON\s+public\.billing_subscriptions[\s\S]*?FOR\s+SELECT[\s\S]*?USING\s*\(\s*user_id\s*=\s*auth\.uid\s*\(\s*\)\s*\)/i,
    );
  });

  it("declares NO client INSERT policy", () => {
    expect(BILLING_SQL).not.toMatch(
      /CREATE\s+POLICY[^;]*ON\s+public\.billing_subscriptions[\s\S]*?FOR\s+INSERT/i,
    );
  });

  it("declares NO client UPDATE policy", () => {
    expect(BILLING_SQL).not.toMatch(
      /CREATE\s+POLICY[^;]*ON\s+public\.billing_subscriptions[\s\S]*?FOR\s+UPDATE/i,
    );
  });

  it("declares NO client DELETE policy", () => {
    expect(BILLING_SQL).not.toMatch(
      /CREATE\s+POLICY[^;]*ON\s+public\.billing_subscriptions[\s\S]*?FOR\s+DELETE/i,
    );
  });

  it("declares no FOR ALL policy that would allow client writes", () => {
    expect(BILLING_SQL).not.toMatch(
      /CREATE\s+POLICY[^;]*ON\s+public\.billing_subscriptions[\s\S]*?FOR\s+ALL/i,
    );
  });
});
