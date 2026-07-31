import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

const ROOT = resolve(__dirname, "../..");
const CHECKLIST = readFileSync(
  resolve(ROOT, "docs/seo/analytics-owner-setup-checklist.md"),
  "utf8",
);
const LAUNCH_VERIFICATION = readFileSync(
  resolve(ROOT, "docs/seo/lighting-launch-verification.md"),
  "utf8",
);
const MEASUREMENT_PLAN = readFileSync(
  resolve(ROOT, "docs/seo/lighting-four-week-measurement-plan.md"),
  "utf8",
);

describe("lighting analytics owner setup checklist", () => {
  it("keeps the exact blocked-mode verdict and clock state", () => {
    expect(CHECKLIST).toContain("GA4 BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE");
    expect(CHECKLIST).toContain("GSC BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE");
    expect(CHECKLIST).toContain("MEASUREMENT DAY 0: UNSET");
    expect(CHECKLIST).toContain("FOUR-WEEK CLOCK: NOT STARTED");
    expect(CHECKLIST).toContain("BLOCKED — GA4/GSC OWNER SETUP REQUIRED");
  });

  it("covers the required GA4 owner decisions", () => {
    for (const phrase of [
      "Correct Google account and organization",
      "Correct GA4 property",
      "Production web data stream",
      "Production hostname and deployed tag",
      "Read-only reporting access",
      "Enhanced measurement review",
      "Internal and developer traffic handling",
      "Both lighting paths and route-specific titles",
      "Conversion-measurement gaps documented",
    ]) {
      expect(CHECKLIST).toContain(phrase);
    }
    expect(CHECKLIST).toContain(GOOGLE_ANALYTICS_MEASUREMENT_ID);
    expect(CHECKLIST).toMatch(/numeric property ID \*\*must not be inferred\*\*/);
    expect(CHECKLIST).not.toMatch(/properties\/\d+/);
  });

  it("pins both exact lighting identities", () => {
    expect(CHECKLIST).toContain("/guides/cannabis-grow-light-distance-and-schedule");
    expect(CHECKLIST).toContain("Cannabis Grow Light Distance, PPFD & DLI Guide \\| Verdant");
    expect(CHECKLIST).toContain("/guides/cannabis-light-stress-light-burn-bleaching-or-heat");
    expect(CHECKLIST).toContain("Cannabis Light Stress: Burn, Bleaching, or Heat? \\| Verdant");
  });

  it("covers the required Search Console owner decisions", () => {
    for (const phrase of [
      "Correct Google account",
      "Correct property type and scope",
      "DNS or property verification",
      "Production hostname",
      "Sitemap submission",
      "URL Inspection access",
      "Read-only or owner-approved access path",
      "Index-request policy",
      "Credential and export safety",
    ]) {
      expect(CHECKLIST).toContain(phrase);
    }
    expect(CHECKLIST).toContain("Domain property");
    expect(CHECKLIST).toContain("https://verdantgrowdiary.com/sitemap.xml");
    expect(CHECKLIST).toContain("docs/seo-monitoring.md");
  });

  it("shows complete, incomplete, and access-blocked states with a verification handoff", () => {
    expect(CHECKLIST).toContain("`COMPLETE`");
    expect(CHECKLIST).toContain("`INCOMPLETE`");
    expect(CHECKLIST).toContain("`BLOCKED_BY_ACCESS`");
    expect(CHECKLIST).toMatch(/Exact owner action\s+\| Codex can verify afterward/);
    expect(CHECKLIST).toContain("Tell Codex only that access is ready");
    expect(CHECKLIST).toMatch(/Production hostname and deployed tag\s+\| `BLOCKED_BY_ACCESS`/);
    expect(CHECKLIST).toMatch(/Production hostname\s+\| `BLOCKED_BY_ACCESS`/);
  });

  it("forbids secret sharing and contains no credential-shaped value", () => {
    expect(CHECKLIST).toContain("Never paste a Google password");
    expect(CHECKLIST).toContain("Do not send credential values");
    expect(CHECKLIST).not.toMatch(/ya29\.[A-Za-z0-9_-]+/);
    expect(CHECKLIST).not.toMatch(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/);
    expect(CHECKLIST).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    expect(CHECKLIST).not.toMatch(
      /(?:client_secret|refresh_token|access_token|service_role)\s*[=:]\s*["'][^"']+["']/i,
    );
  });

  it("requires null-safe baseline semantics instead of fake zero metrics", () => {
    expect(CHECKLIST).toContain("Authenticated no-data is `NO_DATA`");
    expect(CHECKLIST).toContain("unavailable reporting remains `BLOCKED`");
    expect(CHECKLIST).toContain("without inventing zero metrics");
    expect(CHECKLIST).toContain("captures genuine `NO_DATA` or measured values");
  });

  it("stays concise and is linked from both launch documents", () => {
    expect(CHECKLIST.length).toBeLessThan(13_000);
    expect(LAUNCH_VERIFICATION).toContain("./analytics-owner-setup-checklist.md");
    expect(MEASUREMENT_PLAN).toContain("./analytics-owner-setup-checklist.md");
  });
});
