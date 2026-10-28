import { describe, expect, it } from "vitest";

import { AHREFS_WEB_ANALYTICS_SCRIPT_SRC } from "@/constants/analytics";
import { hostHeadersForPathname } from "@/lib/cloudflareHostRoutingRules";
import {
  CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER,
  buildContentSecurityPolicyReportOnly,
} from "@/lib/securityHeadersRules";

const AHREFS_ORIGIN = new URL(AHREFS_WEB_ANALYTICS_SCRIPT_SRC).origin;

function directive(csp: string, name: string): string[] {
  const part = csp
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name} `));
  return part ? part.split(/\s+/).slice(1) : [];
}

describe("report-only CSP allows the consent-gated Ahrefs Web Analytics tag", () => {
  const csp = buildContentSecurityPolicyReportOnly();

  it("lists the Ahrefs origin for the script and its collect requests", () => {
    expect(AHREFS_ORIGIN).toBe("https://analytics.ahrefs.com");
    expect(directive(csp, "script-src")).toContain(AHREFS_ORIGIN);
    expect(directive(csp, "connect-src")).toContain(AHREFS_ORIGIN);
  });

  it("does not widen frame-src or default-src for Ahrefs", () => {
    expect(directive(csp, "frame-src")).not.toContain(AHREFS_ORIGIN);
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
  });

  it("ships the Ahrefs origin in the Worker's report-only header", () => {
    const headers = hostHeadersForPathname("/");
    const value = headers.find(
      ([name]) => name === CONTENT_SECURITY_POLICY_REPORT_ONLY_HEADER,
    )?.[1];
    expect(value).toBe(csp);
  });
});
