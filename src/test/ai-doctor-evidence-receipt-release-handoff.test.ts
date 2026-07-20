import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const HANDOFF = readFileSync(
  resolve(process.cwd(), "docs/releases/ai-doctor-evidence-receipt-handoff.md"),
  "utf8",
);
const SUPABASE_CONFIG = readFileSync(resolve(process.cwd(), "supabase/config.toml"), "utf8");

describe("AI Doctor evidence-receipt release handoff", () => {
  it("pins the fail-closed deployment order and server-only configuration names", () => {
    expect(HANDOFF).toMatch(/drain or fence old `ai-doctor-review` traffic/i);
    expect(HANDOFF).toContain("LOVABLE_API_KEY");
    expect(HANDOFF).toContain("AI_DOCTOR_RECEIPT_HMAC_KEY");
    expect(HANDOFF).toContain("AI_DOCTOR_RECEIPT_HMAC_KEY_ID");
    expect(HANDOFF).toContain("PAYMENTS_ENVIRONMENT");
    expect(HANDOFF).toMatch(/never print, commit, paste, or store the key value/i);

    const completionMigration = HANDOFF.indexOf(
      "20260717010000_paid_return_cohort_measurement.sql",
    );
    const serviceOverloadMigration = HANDOFF.indexOf(
      "20260718160000_ai_credit_server_billing_environment_expand.sql",
    );
    const cacheMigration = HANDOFF.indexOf("20260719043000_ai_credit_result_cache.sql");
    const receiptMigration = HANDOFF.indexOf(
      "20260719180000_ai_doctor_review_evidence_receipts.sql",
    );
    const growIntegrityMigration = HANDOFF.indexOf(
      "20260720093000_ai_credit_grow_scope_integrity.sql",
    );
    expect(completionMigration).toBeGreaterThan(-1);
    expect(serviceOverloadMigration).toBeGreaterThan(completionMigration);
    expect(cacheMigration).toBeGreaterThan(serviceOverloadMigration);
    expect(receiptMigration).toBeGreaterThan(cacheMigration);
    expect(growIntegrityMigration).toBeGreaterThan(receiptMigration);
    expect(HANDOFF).toMatch(/Edge\s+Function before publishing the client/i);
    expect(HANDOFF).toMatch(/Never cherry-pick this chain/i);
    expect(HANDOFF).toContain("--include-all");
  });

  it("requires a disposable non-production RLS proof and rejects casual old-Edge rollback", () => {
    expect(HANDOFF).toContain("AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS=1");
    expect(HANDOFF).toContain("AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS_ALLOW_REMOTE=1");
    expect(HANDOFF).toContain("AI_CREDIT_GROW_SCOPE_INTEGRITY_HARNESS=1");
    expect(HANDOFF).toContain("AI_CREDIT_GROW_SCOPE_INTEGRITY_HARNESS_ALLOW_REMOTE=1");
    expect(HANDOFF).toMatch(/disposable non-production target/i);
    expect(HANDOFF).toMatch(/never a production smoke test/i);
    expect(HANDOFF).toMatch(/Do not casually roll back to a pre-receipt/i);
    expect(HANDOFF).toMatch(/HOLD/i);
  });

  it("pins the AI Doctor gateway JWT boundary and its unauthenticated smoke proof", () => {
    expect(SUPABASE_CONFIG).toMatch(
      /\[functions\.ai-doctor-review\]\s*\r?\n\s*verify_jwt\s*=\s*true/,
    );
    expect(HANDOFF).toContain("[functions.ai-doctor-review] verify_jwt = true");
    expect(HANDOFF).toMatch(/without `--no-verify-jwt` or `--prune`/i);
    expect(HANDOFF).toMatch(
      /an unauthenticated\s+and an invalid-JWT POST each receive a gateway `401`/i,
    );
  });

  it("pins the Lovable-managed production project and forbids the personal sandbox", () => {
    const configuredProjectId = SUPABASE_CONFIG.match(/^project_id\s*=\s*"([a-z0-9]+)"\s*$/m)?.[1];
    expect(configuredProjectId).toBe("knkwiiywfkbqznbxwqfh");
    expect(HANDOFF).toMatch(
      /Verdant production is the Lovable-managed project\s+`knkwiiywfkbqznbxwqfh`/i,
    );
    expect(HANDOFF).toMatch(
      /personal project `bzatgtgjvuojpoxcknaa` is a\s+development sandbox and must never be used/i,
    );
  });
});
