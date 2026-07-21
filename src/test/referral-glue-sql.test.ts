/**
 * Referral glue — static contract for the referral_code + pending-capture
 * migration. Pins the security-load-bearing SQL: opaque code generation,
 * client immutability, best-effort (never signup-fatal) pending capture, and
 * the preserved handle_new_user behavior.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260721107000_referral_code_and_pending_capture.sql",
  ),
  "utf8",
).replace(/\r\n/g, "\n");

const CONFIG = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

describe("referral_code column + generator", () => {
  it("fails closed unless convert_referral exists first", () => {
    expect(MIGRATION).toContain(
      "to_regprocedure('public.convert_referral(uuid,uuid,text,text,boolean)') IS NULL",
    );
  });

  it("adds a unique, backfilled referral_code to profiles", () => {
    expect(MIGRATION).toContain(
      "ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code text",
    );
    expect(MIGRATION).toContain("CREATE UNIQUE INDEX IF NOT EXISTS profiles_referral_code_uq");
    expect(MIGRATION).toContain("WHERE referral_code IS NULL");
  });

  it("generates an OPAQUE random slug (never derived from user identity) with collision retry", () => {
    expect(MIGRATION).toContain("CREATE OR REPLACE FUNCTION public.generate_referral_code()");
    expect(MIGRATION).toContain("'abcdefghjkmnpqrstuvwxyz23456789'");
    expect(MIGRATION).toContain("FOR v_attempt IN 1..20 LOOP");
    // Not derived from the user's id or email.
    expect(MIGRATION).not.toMatch(/referral_code\s*=\s*.*user_id/i);
    expect(MIGRATION).not.toMatch(/generate_referral_code[\s\S]{0,600}NEW\.email/);
  });

  it("makes referral_code immutable for non-service_role (client UPDATE policy exists)", () => {
    expect(MIGRATION).toContain("IF NEW.referral_code IS DISTINCT FROM OLD.referral_code THEN");
    expect(MIGRATION).toContain("'referral_code is not directly writable'");
    // The existing gamification freeze is preserved, not replaced.
    expect(MIGRATION).toContain("NEW.nugs_total IS DISTINCT FROM OLD.nugs_total");
  });
});

describe("handle_new_user pending capture", () => {
  it("preserves the existing profile/attribution/marketing behavior", () => {
    expect(MIGRATION).toContain("'csv_history'");
    expect(MIGRATION).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(MIGRATION).toContain("marketing_opt_in' = 'true'::jsonb");
    expect(MIGRATION).toContain("INSERT INTO public.signup_acquisition_attributions");
  });

  it("treats the metadata code as a lookup key with charset validation", () => {
    expect(MIGRATION).toContain("NEW.raw_user_meta_data->>'verdant_ref_code'");
    expect(MIGRATION).toContain("~ '^[a-z0-9]{6,16}$'");
    expect(MIGRATION).toContain("WHERE p.referral_code = v_ref_code");
    expect(MIGRATION).toContain("v_referrer <> NEW.id");
  });

  it("is strictly best-effort — referral capture can never fail account creation", () => {
    expect(MIGRATION).toMatch(/BEGIN\s*\n\s*v_ref_code :=/);
    expect(MIGRATION).toContain("EXCEPTION WHEN OTHERS THEN");
  });

  it("records pending (verified only when the account arrives pre-confirmed)", () => {
    expect(MIGRATION).toContain("NEW.email_confirmed_at IS NOT NULL");
    expect(MIGRATION).toContain(
      "COALESCE(NULLIF(current_setting('app.payments_environment', true), ''), 'live')",
    );
  });

  it("keeps the trigger locked down", () => {
    expect(MIGRATION).toContain("REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC");
    expect(MIGRATION).toContain(
      "REVOKE ALL ON FUNCTION public.generate_referral_code() FROM authenticated",
    );
  });
});

describe("redeem-referral edge function contract", () => {
  const EDGE = readFileSync(
    resolve(process.cwd(), "supabase/functions/redeem-referral/index.ts"),
    "utf8",
  );

  it("is registered with platform JWT verification", () => {
    expect(CONFIG).toContain("[functions.redeem-referral]");
    expect(CONFIG).toMatch(/\[functions\.redeem-referral\]\s*\n\s*verify_jwt = true/);
  });

  it("derives referee identity and confirmation from the JWT, never the body", () => {
    expect(EDGE).toContain("auth.getUser()");
    expect(EDGE).toContain("p_referee_user_id: user.id");
    expect(EDGE).toContain("p_verified: user.email_confirmed_at != null");
    expect(EDGE).not.toMatch(/body[^\n]*user_?id/i);
  });

  it("resolves the credit environment from server secrets, fail-closed", () => {
    expect(EDGE).toContain("resolveRequiredServerBillingEnvironment");
    expect(EDGE).toContain("environment_unresolved");
  });

  it("age-gates fresh attributions so established accounts cannot be retro-claimed", () => {
    expect(EDGE).toContain("FRESH_ATTRIBUTION_MAX_AGE_MS");
    expect(EDGE).toContain("stale_account");
  });

  it("marks permanent refusals terminal so clients stop retrying", () => {
    expect(EDGE).toContain("'self_referral'");
    expect(EDGE).toContain("'referee_already_referred'");
    expect(EDGE).toContain("terminal: true");
  });
});
