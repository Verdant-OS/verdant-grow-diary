import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(
  __dirname,
  "..",
  "..",
  "docs",
  "billing-level-two-sandbox-verification-runbook.md",
);

const doc = readFileSync(DOC_PATH, "utf8");
const lower = doc.toLowerCase();

describe("billing level two sandbox verification runbook doc (static)", () => {
  it("declares docs/static-only, sandbox-only, and does not approve live mode", () => {
    expect(doc).toContain("Docs/static-only.");
    expect(doc).toContain("Sandbox-only.");
    expect(doc).toContain("This does not approve live mode.");
  });

  it("references the three operator routes", () => {
    expect(doc).toContain("/operator/paddle-processing");
    expect(doc).toContain("/operator/billing-subscription-updates");
    expect(doc).toContain("/operator/billing-entitlement-resolution");
  });

  it("references the migration apply order and launch gate docs", () => {
    expect(doc).toContain("docs/billing-level-two-migration-apply-order.md");
    expect(doc).toContain("docs/billing-level-two-launch-gate.md");
  });

  it("covers Pro Monthly and Pro Annual sandbox tests", () => {
    expect(doc).toContain("Pro Monthly");
    expect(doc).toContain("Pro Annual");
  });

  it("covers duplicate webhook idempotency", () => {
    expect(lower).toContain("duplicate webhook");
    expect(lower).toContain("idempotent");
  });

  it("covers blocked/failed event audit visibility", () => {
    expect(lower).toContain("blocked");
    expect(lower).toContain("failed");
    expect(lower).toMatch(/operator audit/);
  });

  it("covers invalid signature and sandbox/live mismatch triage", () => {
    expect(lower).toContain("signature mismatch");
    expect(lower).toContain("sandbox / live environment mismatch");
  });

  it("forbids exposing service-role or Paddle secrets", () => {
    expect(lower).toContain("service-role key");
    expect(lower).toMatch(/paddle (secret|signing secret|secrets)/);
  });

  it("explicitly blocks live mode, Founder allocation, and checkout-success grant", () => {
    expect(doc).toContain("- live mode");
    expect(doc).toContain("- Founder allocation");
    expect(doc).toContain("- checkout-success entitlement grant");
  });

  it("explicitly blocks direct webhook writes to billing_subscriptions", () => {
    expect(doc).toContain("- direct webhook writes to `billing_subscriptions`");
  });

  it("explicitly blocks raw provider IDs and Paddle payload JSON in operator UI", () => {
    expect(doc).toContain("- raw provider IDs in operator UI");
    expect(doc).toContain("- Paddle payload JSON in operator UI");
  });

  it("explicitly blocks grow-room/device automation", () => {
    expect(doc).toContain("- grow-room/device automation");
  });

  it("includes Pass / Fail Criteria", () => {
    expect(doc).toContain("## Pass / Fail Criteria");
    expect(lower).toContain("pass only if");
    expect(lower).toContain("fail if");
  });

  it("does not include a JSON-looking Paddle payload example", () => {
    // No fenced code blocks containing JSON-looking objects with provider keys
    expect(doc).not.toMatch(/```json/i);
    expect(doc).not.toMatch(/"subscription_id"\s*:/);
    expect(doc).not.toMatch(/"customer_id"\s*:/);
  });
});
