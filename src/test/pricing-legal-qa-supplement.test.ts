/**
 * Supplemental regression pins for PR #2191 (#2169, #2170, #2176).
 * Keeps card copy, comparison table, billing controls, legal shell nav,
 * and report-only CSP aligned without renegotiating locked contract tests.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PLAN_COMPARISON } from "@/config/pricing";
import { PRICING } from "@/constants/pricing";
import {
  KNOWN_THIRD_PARTY_ORIGINS,
  buildContentSecurityPolicyReportOnly,
} from "@/lib/securityHeadersRules";

const root = resolve(process.cwd());
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

const PRICING_PAGE = read("src/pages/Pricing.tsx");
const LEGAL_SHELL = read("src/pages/legal/LegalPageShell.tsx");

function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? ""
  );
}

describe("pricing/legal QA supplement (#2169 #2170 #2176)", () => {
  it("Free card feature copy matches Grow & tent limits comparison row", () => {
    expect(PRICING.free.features).toContain("1 tent");
    const limits = PLAN_COMPARISON.find((row) => row.label === "Grow & tent limits");
    expect(limits?.values.free).toBe("1 active grow · 1 active tent");
  });

  it("Monthly and Annual billing labels keep touch-friendly sizing", () => {
    const billingLabelClasses = PRICING_PAGE.match(/min-h-11 px-2 text-sm font-medium/g) ?? [];
    expect(billingLabelClasses.length).toBeGreaterThanOrEqual(2);
    expect(PRICING_PAGE).toMatch(/>\s*Monthly\s*<\//);
    expect(PRICING_PAGE).toMatch(/>\s*Annual\s*<\//);
  });

  it("LegalPageShell exposes Back to home at / with wrap-safe header layout", () => {
    expect(LEGAL_SHELL).toMatch(/Back to home/);
    expect(LEGAL_SHELL).toMatch(/to="\/"/);
    expect(LEGAL_SHELL).toMatch(/flex-wrap/);
  });

  it("report-only CSP lists Cloudflare insights in KNOWN_THIRD_PARTY_ORIGINS and script-src", () => {
    expect(KNOWN_THIRD_PARTY_ORIGINS.cloudflareInsights).toContain(
      "https://static.cloudflareinsights.com",
    );
    const scriptSrc = directive(buildContentSecurityPolicyReportOnly(), "script-src");
    expect(scriptSrc).toContain("https://static.cloudflareinsights.com");
  });
});
