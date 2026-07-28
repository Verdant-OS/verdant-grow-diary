import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const MIGRATION_RELATIVE =
  "supabase/migrations/20260728050000_canonical_subscription_authority_reassert.sql";
const MIGRATION_PATH = resolve(ROOT, MIGRATION_RELATIVE);
const SQL = existsSync(MIGRATION_PATH) ? readFileSync(MIGRATION_PATH, "utf8") : "";
const EXECUTABLE_SQL = SQL.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
const FUNCTION_START = EXECUTABLE_SQL.indexOf(
  "CREATE OR REPLACE FUNCTION public.has_phenoid_entitlement(_user_id uuid)",
);
const FUNCTION_SQL =
  FUNCTION_START >= 0
    ? EXECUTABLE_SQL.slice(
        FUNCTION_START,
        EXECUTABLE_SQL.indexOf("$function$;", FUNCTION_START) + "$function$;".length,
      )
    : "";
const NORMALIZED_FUNCTION = FUNCTION_SQL.replace(/\s+/g, " ").trim().toLowerCase();

describe("PhenoID canonical entitlement authority repair", () => {
  it("ships in the forward-only canonical-authority migration", () => {
    expect(existsSync(MIGRATION_PATH), MIGRATION_RELATIVE).toBe(true);
    expect(FUNCTION_SQL).toContain(
      "CREATE OR REPLACE FUNCTION public.has_phenoid_entitlement(_user_id uuid)",
    );
  });

  it("keeps the caller/service identity guard intact", () => {
    expect(NORMALIZED_FUNCTION).toContain("v_role text := current_setting('role', true)");
    expect(NORMALIZED_FUNCTION).toContain("v_uid uuid := auth.uid()");
    expect(NORMALIZED_FUNCTION).toMatch(
      /v_role is distinct from 'service_role'[\s\S]*v_uid is null[\s\S]*_user_id is null[\s\S]*_user_id <> v_uid[\s\S]*return false/,
    );
  });

  it("uses only live canonical subscriptions for the PhenoID plans", () => {
    expect(NORMALIZED_FUNCTION).toContain("from public.subscriptions s");
    expect(NORMALIZED_FUNCTION).toContain("s.user_id = _user_id");
    expect(NORMALIZED_FUNCTION).toContain("s.environment = 'live'");
    expect(NORMALIZED_FUNCTION).toContain("s.price_id in ('phenoid_monthly','phenoid_annual')");
    expect(NORMALIZED_FUNCTION).not.toContain("billing_subscriptions");
  });

  it("preserves active, trialing, and paid-through cancellation behavior", () => {
    expect(NORMALIZED_FUNCTION).toContain("s.status in ('active','trialing')");
    expect(NORMALIZED_FUNCTION).toMatch(
      /s\.current_period_end is null or s\.current_period_end > now\(\)/,
    );
    expect(NORMALIZED_FUNCTION).toContain("s.status = 'canceled'");
    expect(NORMALIZED_FUNCTION).toMatch(/s\.current_period_end > now\(\)/);
  });

  it("reasserts the narrow execution grants without anon access", () => {
    expect(EXECUTABLE_SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.has_phenoid_entitlement\(uuid\) FROM PUBLIC;/,
    );
    expect(EXECUTABLE_SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.has_phenoid_entitlement\(uuid\) FROM anon;/,
    );
    expect(EXECUTABLE_SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.has_phenoid_entitlement\(uuid\) TO authenticated;/,
    );
    expect(EXECUTABLE_SQL).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.has_phenoid_entitlement\(uuid\) TO service_role;/,
    );
  });

  it("never trusts presentation tiers, staff roles, request input, or credit packs", () => {
    expect(FUNCTION_SQL).not.toMatch(/profiles\s*\.\s*tier|from\s+public\.profiles/i);
    expect(FUNCTION_SQL).not.toMatch(/\bhas_role\b|staff|operator/i);
    expect(FUNCTION_SQL).not.toMatch(/current_setting\s*\(\s*'request|request\.headers/i);
    expect(FUNCTION_SQL).not.toMatch(/credit_pack|pack_50|pack_150/i);
  });
});
