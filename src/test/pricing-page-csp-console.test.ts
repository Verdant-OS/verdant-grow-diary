/**
 * #2170: /pricing logs one console message because Cloudflare injects
 * https://static.cloudflareinsights.com/beacon.min.js and the report-only
 * script-src does not allow that origin. Browsers print that violation.
 */
import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicyReportOnly } from "@/lib/securityHeadersRules";

function directive(csp: string, name: string): string {
  return (
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name} `)) ?? ""
  );
}

describe("pricing page report-only CSP console (#2170)", () => {
  it("allows the Cloudflare insights beacon in script-src", () => {
    const scriptSrc = directive(buildContentSecurityPolicyReportOnly(), "script-src");
    expect(scriptSrc).toContain("https://static.cloudflareinsights.com");
  });
});
