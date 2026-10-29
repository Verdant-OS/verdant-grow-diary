/**
 * Companion to csp-ahrefs-analytics-origin.test.ts (scorer-locked): pins the
 * KNOWN_THIRD_PARTY_ORIGINS entry and forbids Ahrefs in unrelated CSP directives.
 */
import { describe, expect, it } from "vitest";

import { AHREFS_WEB_ANALYTICS_SCRIPT_SRC } from "@/constants/analytics";
import {
  KNOWN_THIRD_PARTY_ORIGINS,
  buildContentSecurityPolicyReportOnly,
} from "@/lib/securityHeadersRules";

const AHREFS_ORIGIN = new URL(AHREFS_WEB_ANALYTICS_SCRIPT_SRC).origin;

function directiveSources(csp: string, name: string): string[] {
  const part = csp
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${name} `));
  return part ? part.split(/\s+/).slice(1) : [];
}

describe("Ahrefs report-only CSP contract", () => {
  const csp = buildContentSecurityPolicyReportOnly();

  it("keeps KNOWN_THIRD_PARTY_ORIGINS aligned with the analytics script URL", () => {
    expect(AHREFS_ORIGIN).toBe("https://analytics.ahrefs.com");
    expect(KNOWN_THIRD_PARTY_ORIGINS.ahrefsAnalytics).toEqual([AHREFS_ORIGIN]);
  });

  it("allows Ahrefs only on script-src and connect-src", () => {
    expect(directiveSources(csp, "script-src")).toContain(AHREFS_ORIGIN);
    expect(directiveSources(csp, "connect-src")).toContain(AHREFS_ORIGIN);
    for (const name of [
      "default-src",
      "img-src",
      "style-src",
      "font-src",
      "media-src",
      "frame-src",
      "worker-src",
    ]) {
      expect(directiveSources(csp, name), name).not.toContain(AHREFS_ORIGIN);
    }
  });
});
