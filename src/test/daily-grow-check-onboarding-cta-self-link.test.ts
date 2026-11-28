/**
 * Friction item 3 (field-notebook walk, 2026-11-19): on /daily-check the
 * onboarding card's "Start Daily Grow Check" button linked to /daily-check.
 */
import { describe, expect, it } from "vitest";
import { isCtaForCurrentPath } from "@/lib/dailyGrowCheckOnboardingRules";
import { appDocumentTitleForPath } from "@/lib/appDocumentTitleRules";

describe("isCtaForCurrentPath", () => {
  it("matches the same page, ignoring query, hash and a trailing slash", () => {
    expect(isCtaForCurrentPath("/daily-check", "/daily-check")).toBe(true);
    expect(isCtaForCurrentPath("/daily-check?plantId=p1", "/daily-check/")).toBe(true);
    expect(isCtaForCurrentPath("/daily-check#step-1", "/daily-check")).toBe(true);
  });

  it("keeps the button for other pages and unknown paths", () => {
    expect(isCtaForCurrentPath("/daily-check", "/dashboard")).toBe(false);
    expect(isCtaForCurrentPath("/tents", "/daily-check")).toBe(false);
    expect(isCtaForCurrentPath("/daily-check", null)).toBe(false);
    expect(isCtaForCurrentPath("", "/daily-check")).toBe(false);
  });
});

describe("one name for /daily-check", () => {
  it("the browser tab says Quick Log, like the page header", () => {
    expect(appDocumentTitleForPath("/daily-check")).toBe("Quick Log | Verdant Grow Diary");
  });
});
