/**
 * Static contract for the signup-acquisition forward-repair migration.
 *
 * A live probe of production on 2026-08-12 found
 * public.signup_acquisition_attributions absent and only handle_new_user of the
 * four functions present, so three earlier migrations never reached prod. This
 * migration rebuilds the whole subsystem in one apply and adds the
 * blueprint_targets source. These assertions pin the properties that make it
 * safe to apply to a database in ANY of those states.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  "supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql",
  "utf8",
);

const SOURCES = [
  "landing_page",
  "pricing_page",
  "founder_page",
  "founder_share",
  "pricing_interest_share",
  "operator_outreach",
  "grower_invite",
  "context_check",
  "vpd_calculator",
  "csv_history",
  "blueprint_targets",
] as const;

describe("signup acquisition forward repair — idempotency", () => {
  it("creates the table and re-asserts the CHECK separately", () => {
    // CREATE TABLE IF NOT EXISTS alone would leave an EXISTING table on the
    // old constraint, silently rejecting the new source.
    expect(SQL).toContain(
      "CREATE TABLE IF NOT EXISTS public.signup_acquisition_attributions",
    );
    expect(SQL).toContain(
      "DROP CONSTRAINT IF EXISTS signup_acquisition_attributions_source_check",
    );
    expect(SQL).toContain(
      "ADD CONSTRAINT signup_acquisition_attributions_source_check",
    );
  });

  it("replaces rather than creates every function, so a partial prior apply is safe", () => {
    for (const fn of [
      "public.handle_new_user()",
      "public.record_signup_acquisition_first_touch(p_source text)",
      "public.signup_acquisition_operator_snapshot()",
      "public.signup_to_paid_operator_snapshot()",
    ]) {
      expect(SQL).toContain(`CREATE OR REPLACE FUNCTION ${fn}`);
    }
  });

  it("backfills historical attribution without overwriting first touch", () => {
    expect(SQL).toContain("INSERT INTO public.signup_acquisition_attributions");
    expect(SQL).toContain("FROM auth.users AS u");
    expect(SQL).toContain("ON CONFLICT (user_id) DO NOTHING");
  });
});

describe("signup acquisition forward repair — allowlist parity", () => {
  it("carries every source, old and new", () => {
    for (const source of SOURCES) expect(SQL).toContain(`'${source}'`);
  });

  it("teaches blueprint_targets to all five allowlist sites", () => {
    // constraint, handle_new_user, first-touch RPC, acquisition snapshot
    // (FILTER + jsonb key), signup-to-paid source_keys.
    expect(SQL).toContain(
      "count(*) FILTER (WHERE a.source = 'blueprint_targets') AS blueprint_targets",
    );
    expect(SQL).toContain("'blueprint_targets', ac.blueprint_targets");
    expect(SQL).toContain("('blueprint_targets'::text)");
    expect(SQL).toContain("'csv_history','blueprint_targets'");
  });
});

describe("signup acquisition forward repair — no regression in handle_new_user", () => {
  it("keeps referral_code and convert_referral", () => {
    // handle_new_user was redefined twice after the 2026-07-16 migration.
    // Carrying THAT body forward would silently drop both of these.
    expect(SQL).toContain("public.generate_referral_code()");
    expect(SQL).toContain("PERFORM public.convert_referral(");
  });
});

describe("signup acquisition forward repair — privacy and access fences", () => {
  it("keeps the table unreachable from the Data API", () => {
    expect(SQL).toContain(
      "ALTER TABLE public.signup_acquisition_attributions ENABLE ROW LEVEL SECURITY",
    );
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(SQL).toContain(
        `REVOKE ALL ON TABLE public.signup_acquisition_attributions FROM ${role}`,
      );
    }
  });

  it("pins every function to a SECURITY DEFINER search_path", () => {
    const definers = SQL.match(/SECURITY DEFINER/g) ?? [];
    expect(definers.length).toBeGreaterThanOrEqual(4);
    const pinned = SQL.match(/SET search_path = public, pg_temp/g) ?? [];
    expect(pinned.length).toBeGreaterThanOrEqual(4);
  });

  // AGENTS.md: public.billing_subscriptions is a legacy sandbox/operator-audit
  // surface that must never grant an entitlement. This migration is the FIRST
  // install of the snapshots in production, so the legacy branch is dropped
  // here rather than carried forward.
  it("never sources paid cohorts from the legacy billing_subscriptions table", () => {
    const executable = SQL.split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(executable).not.toContain("billing_subscriptions");
    expect(executable).toContain("FROM public.subscriptions AS s");
  });

  it("never selects email, provider id, or raw metadata into a snapshot", () => {
    const snapshotStart = SQL.indexOf(
      "CREATE OR REPLACE FUNCTION public.signup_acquisition_operator_snapshot()",
    );
    const snapshots = SQL.slice(snapshotStart);
    for (const pii of ["u.email", "raw_user_meta_data", "provider_id"]) {
      expect(snapshots).not.toContain(pii);
    }
  });
});
