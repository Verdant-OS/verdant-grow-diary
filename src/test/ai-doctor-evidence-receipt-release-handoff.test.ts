import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const HANDOFF = readFileSync(
  resolve(process.cwd(), "docs/releases/ai-doctor-evidence-receipt-handoff.md"),
  "utf8",
);

describe("AI Doctor evidence-receipt release handoff", () => {
  it("pins the fail-closed deployment order and server-only configuration names", () => {
    expect(HANDOFF).toMatch(/drain or fence old `ai-doctor-review` traffic/i);
    expect(HANDOFF).toContain("AI_DOCTOR_RECEIPT_HMAC_KEY");
    expect(HANDOFF).toContain("AI_DOCTOR_RECEIPT_HMAC_KEY_ID");
    expect(HANDOFF).toMatch(/never print, commit, paste, or store the key value/i);

    const cacheMigration = HANDOFF.indexOf("20260719043000_ai_credit_result_cache.sql");
    const receiptMigration = HANDOFF.indexOf(
      "20260719180000_ai_doctor_review_evidence_receipts.sql",
    );
    expect(cacheMigration).toBeGreaterThan(-1);
    expect(receiptMigration).toBeGreaterThan(cacheMigration);
    expect(HANDOFF).toMatch(/Edge Function before publishing the client/i);
  });

  it("requires a disposable non-production RLS proof and rejects casual old-Edge rollback", () => {
    expect(HANDOFF).toContain("AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS=1");
    expect(HANDOFF).toContain("AI_DOCTOR_EVIDENCE_RECEIPT_RLS_HARNESS_ALLOW_REMOTE=1");
    expect(HANDOFF).toMatch(/disposable non-production target/i);
    expect(HANDOFF).toMatch(/never a production smoke test/i);
    expect(HANDOFF).toMatch(/Do not casually roll back to a pre-receipt/i);
    expect(HANDOFF).toMatch(/HOLD/i);
  });
});
