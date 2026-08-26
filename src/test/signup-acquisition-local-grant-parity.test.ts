/**
 * Local parity grant for `signup_acquisition_attributions`.
 *
 * supabase/seed.sql:19-21 blanket-grants SELECT/INSERT/UPDATE/DELETE on every
 * public table to anon/authenticated/service_role after migrations replay
 * (local-stack parity with this hosted project's legacy default privileges —
 * see the file's own header). Without a matching re-harden block, that
 * blanket grant silently reopens every ACL 20260813030000 and 20260821064300
 * spent effort closing: not just service_role (the gap 20260821064300
 * closes) but anon and authenticated too, on a plain `supabase db reset`.
 *
 * Source-text scanning is appropriate here, matching the established sibling
 * tests for this exact file (e.g. ai-private-ledger-local-grant-parity.test.ts,
 * ai-doctor-sessions-grant-hardening.test.ts): seed.sql is a .sql artifact
 * that cannot be imported and resolved, and every assertion below proves the
 * presence of exact statements in it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SEED = readFileSync(resolve(ROOT, "supabase/seed.sql"), "utf8");
const REPAIR = readFileSync(
  resolve(ROOT, "supabase/migrations/20260813030000_signup_acquisition_forward_repair.sql"),
  "utf8",
);
const HARDENING = readFileSync(
  resolve(ROOT, "supabase/migrations/20260821064300_signup_acquisition_service_role_hardening.sql"),
  "utf8",
);

const TABLE = "signup_acquisition_attributions";

describe("local parity grant for signup_acquisition_attributions", () => {
  it("keeps the canonical migrations explicit about the table boundary", () => {
    expect(REPAIR).toContain(`REVOKE ALL ON TABLE public.${TABLE} FROM PUBLIC`);
    expect(REPAIR).toContain(`REVOKE ALL ON TABLE public.${TABLE} FROM anon`);
    expect(REPAIR).toContain(`REVOKE ALL ON TABLE public.${TABLE} FROM authenticated`);
    expect(HARDENING).toContain(`REVOKE ALL ON TABLE public.${TABLE} FROM service_role`);
  });

  it("reapplies the full no-direct-access ACL after the blanket local parity grant", () => {
    const hardeningStart = SEED.indexOf("Signup acquisition attributions are written only by");
    expect(hardeningStart).toBeGreaterThan(
      SEED.indexOf("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES"),
    );

    // This is the last block in the file, so slice to EOF.
    const hardening = SEED.slice(hardeningStart);
    expect(hardening).toContain(`to_regclass('public.${TABLE}')`);
    expect(hardening).toContain(
      `REVOKE ALL ON TABLE public.${TABLE}\n      FROM PUBLIC, anon, authenticated, service_role;`,
    );
    // No re-grant of any kind -- every role stays at zero direct privileges,
    // matching production exactly (access is mediated entirely by the four
    // SECURITY DEFINER functions 20260813030000 installs).
    expect(hardening).not.toMatch(/GRANT/);
  });
});
