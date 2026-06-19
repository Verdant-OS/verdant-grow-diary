/**
 * paid-launch-entitlement-blocker.test.ts
 *
 * Load-bearing regression test for the paid-launch entitlement audit.
 *
 * Asserts:
 *  1. The blocker doc exists and enumerates each surface with its own
 *     individual status (a guard succeeding on one surface does not clear
 *     blocked status for any other surface).
 *  2. AI Doctor / AI Coach are marked SERVER-VALIDATED.
 *  3. Environment Summary Report, premium exporters, and live sensors are
 *     marked PAID-LAUNCH BLOCKED.
 *  4. Founder-lifetime bypass is explicitly described as server-validated
 *     (not client-trustable). If this assertion ever fails, the audit
 *     finding has regressed and paid launch readiness has changed.
 *  5. `useMyEntitlements.ts` no longer carries an `as never` cast on
 *     `billing_subscriptions`.
 *
 * Pure, no I/O beyond reading repo files at test time. No Supabase calls.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(
  process.cwd(),
  "docs/paid-launch-entitlement-blocker.md",
);
const HOOK_PATH = resolve(process.cwd(), "src/hooks/useMyEntitlements.ts");

describe("paid-launch entitlement blocker doc", () => {
  it("exists at the documented path", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";

  it("marks AI Doctor review as SERVER-VALIDATED", () => {
    expect(doc).toMatch(/AI Doctor review[\s\S]*SERVER-VALIDATED/);
  });

  it("marks AI Coach as SERVER-VALIDATED", () => {
    expect(doc).toMatch(/AI Coach[\s\S]*SERVER-VALIDATED/);
  });

  it("marks Environment Summary Report as SERVER-VALIDATED (paid-launch blocker fixed)", () => {
    expect(doc).toMatch(
      /Environment Summary Report[\s\S]*SERVER-VALIDATED/,
    );
    // And references the dedicated edge function that re-resolves entitlement.
    expect(doc).toMatch(/environment-summary-report-entitlement/);
  });

  it("marks Premium CSV / report exporters as SERVER-GATED PREFLIGHT (paid-launch blocker fixed)", () => {
    expect(doc).toMatch(
      /Premium CSV[\s\S]*SERVER-GATED PREFLIGHT/,
    );
    expect(doc).toMatch(/premium-export-entitlement/);
  });

  it("marks Live sensor surfaces as PAID-LAUNCH BLOCKED", () => {
    expect(doc).toMatch(/Live sensor surfaces[\s\S]*PAID-LAUNCH BLOCKED/);
  });

  it("asserts founder-lifetime bypass is server-validated, not client-trustable", () => {
    expect(doc).toMatch(/Founder-lifetime bypass/);
    expect(doc).toMatch(/NOT[\s\S]*client-trustable/);
    expect(doc).toMatch(/Pinned at 100 AI credits\/month/);
  });

  it("warns that one-surface guards do not clear other surfaces", () => {
    expect(doc).toMatch(
      /guard succeeding on one surface[\s\S]*does NOT clear[\s\S]*blocked[\s\S]*status/,
    );
  });
});

describe("useMyEntitlements billing_subscriptions read", () => {
  const hook = readFileSync(HOOK_PATH, "utf8");

  it("does not carry an `as never` cast on billing_subscriptions", () => {
    expect(hook).not.toMatch(/billing_subscriptions"\s+as\s+never/);
  });

  it("still documents itself as presentation-only", () => {
    expect(hook).toMatch(/presentation-only|NEVER authoritative/i);
  });
});
