import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const DOC_PATH = resolve(
  __dirname,
  "..",
  "..",
  "docs",
  "billing-level-two-sandbox-migration-operator-runbook.md",
);

const TYPECHECK_CMD = "npm.cmd run typecheck";
const VITEST_CMD =
  "npx.cmd vitest run src/test/billing-level-two-migration-apply-order-doc-static.test.ts src/test/billing-level-two-launch-gate-doc-static.test.ts src/test/billing-level-two-sandbox-verification-runbook-doc-static.test.ts src/test/operator-billing-entitlement-resolution-audit-static.test.ts src/test/operator-billing-subscription-update-audit-static.test.ts src/test/billing-subscription-update-audit-static.test.ts src/test/paddle-webhook-subscription-update-static.test.ts src/test/paddle-subscription-update-rpc-static.test.ts --reporter=verbose";
const BUILD_CMD = "npm.cmd run build";

describe("billing level two sandbox migration operator runbook (docs/static-only)", () => {
  it("runbook doc file exists", () => {
    expect(existsSync(DOC_PATH)).toBe(true);
  });

  const doc = existsSync(DOC_PATH) ? readFileSync(DOC_PATH, "utf8") : "";
  const lower = doc.toLowerCase();

  it("declares docs/static-only, sandbox-only, and does not approve live mode", () => {
    expect(lower).toContain("docs/static-only");
    expect(lower).toContain("sandbox-only");
    expect(lower).toContain("does not approve live mode");
  });

  it("includes the exact typecheck validation command", () => {
    expect(doc).toContain(TYPECHECK_CMD);
  });

  it("includes the exact targeted vitest validation command", () => {
    expect(doc).toContain(VITEST_CMD);
  });

  it("includes the exact build validation command", () => {
    expect(doc).toContain(BUILD_CMD);
  });

  it("references all three operator routes", () => {
    expect(doc).toContain("/operator/paddle-processing");
    expect(doc).toContain("/operator/billing-subscription-updates");
    expect(doc).toContain("/operator/billing-entitlement-resolution");
  });

  it("requires non-production / sandbox Supabase target check", () => {
    expect(lower).toMatch(/sandbox\s*\/\s*non-production|non-production/);
    expect(lower).toContain("not production");
  });

  it("requires service-role and Paddle secret safety", () => {
    expect(lower).toContain("service-role keys and paddle secrets");
    expect(lower).toContain("not printed or pasted");
  });

  it("references the migration apply order doc", () => {
    expect(doc).toContain("docs/billing-level-two-migration-apply-order.md");
  });

  it("explicitly blocks live mode, Founder allocation, and checkout-success grants", () => {
    expect(lower).toContain("- live mode");
    expect(lower).toContain("- founder allocation");
    expect(lower).toContain("- checkout-success entitlement grant");
  });

  it("explicitly blocks browser/client billing writes", () => {
    expect(lower).toContain("browser/client billing writes");
  });

  it("explicitly blocks direct webhook writes to billing_subscriptions", () => {
    expect(lower).toContain("direct webhook writes to `billing_subscriptions`");
  });

  it("explicitly blocks raw provider IDs and Paddle payload JSON in operator UI", () => {
    expect(lower).toContain("raw provider ids in operator ui");
    expect(lower).toContain("paddle payload json in operator ui");
  });

  it("explicitly blocks grow-room/device automation", () => {
    expect(lower).toContain("grow-room/device automation");
  });

  it("does not contain Paddle payload JSON-looking examples", () => {
    expect(doc).not.toMatch(/\{\s*"[a-z_]+"\s*:/i);
  });
});
