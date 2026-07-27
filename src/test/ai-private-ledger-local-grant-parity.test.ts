import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");
const SEED = readFileSync(resolve(ROOT, "supabase/seed.sql"), "utf8");
const RESULT_CACHE = readFileSync(
  resolve(ROOT, "supabase/migrations/20260719043000_ai_credit_result_cache.sql"),
  "utf8",
);
const RETURN_COHORT = readFileSync(
  resolve(ROOT, "supabase/migrations/20260717010000_paid_return_cohort_measurement.sql"),
  "utf8",
);
const EVIDENCE_RECEIPTS = readFileSync(
  resolve(ROOT, "supabase/migrations/20260719180000_ai_doctor_review_evidence_receipts.sql"),
  "utf8",
);

const READ_ONLY_SIDECARS = [
  "ai_credit_spend_results",
  "ai_doctor_review_evidence_receipts",
] as const;
const SERVICE_PRIVATE_LEDGERS = [
  "paid_return_cohort_memberships",
  "ai_doctor_review_completions",
] as const;

describe("local parity grants for private AI ledgers", () => {
  it("keeps the canonical migrations explicit about each private table boundary", () => {
    expect(RESULT_CACHE).toContain(
      "REVOKE ALL ON TABLE public.ai_credit_spend_results FROM service_role",
    );
    expect(RESULT_CACHE).toContain(
      "GRANT SELECT ON TABLE public.ai_credit_spend_results TO service_role",
    );
    expect(EVIDENCE_RECEIPTS).toContain(
      "REVOKE ALL ON TABLE public.ai_doctor_review_evidence_receipts FROM service_role",
    );
    expect(EVIDENCE_RECEIPTS).toContain(
      "GRANT SELECT ON TABLE public.ai_doctor_review_evidence_receipts TO service_role",
    );
    for (const table of SERVICE_PRIVATE_LEDGERS) {
      expect(RETURN_COHORT).toContain(`REVOKE ALL ON TABLE public.${table} FROM authenticated`);
      expect(RETURN_COHORT).toContain(`GRANT ALL ON TABLE public.${table} TO service_role`);
    }
  });

  it("reapplies read-only sidecar ACLs after the blanket local parity grant", () => {
    const hardeningStart = SEED.indexOf("AI result and evidence sidecars are server-readable");
    expect(hardeningStart).toBeGreaterThan(
      SEED.indexOf("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES"),
    );

    const hardening = SEED.slice(
      hardeningStart,
      SEED.indexOf("Paid-return cohort membership", hardeningStart),
    );
    for (const table of READ_ONLY_SIDECARS) {
      expect(hardening).toContain(`'${table}'`);
    }
    expect(hardening).toContain(
      "'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role'",
    );
    expect(hardening).toContain("'GRANT SELECT ON TABLE public.%I TO service_role'");
  });

  it("reapplies server-private ledger ACLs without removing trusted writes", () => {
    const hardeningStart = SEED.indexOf("Paid-return cohort membership");
    expect(hardeningStart).toBeGreaterThan(
      SEED.indexOf("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES"),
    );

    const hardening = SEED.slice(
      hardeningStart,
      SEED.indexOf("Irrigation event history is browser-read-only", hardeningStart),
    );
    for (const table of SERVICE_PRIVATE_LEDGERS) {
      expect(hardening).toContain(`'${table}'`);
    }
    expect(hardening).toContain("'REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated'");
    expect(hardening).toContain("'GRANT ALL ON TABLE public.%I TO service_role'");
  });
});
