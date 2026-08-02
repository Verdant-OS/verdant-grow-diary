import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { findGuideBySlug } from "@/constants/verdantSeoContent";
import { FUNNEL_EVENTS } from "@/lib/funnelAnalytics";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

const LIGHTING_GUIDE_SLUGS = [
  "cannabis-grow-light-distance-and-schedule",
  "cannabis-light-stress-light-burn-bleaching-or-heat",
] as const;

const GUIDE_PAGE = read("src/pages/GuidePage.tsx");
const EVENT_MAP = read("docs/v0-loop-event-map.md");
const MEASUREMENT_PLAN = read("docs/seo/lighting-four-week-measurement-plan.md");
const OWNER_CHECKLIST = read("docs/seo/analytics-owner-setup-checklist.md");
const BASELINE = JSON.parse(read("artifacts/seo/lighting-launch-baseline.json")) as {
  pages: Array<{
    canonical_url: string;
    ga4: {
      cta_clicks: null;
      cta_clicks_status: string;
      cta_click_event_name: null;
      cta_click_destination: string;
    };
  }>;
  ga4_access: {
    guide_cta_click_measurement: Record<string, unknown>;
    blocked_fields: string[];
  };
};
const READINESS = JSON.parse(read("artifacts/seo/seo-readiness-status.json")) as {
  measurement_contract: {
    guide_cta_clicks: Record<string, unknown>;
  };
  measurement_gaps: Array<Record<string, unknown>>;
};

describe("lighting-guide CTA measurement contract", () => {
  it("keeps both public CTA destinations explicit and public", () => {
    for (const slug of LIGHTING_GUIDE_SLUGS) {
      expect(findGuideBySlug(slug)?.cta?.to).toBe("/quick-log");
    }
  });

  it("does not claim a guide CTA event where the GuidePage emits only a Link", () => {
    expect(GUIDE_PAGE).toContain("to={guide.cta.to}");
    expect(GUIDE_PAGE).not.toMatch(/trackFunnelEvent|funnelAnalytics/);
    expect([...FUNNEL_EVENTS]).not.toContain("guide_cta_clicked");
  });

  it("documents guide CTA clicks as missing instead of inferring them from downstream activity", () => {
    expect(EVENT_MAP).toContain("## Public lighting-guide CTA measurement status");
    for (const slug of LIGHTING_GUIDE_SLUGS) {
      expect(EVENT_MAP).toContain(slug);
    }
    expect(EVENT_MAP).toContain("Do not infer them");
    expect(MEASUREMENT_PLAN).toContain("Guide CTA clicks (MISSING — do not report)");
    expect(OWNER_CHECKLIST).toContain("both lighting-guide CTAs as `MISSING`");
  });

  it("keeps missing CTA clicks null and explicitly non-blocking in readiness artifacts", () => {
    expect(BASELINE.pages).toHaveLength(2);
    for (const page of BASELINE.pages) {
      expect(page.ga4).toMatchObject({
        cta_clicks: null,
        cta_clicks_status: "missing_not_implemented",
        cta_click_event_name: null,
        cta_click_destination: "/quick-log",
      });
    }

    expect(BASELINE.ga4_access.guide_cta_click_measurement).toMatchObject({
      status: "missing_not_implemented",
      event_name: null,
      destination: "/quick-log",
      day_0_blocking: false,
    });
    expect(BASELINE.ga4_access.blocked_fields).not.toContain("cta_clicks");

    expect(READINESS.measurement_contract.guide_cta_clicks).toMatchObject({
      classification: "MISSING",
      measurement_status: "NOT_MEASURED",
      reason: "MISSING_NOT_IMPLEMENTED",
      event_name: null,
      destination: "/quick-log",
      public_guide_slugs: [...LIGHTING_GUIDE_SLUGS],
      day_0_blocking: false,
    });
    expect(READINESS.measurement_gaps).toContainEqual(
      expect.objectContaining({
        id: "LIGHTING_GUIDE_CTA_ATTRIBUTION",
        priority: "P2",
        status: "NOT_MEASURED",
        classification: "MISSING",
        reason_code: "MISSING_NOT_IMPLEMENTED",
        day_0_blocking: false,
      }),
    );
  });
});
