import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const SQL = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260716215516_add_csv_history_signup_attribution.sql",
  ),
  "utf8",
);

describe("CSV-history signup attribution migration", () => {
  it("extends the immutable source constraint and auth trigger by exactly the fixed source", () => {
    expect(SQL).toContain("DROP CONSTRAINT IF EXISTS signup_acquisition_attributions_source_check");
    expect(SQL).toContain("ADD CONSTRAINT signup_acquisition_attributions_source_check CHECK");
    expect(SQL).toContain("'csv_history'");
    expect(SQL).toContain("CREATE OR REPLACE FUNCTION public.handle_new_user()");
    expect(SQL).toContain("NEW.raw_user_meta_data->>'verdant_signup_source'");
    expect(SQL).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon");
    expect(SQL).toContain("REVOKE ALL ON FUNCTION public.handle_new_user() FROM authenticated");
  });

  it("keeps both aggregate reports operator-only, read-only, and PII-free", () => {
    for (const fn of [
      "public.signup_acquisition_operator_snapshot()",
      "public.signup_to_paid_operator_snapshot()",
    ]) {
      expect(SQL).toContain(`CREATE OR REPLACE FUNCTION ${fn}`);
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM PUBLIC`);
      expect(SQL).toContain(`REVOKE ALL ON FUNCTION ${fn} FROM anon`);
      expect(SQL).toContain(`GRANT EXECUTE ON FUNCTION ${fn} TO authenticated`);
    }
    expect(
      SQL.match(/public\.has_role\(auth\.uid\(\), 'operator'::public\.app_role\)/g),
    ).toHaveLength(2);
    expect(SQL).toContain("count(*) FILTER (WHERE a.source = 'csv_history') AS csv_history");
    expect(SQL).toContain("('csv_history'::text)");
    for (const key of ["'email'", "'user_id'", "'raw_user_meta_data'", "'provider_id'"]) {
      expect(SQL).not.toContain(key);
    }
  });

  it("records OAuth first touch only for the verified new account and never trusts a client id", () => {
    expect(SQL).toContain(
      "CREATE OR REPLACE FUNCTION public.record_signup_acquisition_first_touch(p_source text)",
    );
    expect(SQL).toContain("VALUES (auth.uid(), p_source, v_created_at)");
    expect(SQL).toContain("v_created_at < now() - interval '30 minutes'");
    expect(SQL).toContain("ON CONFLICT (user_id) DO NOTHING");
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.record_signup_acquisition_first_touch(text) FROM PUBLIC",
    );
    expect(SQL).toContain(
      "REVOKE ALL ON FUNCTION public.record_signup_acquisition_first_touch(text) FROM anon",
    );
    expect(SQL).toContain(
      "GRANT EXECUTE ON FUNCTION public.record_signup_acquisition_first_touch(text) TO authenticated",
    );
    expect(SQL).not.toMatch(/record_signup_acquisition_first_touch\s*\([^)]*user_?id/i);
  });

  it("preserves the authoritative paid union and never grants client table writes", () => {
    expect(SQL).toContain("FROM public.billing_subscriptions AS bs");
    expect(SQL).toContain("FROM public.subscriptions AS s");
    expect(SQL).toContain("s.environment = 'live'");
    expect(SQL).toContain("SELECT DISTINCT ON (candidate.user_id)");
    expect(SQL).not.toMatch(/profiles\.tier/i);
    expect(SQL).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|TRUNCATE).*signup_acquisition_attributions/i,
    );
  });
});
