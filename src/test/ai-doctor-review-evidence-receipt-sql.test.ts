import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const MIGRATION = readFileSync(
  resolve(ROOT, "supabase/migrations/20260719180000_ai_doctor_review_evidence_receipts.sql"),
  "utf8",
);

describe("AI Doctor evidence receipt SQL contract", () => {
  it("creates an insert-once, bounded sidecar that cascades with the account and spend", () => {
    expect(MIGRATION).toContain("CREATE TABLE public.ai_doctor_review_evidence_receipts");
    expect(MIGRATION).toContain("spend_id uuid PRIMARY KEY");
    expect(MIGRATION).toContain("REFERENCES public.ai_credit_spends(id) ON DELETE CASCADE");
    expect(MIGRATION).toContain("user_id uuid NOT NULL");
    expect(MIGRATION).toContain("REFERENCES auth.users(id) ON DELETE CASCADE");
    expect(MIGRATION).toContain("session_id uuid NULL");
    expect(MIGRATION).not.toMatch(/session_id\s+uuid[^\n]*REFERENCES/i);
    expect(MIGRATION).toContain("jsonb_typeof(evidence) = 'object'");
    expect(MIGRATION).toContain("evidence <> '{}'::jsonb");
    expect(MIGRATION).toContain("evidence ->> 'schemaVersion' = '1'");
    expect(MIGRATION).toContain("octet_length(evidence::text) <= 65536");
    expect(MIGRATION).toContain("UNIQUE (user_id, session_id)");
    expect(MIGRATION).toContain("recorded_at timestamptz NOT NULL DEFAULT now()");
  });

  it("stores a server-secret HMAC fingerprint and key identifier, never a reusable raw prompt hash", () => {
    expect(MIGRATION).toContain("prompt_hmac_sha256 text NOT NULL");
    expect(MIGRATION).toContain("prompt_hmac_key_id text NOT NULL");
    expect(MIGRATION).toContain("hmac-sha256:");
    expect(MIGRATION).not.toMatch(/\bprompt_sha256\b/);
    expect(MIGRATION).toContain("p_prompt_hmac_sha256");
    expect(MIGRATION).toContain("p_prompt_hmac_key_id");
  });

  it("keeps evidence rows private: browser roles have neither policies nor table privileges", () => {
    expect(MIGRATION).toContain(
      "ALTER TABLE public.ai_doctor_review_evidence_receipts ENABLE ROW LEVEL SECURITY",
    );
    for (const role of ["PUBLIC", "anon", "authenticated", "service_role"]) {
      expect(MIGRATION).toContain(
        `REVOKE ALL ON TABLE public.ai_doctor_review_evidence_receipts FROM ${role}`,
      );
    }
    expect(MIGRATION).toContain(
      "GRANT SELECT ON TABLE public.ai_doctor_review_evidence_receipts TO service_role",
    );
    expect(MIGRATION).not.toMatch(/CREATE\s+POLICY[\s\S]*ai_doctor_review_evidence_receipts/i);
    expect(MIGRATION).not.toMatch(
      /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ai_doctor_review_evidence_receipts[^;]*(?:anon|authenticated)/i,
    );
    expect(MIGRATION).not.toMatch(
      /GRANT\s+(?:INSERT|UPDATE|DELETE|ALL)[^;]*ai_doctor_review_evidence_receipts[^;]*service_role/i,
    );
  });

  it("exposes only a service-role atomic finalizer with ownership, feature, and HMAC validation", () => {
    expect(MIGRATION).toMatch(
      /CREATE OR REPLACE FUNCTION public\.ai_doctor_finalize_review\(\s*p_expected_user_id uuid,\s*p_spend_id uuid,\s*p_result jsonb,\s*p_evidence jsonb,/,
    );
    expect(MIGRATION).toContain("SECURITY DEFINER");
    expect(MIGRATION).toContain("SET search_path TO 'public', 'pg_temp'");
    expect(MIGRATION).toContain("v_role IS DISTINCT FROM 'service_role'");
    expect(MIGRATION).toContain("p_evidence ->> 'schemaVersion' IS DISTINCT FROM '1'");
    expect(MIGRATION).toContain("p_prompt_hmac_sha256");
    expect(MIGRATION).toContain("p_prompt_hmac_key_id");
    expect(MIGRATION).toContain("v_spend.user_id <> p_expected_user_id");
    expect(MIGRATION).toContain("v_spend.feature <> 'ai_doctor_review'");
    expect(MIGRATION).toContain("v_spend.status <> 'spent'");
    expect(MIGRATION).toContain(
      "PERFORM pg_advisory_xact_lock(hashtext(p_expected_user_id::text))",
    );
    expect(MIGRATION).toContain("'reason', 'atomic_pair_missing'");
    expect(MIGRATION).toContain("'reason', 'receipt_conflict'");
    expect(MIGRATION).toContain("'reason', 'session_conflict'");
    expect(MIGRATION).toContain("INSERT INTO public.ai_credit_spend_results");
    expect(MIGRATION).toContain("INSERT INTO public.ai_doctor_review_evidence_receipts");
    expect(MIGRATION.indexOf("INSERT INTO public.ai_credit_spend_results")).toBeLessThan(
      MIGRATION.indexOf("INSERT INTO public.ai_doctor_review_evidence_receipts"),
    );
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.ai_credit_spend_results/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.ai_credit_spend_results/i);
    expect(MIGRATION).not.toMatch(/UPDATE\s+public\.ai_doctor_review_evidence_receipts/i);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+public\.ai_doctor_review_evidence_receipts/i);

    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(MIGRATION).toContain(
        `REVOKE ALL ON FUNCTION public.ai_doctor_finalize_review(uuid, uuid, jsonb, jsonb, text, text, text, text, text, uuid) FROM ${role}`,
      );
    }
    expect(MIGRATION).toContain(
      "GRANT EXECUTE ON FUNCTION public.ai_doctor_finalize_review(uuid, uuid, jsonb, jsonb, text, text, text, text, text, uuid) TO service_role",
    );
  });
});
