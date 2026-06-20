import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

const PRICING_CONSTANTS = readProjectFile("src/constants/pricing.ts");
const BILLING_PLACEHOLDER = readProjectFile("src/pages/BillingPlaceholder.tsx");
const BILLING_DOC = readProjectFile("docs/billing.md");

describe("pricing entitlement copy alignment", () => {
  it("keeps Pro Annual at the canonical $99/year across pricing and billing copy", () => {
    expect(PRICING_CONSTANTS).toMatch(/annualPrice:\s*99/);
    expect(BILLING_PLACEHOLDER).toContain("PRO_ANNUAL_PRICE_USD");
    expect(BILLING_DOC).toMatch(/\| Pro Annual\s+\| \$99\s+\| \/ year\s+\| `pro-annual`\s+\|/);

    expect(BILLING_PLACEHOLDER).not.toContain("$115");
    expect(BILLING_DOC).not.toContain("$115");
  });

  it("keeps the billing placeholder prices sourced from pricing constants", () => {
    expect(BILLING_PLACEHOLDER).toMatch(/from\s+"@\/constants\/pricing"/);
    expect(BILLING_PLACEHOLDER).toContain("PRO_MONTHLY_PRICE_USD");
    expect(BILLING_PLACEHOLDER).toContain("PRO_ANNUAL_PRICE_USD");
    expect(BILLING_PLACEHOLDER).toContain("FOUNDER_LIFETIME_PRICE_USD");
    expect(BILLING_PLACEHOLDER).toContain("FOUNDER_LIFETIME_LIMIT");
  });

  it("does not imply Founder overage or credit packs are live today", () => {
    const combined = `${PRICING_CONSTANTS}\n${BILLING_PLACEHOLDER}\n${BILLING_DOC}`;
    expect(combined).not.toMatch(/Overage applies/i);
    expect(combined).toMatch(/Additional credit packs planned later/i);
    expect(combined).toMatch(/not live yet/i);
    expect(PRICING_CONSTANTS).toContain("Credit purchase logic is not yet implemented.");
  });

  it("keeps Founder capped at 100 AI Doctor credits per month, not unlimited AI", () => {
    const combined = `${PRICING_CONSTANTS}\n${BILLING_DOC}`;
    expect(combined).toMatch(/100 AI Doctor credits \/ month/);
    expect(BILLING_DOC).toMatch(/100 AI Doctor credits per month/);
    expect(combined.toLowerCase()).not.toContain("unlimited ai");
  });

  it("keeps live-payment entitlement activation blocked from client copy", () => {
    expect(BILLING_DOC).toMatch(/writes to `public\.billing_subscriptions`/);
    expect(BILLING_DOC).toMatch(/with service role/);
    expect(BILLING_PLACEHOLDER).toMatch(/verified billing event/);
    expect(BILLING_PLACEHOLDER).not.toMatch(/grantPro|setPro|isPro\s*=\s*true/i);
    expect(BILLING_PLACEHOLDER).not.toMatch(/\.from\(["']billing_subscriptions["']\)/);
  });

  it("does not introduce checkout, webhook, or entitlement write behavior", () => {
    expect(BILLING_PLACEHOLDER).not.toMatch(/Paddle\.Checkout\.open\(/);
    expect(BILLING_PLACEHOLDER).not.toMatch(/functions\.invoke/);
    expect(BILLING_PLACEHOLDER).not.toMatch(/\.insert\(/);
    expect(BILLING_PLACEHOLDER).not.toMatch(/\.update\(/);
    expect(BILLING_PLACEHOLDER).not.toMatch(/\.delete\(/);
    expect(BILLING_PLACEHOLDER).not.toMatch(/\.upsert\(/);
  });
});
