/**
 * Paid-launch gate static contracts: replay bounds + rotation in the BYO
 * webhook, occurred_at ordering, founder allocation (atomic, capped,
 * service-role-only), audit append-only hardening, and the launch posture
 * (sandbox-only everywhere; live is a separate approved change).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const WEBHOOK = read("supabase/functions/paddle-webhook/index.ts");
const VERIFIER = read("supabase/functions/paddle-webhook/verifyPaddleSignature.ts");
const MIGRATION = read(
  "supabase/migrations/20260714230000_paddle_paid_launch_ordering_and_founder.sql",
);

describe("webhook verification — replay bounds + rotation enforced at runtime", () => {
  it("routes through verifyPaddleWebhookSignature with explicit bounds", () => {
    expect(WEBHOOK).toMatch(/await verifyPaddleWebhookSignature\(/);
    expect(WEBHOOK).toMatch(/SIGNATURE_MAX_AGE_SECONDS = 300/);
    expect(WEBHOOK).toMatch(/SIGNATURE_MAX_FUTURE_SKEW_SECONDS = 60/);
    expect(WEBHOOK).toMatch(/maxAgeSeconds: SIGNATURE_MAX_AGE_SECONDS/);
    // The old unbounded inline path is gone.
    expect(WEBHOOK).not.toMatch(/constantTimeEqual\(expected, parsed\.h1\)/);
  });

  it("verifier supports rotation: all h1 values compared, constant-time, no early exit", () => {
    expect(VERIFIER).toMatch(/h1s: readonly string\[\]/);
    expect(VERIFIER).toMatch(/for \(const candidate of parsed\.h1s\)/);
    expect(VERIFIER).toMatch(/if \(constantTimeEqual\(expected, candidate\)\) anyMatch = true;/);
  });

  it("sandbox-only request gate is intact (live remains blocked)", () => {
    expect(WEBHOOK).toMatch(/PADDLE_ENVIRONMENT !== "sandbox"/);
    expect(WEBHOOK).toMatch(/sandbox_only/);
  });
});

describe("ordering hardening — older events cannot overwrite newer state", () => {
  it("processing rows carry provider occurred_at", () => {
    expect(MIGRATION).toMatch(
      /ALTER TABLE public\.paddle_event_processing\s+ADD COLUMN IF NOT EXISTS occurred_at timestamptz/,
    );
    expect(WEBHOOK).toMatch(/occurred_at: readString\(row\.payload\?\.occurred_at\) \?\? null/);
  });

  it("the updater blocks stale ordering for ALL statuses and maintains the watermark", () => {
    expect(MIGRATION).toMatch(/stale_event_ordering/);
    expect(MIGRATION).toMatch(
      /v_processing\.occurred_at < v_existing\.last_provider_event_occurred_at/,
    );
    expect(MIGRATION).toMatch(/last_provider_event_occurred_at = COALESCE\(v_processing\.occurred_at/);
    // The original period-end guard is preserved, not replaced.
    expect(MIGRATION).toMatch(/stale_processing_row/);
  });

  it("every pre-existing guard is preserved verbatim", () => {
    for (const reason of [
      "event_not_verified",
      "environment_not_allowed",
      "processing_not_processed",
      "founder_allocation_deferred",
      "unknown_plan",
      "missing_verified_customer_link",
      "existing_provider_identifier_conflict",
      "founder_row_not_overwritten",
      "existing_non_paddle_subscription",
      "already_applied",
    ]) {
      expect(MIGRATION).toContain(reason);
    }
  });
});

describe("founder lifetime — one-time, atomic, capped, idempotent", () => {
  it("allocation requires a verified completed paid transaction and a verified link", () => {
    expect(MIGRATION).toMatch(/founder_requires_completed_transaction/);
    expect(MIGRATION).toMatch(/IS DISTINCT FROM 'transaction\.completed'/);
    expect(MIGRATION).toMatch(/not_a_founder_candidate/);
    // Attribution via verified customer link, never email matching.
    const founderFn = MIGRATION.slice(MIGRATION.indexOf("allocate_founder_lifetime("));
    expect(founderFn).toMatch(/link_status = 'linked'/);
    expect(founderFn).toMatch(/confidence = 'verified'/);
    // Comments may DOCUMENT the no-email rule; the SQL itself must not touch
    // email anywhere.
    const sqlOnly = MIGRATION.replace(/--[^\n]*/g, "");
    expect(sqlOnly.toLowerCase()).not.toMatch(/\bemail\b/);
  });

  it("allocation is serialized by an advisory lock with the cap enforced in SQL", () => {
    expect(MIGRATION).toMatch(/pg_advisory_xact_lock\(hashtext\('billing_subscriptions_founder_allocation'\)\)/);
    expect(MIGRATION).toMatch(/c_founder_cap constant integer := 75/);
    expect(MIGRATION).toMatch(/founder_cap_reached/);
  });

  it("duplicate founder events are noops, never a second number", () => {
    expect(MIGRATION).toMatch(/already_founder/);
  });

  it("both founder functions are service_role-only", () => {
    for (const fn of [
      "allocate_founder_lifetime(uuid)",
      "allocate_founder_lifetime_with_audit(uuid)",
    ]) {
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC;`);
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM anon;`);
      expect(MIGRATION).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM authenticated;`);
      expect(MIGRATION).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
    }
  });

  it("the webhook routes founder candidates to the founder RPC, others to the updater", () => {
    expect(WEBHOOK).toMatch(/processing\.isFounderCandidate\s*\?\s*"allocate_founder_lifetime_with_audit"\s*:\s*"apply_paddle_subscription_update_with_audit"/);
  });

  it("founder allocation stays sandbox-only until live is explicitly approved", () => {
    const founderFn = MIGRATION.slice(MIGRATION.indexOf("allocate_founder_lifetime("));
    expect(founderFn).toMatch(/v_processing\.environment <> 'sandbox' OR v_event\.environment <> 'sandbox'/);
  });
});

describe("audit history — append-only", () => {
  it("audit UPDATEs are denied by trigger; wrapper writes sanitized rows", () => {
    expect(MIGRATION).toMatch(/billing_subscription_update_audit_deny_update/);
    expect(MIGRATION).toMatch(/BEFORE UPDATE ON public\.billing_subscription_update_audit/);
    // Wrapper never writes provider ids or payloads into the audit row.
    const wrapper = MIGRATION.slice(
      MIGRATION.indexOf("allocate_founder_lifetime_with_audit("),
    );
    expect(wrapper).not.toMatch(/provider_customer_id|provider_subscription_id|payload/);
  });
});

describe("launch posture — no live enable, no secrets, no client writes", () => {
  it("this slice never enables the live environment anywhere", () => {
    for (const src of [MIGRATION, WEBHOOK]) {
      // The only mentions of live must be inside comments about the separate
      // approval; no code path may compare-equal to accept 'live'.
      const stripped = src
        .replace(/--[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
      expect(stripped).not.toMatch(/=\s*'live'|===\s*["']live["']/);
    }
  });

  it("no secret values or service-role client code appear in gate files", () => {
    const priceFn = read("supabase/functions/get-paddle-price/index.ts");
    for (const src of [MIGRATION, priceFn]) {
      expect(src).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); // JWT-shaped literal
    }
    const priceCode = priceFn
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    expect(priceCode).not.toMatch(/SERVICE_ROLE/i);
  });
});
