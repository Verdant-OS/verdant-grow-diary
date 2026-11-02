import { describe, expect, it } from "vitest";
import {
  isAnalyticsCollectionHost,
  posthogCrossSubdomainCookieDomain,
} from "@/lib/posthogAnalyticsRules";

describe("PostHog collection hosts", () => {
  it("collects on the published Lovable address", () => {
    expect(isAnalyticsCollectionHost("verdantgrowdiary.verdantgrowdiary.lovable.app")).toBe(true);
  });
  it("still collects on verdantgrowdiary.com", () => {
    expect(isAnalyticsCollectionHost("verdantgrowdiary.com")).toBe(true);
  });
  it("does not collect on preview or lookalike hosts", () => {
    expect(
      isAnalyticsCollectionHost("id-preview--66255e7b-892c-4be5-8686-ab1cfc3666db.verdantgrowdiary.lovable.app"),
    ).toBe(false);
    expect(isAnalyticsCollectionHost("evil.lovable.app")).toBe(false);
  });
  it("sets no parent cookie domain on the Lovable address", () => {
    expect(posthogCrossSubdomainCookieDomain("verdantgrowdiary.verdantgrowdiary.lovable.app")).toBeNull();
  });
});
