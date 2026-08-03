import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

const ROOT = resolve(__dirname, "../..");
const CHECKLIST = readFileSync(resolve(ROOT, "docs/seo/analytics-owner-setup-checklist.md"), "utf8");
const LAUNCH = readFileSync(resolve(ROOT, "docs/seo/lighting-launch-verification.md"), "utf8");
const PLAN = readFileSync(resolve(ROOT, "docs/seo/lighting-four-week-measurement-plan.md"), "utf8");

describe("lighting analytics owner setup checklist", () => {
  it("keeps blocked-mode baseline and Day 0 semantics", () => {
    expect(CHECKLIST).toContain("GA4 BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE");
    expect(CHECKLIST).toContain("GSC BASELINE: BLOCKED — AUTHENTICATED ACCESS UNAVAILABLE");
    expect(CHECKLIST).toContain("MEASUREMENT DAY 0: UNSET");
    expect(CHECKLIST).toContain("FOUR-WEEK CLOCK: NOT STARTED");
    expect(CHECKLIST).toContain("BLOCKED — GA4/GSC OWNER SETUP REQUIRED");
  });

  it("records the restored public host without overstating analytics runtime proof", () => {
    expect(CHECKLIST).toMatch(/Intended publisher custom domain\s+\| `COMPLETE`/);
    expect(CHECKLIST).toMatch(/Production hostname and deployed tag\s+\| `COMPLETE`/);
    expect(CHECKLIST).toContain("The intercepted analytics identity still needs a browser-control bridge");
    expect(LAUNCH).toContain("DEPLOYED COMMIT HASH: NOT EXPOSED BY PUBLISHER");
    expect(LAUNCH).toContain("BLOCKED — BROWSER CONTROL BRIDGE UNAVAILABLE");
  });

  it("covers the owner actions that remain", () => {
    for (const phrase of [
      "Correct Google account and organization",
      "Correct GA4 property",
      "Read-only reporting access",
      "Enhanced measurement review",
      "Page changes based on browser history events",
      "Correct property type and scope",
      "Sitemap submission",
      "URL Inspection access",
      "Read-only or owner-approved access path",
    ]) {
      expect(CHECKLIST).toContain(phrase);
    }
    expect(CHECKLIST).toContain("one intentional `page_view` per navigation");
    expect(CHECKLIST).toContain("zero duplicate automatic page views");
  });

  it("preserves stream identity without inventing the property ID", () => {
    for (const document of [CHECKLIST, LAUNCH, PLAN]) {
      expect(document).toContain("Verdant Grow Diary");
      expect(document).toContain("https://verdantgrowdiary.com");
      expect(document).toContain("15065867361");
      expect(document).toContain(GOOGLE_ANALYTICS_MEASUREMENT_ID);
    }
    expect(CHECKLIST).toMatch(/numeric property ID \*\*must not be inferred\*\*/);
    expect(CHECKLIST).not.toMatch(/properties\/\d+/);
  });

  it("keeps secrets and zero-value fabrication out of the handoff", () => {
    expect(CHECKLIST).toContain("Never paste a Google password");
    expect(CHECKLIST).toContain("Do not send credential values");
    expect(CHECKLIST).toContain("Authenticated no-data is `NO_DATA`");
    expect(CHECKLIST).toContain("without inventing zero metrics");
    expect(CHECKLIST).not.toMatch(/ya29\.[A-Za-z0-9_-]+/);
    expect(CHECKLIST).not.toMatch(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/);
    expect(CHECKLIST).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
  });
});
