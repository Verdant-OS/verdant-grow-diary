import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

const ROOT = resolve(__dirname, "../..");
const read = (path: string) => readFileSync(resolve(ROOT, path), "utf8");
const RAW_READINESS = read("artifacts/seo/seo-readiness-status.json");
const READINESS = JSON.parse(RAW_READINESS) as Record<string, unknown>;
const BASELINE = JSON.parse(read("artifacts/seo/lighting-launch-baseline.json")) as Record<
  string,
  unknown
>;
const LAUNCH = read("docs/seo/lighting-launch-verification.md");
const PLAN = read("docs/seo/lighting-four-week-measurement-plan.md");
const CHECKLIST = read("docs/seo/analytics-owner-setup-checklist.md");

const STATUS_VOCABULARY = [
  "PASS",
  "FAIL",
  "BLOCKED",
  "NO_BASELINE",
  "NO_DATA",
  "NOT_MEASURED",
  "SKIPPED",
  "NOT_APPLICABLE",
];

function plainStatuses(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(plainStatuses);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => [
    ...(key === "status" ? [entry] : []),
    ...plainStatuses(entry),
  ]);
}

describe("SEO readiness status artifact", () => {
  it("is valid, portable JSON with a declared status vocabulary", () => {
    expect(() => JSON.parse(RAW_READINESS)).not.toThrow();
    expect(READINESS).toMatchObject({
      schema_version: 1,
      scope: "LIGHTING_LAUNCH_MEASUREMENT",
      operating_mode: "MODE_A_ACCESS_BLOCKED_READINESS_WORK",
      verdict: "NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND",
      production_status: "PASS",
      technical_seo_status: "PASS",
      analytics_identity_status: "FAIL",
      ga4_access_status: "BLOCKED",
      gsc_access_status: "BLOCKED",
      day_0_status: "UNSET",
      four_week_clock_status: "NOT_STARTED",
      status_vocabulary: STATUS_VOCABULARY,
    });
    expect(String(READINESS.generated_at)).toMatch(/Z$/);
    expect(String(READINESS.generated_at_chicago)).toMatch(/-05:00$/);
    expect(RAW_READINESS.replace(/\r\n/g, "\n")).toBe(`${JSON.stringify(READINESS, null, 2)}\n`);
    for (const status of plainStatuses(READINESS)) expect(STATUS_VOCABULARY).toContain(status);
  });

  it("records the recovered public contract without inventing deploy parity", () => {
    expect(READINESS.production).toMatchObject({
      host: "https://verdantgrowdiary.com",
      served_by: "CLOUDFLARE_LOVABLE_EDGE",
      manifest_commit: null,
      production_publish_required: false,
      release_content_match: "PASS",
      release_content_scope: "LIGHTING_GUIDES_ONLY",
      full_deploy_branch_parity: "NOT_VERIFIABLE_DEPLOYED_COMMIT_NOT_EXPOSED",
      sitemap_url_count: 55,
      robots_declares_production_sitemap: true,
      robots_protects_app_prefixes: true,
    });
    expect(READINESS.current_production_recheck).toMatchObject({
      status: "PASS",
      provider: "CLOUDFLARE_LOVABLE_EDGE",
      measurement_id_detected: true,
      deployed_commit_hash: "NOT_EXPOSED_BY_PUBLISHER",
      analytics_interception: "BLOCKED_BROWSER_CONTROL_BRIDGE_UNAVAILABLE",
    });
    const endpoints = (READINESS.production as { endpoints: Array<Record<string, unknown>> })
      .endpoints;
    expect(endpoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/version.json", http_status: 200 }),
        expect.objectContaining({
          path: "/guides/cannabis-grow-light-distance-and-schedule",
          http_status: 200,
          sitemap_occurrences: 1,
          robots: "index, follow",
        }),
        expect.objectContaining({
          path: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          http_status: 200,
          sitemap_occurrences: 1,
          robots: "index, follow",
        }),
        expect.objectContaining({ path: "/sitemap.xml", http_status: 200 }),
        expect.objectContaining({ path: "/robots.txt", http_status: 200 }),
      ]),
    );
  });

  it("keeps historical runtime evidence separate from a current static tag check", () => {
    expect(READINESS.analytics_identity).toMatchObject({
      evidence_scope: "HISTORICAL_INTERCEPTED_RUNTIME_EVIDENCE",
      stream_identity_status: "PASS",
      duplicate_page_views: "FAIL",
      automatic_history_page_views: "FAIL_OWNER_REVIEW_REQUIRED",
      protected_id_masking: "PASS",
      stream: { measurement_id: GOOGLE_ANALYTICS_MEASUREMENT_ID },
    });
    expect(READINESS.ga4).toMatchObject({
      status: "BLOCKED",
      reason: "AUTHENTICATED_ACCESS_UNAVAILABLE",
      current_production_tag_status: "PASS",
      collection_contract_status: "FAIL",
      metrics: null,
    });
  });

  it("keeps GA4/GSC metrics null and Day 0 unset until authenticated access exists", () => {
    expect(READINESS.gsc).toMatchObject({
      status: "BLOCKED",
      reason: "AUTHENTICATED_ACCESS_UNAVAILABLE",
      metrics: null,
    });
    expect(READINESS.measurement).toEqual({
      day_0_at_utc: null,
      day_0_at_chicago: null,
      measurement_start_at: null,
      week_1_at: null,
      week_2_at: null,
      week_3_at: null,
      week_4_at: null,
    });
    expect(BASELINE).toMatchObject({
      measurement_start_at: null,
      day_0_status: "unset",
      four_week_clock_status: "not_started",
      verdict: "NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND",
    });
  });

  it("keeps the remaining owner blockers and records the restored host as resolved", () => {
    const blockers = READINESS.open_blockers as Array<Record<string, unknown>>;
    expect(blockers.map((blocker) => blocker.id)).toEqual([
      "GA4_AUTHENTICATED_ACCESS",
      "GA4_ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS",
      "GSC_AUTHENTICATED_ACCESS",
    ]);
    expect(READINESS.current_slice).toMatchObject({
      priority: "P0",
      id: "GA4_ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS",
      status: "BLOCKED",
    });
    expect(READINESS.next_owner_action).toMatchObject({
      id: "COMPLETE_GA4_GSC_OWNER_SETUP_AND_RUNTIME_RECHECK",
      status: "BLOCKED",
    });
    expect(READINESS.verified_defects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "PRODUCTION_HOST_ORIGIN_MISMATCH",
          priority: "P0",
          status: "PASS",
        }),
        expect.objectContaining({
          id: "GA4_ENHANCED_MEASUREMENT_DUPLICATE_PAGE_VIEWS",
          priority: "P0",
          status: "FAIL",
        }),
      ]),
    );
  });

  it("keeps artifact paths, human handoffs, and privacy fences intact", () => {
    for (const artifactPath of Object.values(READINESS.artifact_paths as Record<string, string>)) {
      expect(artifactPath).not.toMatch(/^(?:[A-Za-z]:|\\\\|\/)/);
      expect(existsSync(resolve(ROOT, artifactPath))).toBe(true);
    }
    for (const document of [LAUNCH, PLAN, CHECKLIST]) {
      expect(document).toContain("Verdant Grow Diary");
      expect(document).toContain(GOOGLE_ANALYTICS_MEASUREMENT_ID);
      expect(document).toContain("https://verdantgrowdiary.com");
      expect(document).not.toMatch(/ya29\.[A-Za-z0-9_-]+/);
      expect(document).not.toMatch(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/);
    }
    expect(LAUNCH).toContain("NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND");
    expect(LAUNCH).toContain("DEPLOYED COMMIT HASH: NOT EXPOSED BY PUBLISHER");
    expect(PLAN).toContain("Four-week clock:");
    expect(CHECKLIST).toContain("BLOCKED — GA4/GSC OWNER SETUP REQUIRED");
  });
});
