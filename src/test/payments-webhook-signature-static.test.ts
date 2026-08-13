/**
 * Static pin: payments-webhook uses pure HMAC verification (fail closed),
 * not client-visible secrets, and maps reason codes to 4xx/5xx.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const WEBHOOK = read("supabase/functions/payments-webhook/index.ts");
const SHARED = read("supabase/functions/_shared/paddle.ts");
const PURE = read("supabase/functions/paddle-webhook/verifyPaddleSignature.ts");
const PURCHASE_CONFIRMATION = read(
  "supabase/functions/payments-webhook/sendPurchaseConfirmation.ts",
);

describe("payments-webhook pure signature verification", () => {
  it("routes through verifyPaymentsWebhookRequest", () => {
    expect(WEBHOOK).toMatch(/verifyPaymentsWebhookRequest/);
    expect(WEBHOOK).not.toMatch(/paddle\.webhooks\.unmarshal/);
  });

  it("shared helper uses pure HMAC verifier with replay bounds", () => {
    expect(SHARED).toMatch(/verifyPaddleWebhookSignature/);
    expect(SHARED).toMatch(/PAYMENTS_WEBHOOK_MAX_AGE_SECONDS/);
    expect(SHARED).toMatch(/webhook_secret_not_configured/);
  });

  it("pure verifier documents constant-time + raw body rules", () => {
    expect(PURE).toMatch(/constantTimeEqual/);
    expect(PURE).toMatch(/hmacSha256Hex/);
    expect(PURE).toMatch(/Never includes secret/);
  });

  it("fail-closed status mapping for secret and signature reasons", () => {
    expect(WEBHOOK).toMatch(/webhook_secret_not_configured/);
    expect(WEBHOOK).toMatch(/mapVerifyFailure/);
    expect(WEBHOOK).toMatch(/status: 500/);
    expect(WEBHOOK).toMatch(/status: 401/);
  });

  it("never logs or returns secret material paths in failure body", () => {
    expect(WEBHOOK).not.toMatch(/PAYMENTS_.*WEBHOOK_SECRET\}/);
    expect(WEBHOOK).not.toMatch(/console\.(log|error)\([^)]*secret/i);
  });

  it("uses reason codes rather than raw caught errors in logs and non-200 responses", () => {
    expect(WEBHOOK).not.toMatch(/console\.error\([^)]*String\(e\)/);
    expect(WEBHOOK).not.toMatch(/console\.log\("payments-webhook result:",\s*result\.reason\)/);
    expect(WEBHOOK).toMatch(
      /result\.httpStatus\s*===\s*200\s*\?\s*result\.reason\s*:\s*"processing_failed"/,
    );
    expect(PURCHASE_CONFIRMATION).not.toMatch(
      /detail:\s*(?:String\([^)]*\)|userRes\.error\.message)/,
    );
    expect(PURCHASE_CONFIRMATION).not.toMatch(/detail:\s*result\.detail/);
  });
});
