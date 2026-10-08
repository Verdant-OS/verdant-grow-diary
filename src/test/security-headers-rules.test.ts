import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { hostHeadersForPathname } from "@/lib/cloudflareHostRoutingRules";
import {
  CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER,
  FORBIDDEN_ENFORCING_HEADERS,
  buildContentSecurityPolicyReportOnly,
} from "@/lib/securityHeadersRules";

describe("report-only content security policy", () => {
  it("is deterministic and is the only CSP header the Worker attaches", () => {
    const a = buildContentSecurityPolicyReportOnly();
    const b = buildContentSecurityPolicyReportOnly();
    expect(a).toBe(b);

    for (const pathname of ["/", "/strains", "/unsubscribe", null]) {
      const headers = hostHeadersForPathname(pathname);
      const names = headers.map(([name]) => name.toLowerCase());
      expect(new Set(names).size, String(pathname)).toBe(names.length);
      expect(names.filter((name) => name === "content-security-policy-report-only")).toEqual([
        "content-security-policy-report-only",
      ]);
      for (const forbidden of FORBIDDEN_ENFORCING_HEADERS) {
        expect(names, String(pathname)).not.toContain(forbidden);
      }
      expect(headers).toContainEqual([CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER, a]);
    }
  });

  it("covers the origins the client is known to use", () => {
    const csp = buildContentSecurityPolicyReportOnly();
    const directive = (name: string) =>
      csp
        .split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${name} `)) ?? "";
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("object-src")).toBe("object-src 'none'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'self'");
    expect(directive("connect-src")).toContain("https://*.supabase.co");
    expect(directive("connect-src")).toContain("wss://*.supabase.co");
    expect(directive("connect-src")).toContain("https://*.paddle.com");
    expect(directive("connect-src")).toContain("https://api.lovable.dev");
    expect(directive("connect-src")).toContain("https://*.ingest.us.sentry.io");
    // Ingest only — never script-src/frame-src for the error reporter.
    expect(directive("script-src")).not.toContain("sentry");
    expect(directive("frame-src")).not.toContain("sentry");
    expect(directive("frame-src")).toContain("https://*.paddle.com");
    expect(directive("script-src")).toContain("https://*.paddle.com");
    expect(directive("style-src")).toContain("https://fonts.googleapis.com");
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
    // Hydration scripts/styles are inline today; nonces are a follow-up.
    expect(directive("script-src")).toContain("'unsafe-inline'");
    expect(directive("style-src")).toContain("'unsafe-inline'");
    // No directive names a service-role, bridge or Lovable AI gateway host.
    expect(csp).not.toMatch(/ai\.gateway\.lovable\.dev|service_role|bridge/i);
  });

  it("stays off the static-asset header file", () => {
    const text = readFileSync(join(__dirname, "..", "..", "public", "_headers"), "utf8");
    expect(text.toLowerCase()).not.toContain("content-security-policy");
  });
});
