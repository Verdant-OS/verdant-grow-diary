import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations/20260714190000_restore_public_lead_insert_only.sql",
  ),
  "utf8",
);

describe("subscriber-interest lead RLS recovery", () => {
  it("restores INSERT-only access for signed-out and signed-in visitors", () => {
    expect(migration).toMatch(
      /CREATE POLICY "Public can submit a lead"[\s\S]*FOR INSERT[\s\S]*TO anon, authenticated/i,
    );
    for (const source of [
      "landing",
      "pricing_interest",
      "pricing_interest_landing",
      "pricing_interest_pricing_page",
      "pricing_interest_founder_page",
      "pricing_interest_founder_share",
      "pricing_interest_referral",
      "pricing_interest_grower_invite",
      "pricing_interest_context_check",
      "pricing_interest_vpd_calculator",
    ]) {
      expect(migration).toContain(`'${source}'`);
    }
    expect(migration).toMatch(/position\('@' IN btrim\(email\)\) > 1/i);
    expect(migration).not.toMatch(/WITH CHECK \(true\)/i);
    expect(migration).toMatch(/REVOKE ALL ON TABLE public\.leads FROM anon/i);
    expect(migration).toMatch(/GRANT INSERT ON TABLE public\.leads TO anon/i);
  });

  it("does not grant anonymous read, update, delete, or service-role access", () => {
    expect(migration).not.toMatch(/GRANT (SELECT|UPDATE|DELETE|TRUNCATE)/i);
    expect(migration).not.toMatch(/TO service_role/i);

    const createdPolicies = migration.match(/CREATE POLICY[^;]*ON public\.leads[^;]*;/gi) ?? [];
    expect(createdPolicies).toHaveLength(1);
    expect(createdPolicies[0]).not.toMatch(/FOR (SELECT|UPDATE|DELETE)/i);
  });
});
