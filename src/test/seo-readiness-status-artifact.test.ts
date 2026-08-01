import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { GOOGLE_ANALYTICS_MEASUREMENT_ID } from "@/constants/analytics";

const ROOT = resolve(__dirname, "../..");
const ARTIFACT_PATH = resolve(ROOT, "artifacts/seo/seo-readiness-status.json");
const RAW_ARTIFACT = readFileSync(ARTIFACT_PATH, "utf8");
const READINESS = JSON.parse(RAW_ARTIFACT) as Record<string, unknown>;
const RAW_BASELINE = readFileSync(
  resolve(ROOT, "artifacts/seo/lighting-launch-baseline.json"),
  "utf8",
);
const BASELINE = JSON.parse(RAW_BASELINE) as Record<string, unknown>;
const IDENTITY_BEARING_ARTIFACTS = [
  RAW_ARTIFACT,
  RAW_BASELINE,
  readFileSync(resolve(ROOT, "docs/seo/analytics-owner-setup-checklist.md"), "utf8"),
  readFileSync(resolve(ROOT, "docs/seo/lighting-four-week-measurement-plan.md"), "utf8"),
  readFileSync(resolve(ROOT, "docs/seo/lighting-launch-verification.md"), "utf8"),
];
const JOB_SUMMARY = JSON.parse(
  readFileSync(resolve(ROOT, "artifacts/seo/seo-job-summary.json"), "utf8"),
) as { mode: string; status: string };

const EXPECTED_STATUS_VOCABULARY = [
  "PASS",
  "FAIL",
  "BLOCKED",
  "NO_BASELINE",
  "NO_DATA",
  "SKIPPED",
  "NOT_APPLICABLE",
];

describe("SEO readiness status artifact", () => {
  it("keeps the exact canonical blocked-mode contract and defect verdict", () => {
    expect(READINESS).toMatchObject({
      schema_version: 1,
      scope: "LIGHTING_LAUNCH_MEASUREMENT",
      timezone: "America/Chicago",
      artifact_semantics: "POINT_IN_TIME_EVIDENCE_SNAPSHOT",
      operating_mode: "MODE_A_ACCESS_BLOCKED_READINESS_WORK",
      verdict: "NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND",
      status_vocabulary: EXPECTED_STATUS_VOCABULARY,
      production_status: "PASS",
      analytics_identity_status: "FAIL",
      technical_seo_status: "FAIL",
      ga4_access_status: "BLOCKED",
      gsc_access_status: "BLOCKED",
      day_0_status: "UNSET",
      four_week_clock_status: "NOT_STARTED",
    });

    expect(Number.isNaN(Date.parse(String(READINESS.generated_at)))).toBe(false);
    expect(String(READINESS.generated_at)).toMatch(/Z$/);
    expect(String(READINESS.generated_at_chicago)).toMatch(/-05:00$/);
    expect(RAW_ARTIFACT).toBe(`${JSON.stringify(READINESS, null, 2)}\n`);
  });

  it("pins repository, deploy, and production identities with observed equality", () => {
    expect(READINESS.run_context).toEqual({
      repository: "Verdant-OS/verdant-grow-diary",
      branch: "codex/fix-guide-jsonld-hydration",
      head: "591081b387ae9a6d9eb00aeb1f4ed9b43c90cc7d",
      deploy_branch: "verdant-grow-diary",
      deploy_branch_head: "591081b387ae9a6d9eb00aeb1f4ed9b43c90cc7d",
      head_equals_deploy_branch_head: true,
      working_tree_status: "DIRTY_READINESS_WORK",
    });
    expect(READINESS.production).toMatchObject({
      host: "https://verdantgrowdiary.com",
      observed_at: "2026-08-01T03:58:28.982Z",
      manifest_commit: "2560d83a6b740cb9d6c4521bc6edc083977d51fc",
      build_time: "2026-08-01T01:40:18.366Z",
      matches_deploy_branch_head: false,
      manifest_is_ancestor_of_deploy_branch_head: true,
      source_delta_since_manifest:
        "ECOWITT_ADAPTER_HARDENING_ONLY_NO_PUBLIC_SEO_OR_ANALYTICS_RUNTIME_CHANGE",
      production_publish_required: true,
      release_content_match: "PASS",
      sitemap_url_count: 51,
      robots_declares_production_sitemap: true,
      robots_protects_app_prefixes: true,
    });
  });

  it("records version, both unique lighting routes, sitemap, and robots as HTTP 200", () => {
    const endpoints = (READINESS.production as { endpoints: unknown[] }).endpoints;
    expect(endpoints).toEqual(
      expect.arrayContaining([
        { path: "/version.json", http_status: 200 },
        {
          path: "/guides/cannabis-grow-light-distance-and-schedule",
          http_status: 200,
          sitemap_occurrences: 1,
        },
        {
          path: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          http_status: 200,
          sitemap_occurrences: 1,
        },
        { path: "/sitemap.xml", http_status: 200 },
        { path: "/robots.txt", http_status: 200 },
      ]),
    );
  });

  it("keeps direct-load indexability distinct from the route-runtime structured-data failure", () => {
    expect(READINESS.technical_seo_status).toBe("FAIL");
    expect(READINESS.technical_seo).toMatchObject({
      lighting_pages: "FAIL",
      direct_load_indexability: "PASS",
      route_runtime_structured_data: "FAIL",
      robots: "PASS",
      sitemap: "PASS",
      protected_route_exclusion: "PASS",
    });
    expect((BASELINE.launch_gates as Record<string, string>).route_runtime_structured_data).toBe(
      "fail_non_blocking",
    );
  });

  it("separates passing collection evidence from unavailable authenticated baselines", () => {
    expect(READINESS.analytics_identity).toMatchObject({
      last_full_verified_at: "2026-08-01T03:58:28.982Z",
      verification_method: "INTERCEPTED_BROWSER_COLLECTION_REQUESTS",
      test_events_transmitted: false,
      stream_identity_status: "PASS",
      stream_identity_evidence: "OWNER_CONFIRMED_VALUES_MATCH_DEPLOYED_PRODUCTION_TAG",
      stream: {
        name: "Verdant Grow Diary",
        url: "https://verdantgrowdiary.com",
        stream_id: "15065867361",
        measurement_id: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      },
      property_id: null,
      guide_page_identity: "PASS",
      route_specific_titles: "PASS",
      duplicate_page_views: "FAIL",
      explicit_spa_page_view_identity: "PASS",
      automatic_history_page_views: "FAIL_OWNER_REVIEW_REQUIRED",
      protected_id_masking: "PASS",
    });
    expect(READINESS.ga4).toEqual({
      status: "BLOCKED",
      reason: "AUTHENTICATED_ACCESS_UNAVAILABLE",
      baseline_status: "BLOCKED",
      collection_contract_status: "FAIL",
      stream_identity_status: "PASS",
      property_identity_status: "BLOCKED",
      stream: {
        name: "Verdant Grow Diary",
        url: "https://verdantgrowdiary.com",
        stream_id: "15065867361",
        measurement_id: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      },
      property_id: null,
      authenticated_reporting_available: false,
      metrics: null,
    });
    expect(READINESS.gsc).toMatchObject({
      status: "BLOCKED",
      reason: "AUTHENTICATED_ACCESS_UNAVAILABLE",
      baseline_status: "BLOCKED",
      authenticated_reporting_available: false,
      latest_workflow_run:
        "https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/30681587094",
      latest_workflow_status: "PASS",
      operation_status: "SKIPPED",
      access_status: "BLOCKED",
      execution_status: "SKIPPED",
      oauth_configured: false,
      urls_evaluated: 51,
      api_attempts: 0,
      metrics: null,
    });

    expect(JOB_SUMMARY).toEqual(expect.objectContaining({ mode: "dry-run", status: "PASS" }));
    expect(READINESS.gsc_access_status).toBe("BLOCKED");
  });

  it("agrees with the refreshed launch baseline", () => {
    const production = READINESS.production as Record<string, unknown>;
    const release = BASELINE.release as Record<string, unknown>;
    const publicProbe = BASELINE.public_probe as Record<string, unknown>;
    const baselineGa4 = BASELINE.ga4_access as Record<string, unknown>;
    const baselineGsc = BASELINE.gsc_access as Record<string, unknown>;
    const launchGates = BASELINE.launch_gates as Record<string, string>;

    expect(production.manifest_commit).toBe(release.publisher_latest_commit_sha);
    expect(production.manifest_is_ancestor_of_deploy_branch_head).toBe(
      release.production_manifest_is_ancestor_of_deploy_branch_head,
    );
    expect(production.production_publish_required).toBe(release.production_publish_required);
    expect(production.observed_at).toBe(publicProbe.observed_at);
    expect(BASELINE.artifact_semantics).toBe("POINT_IN_TIME_EVIDENCE_SNAPSHOT");
    expect(baselineGa4).toMatchObject({
      stream_identity_status: "pass_owner_confirmed_matches_production",
      stream: {
        name: "Verdant Grow Diary",
        url: "https://verdantgrowdiary.com",
        stream_id: "15065867361",
        measurement_id: GOOGLE_ANALYTICS_MEASUREMENT_ID,
      },
      property_id: null,
    });
    expect((READINESS.gsc as Record<string, unknown>).latest_workflow_run).toBe(
      baselineGsc.workflow_run,
    );
    expect(READINESS.production_status).toBe(launchGates.release_content_match.toUpperCase());
    expect(READINESS.ga4_access_status).toBe(launchGates.ga4_baseline.toUpperCase());
    expect(launchGates.ga4_stream_identity).toBe("pass");
    expect(READINESS.gsc_access_status).toBe(launchGates.gsc_baseline.toUpperCase());
    expect((READINESS.measurement as Record<string, unknown>).measurement_start_at).toBe(
      BASELINE.measurement_start_at,
    );
  });

  it("leaves Day 0 and every weekly checkpoint unset", () => {
    expect(READINESS.measurement).toEqual({
      day_0_at_utc: null,
      day_0_at_chicago: null,
      measurement_start_at: null,
      week_1_at: null,
      week_2_at: null,
      week_3_at: null,
      week_4_at: null,
    });
  });

  it("records the three owner blockers and the point-in-time bounded-slice handoff", () => {
    expect(READINESS.open_blockers).toEqual([
      expect.objectContaining({
        id: "GA4_AUTHENTICATED_ACCESS",
        status: "BLOCKED",
        owner: "OWNER",
      }),
      expect.objectContaining({
        id: "GA4_ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS",
        status: "BLOCKED",
        owner: "OWNER",
      }),
      expect.objectContaining({
        id: "GSC_AUTHENTICATED_ACCESS",
        status: "BLOCKED",
        owner: "OWNER",
      }),
    ]);
    expect(READINESS.verified_defects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "GSC_REGRESSION_NO_BASELINE_SEMANTICS",
          priority: "P3",
          status: "FIXED_AND_POST_MERGE_VERIFIED",
        }),
        expect.objectContaining({
          id: "LIGHTING_DUPLICATE_HYDRATED_JSON_LD",
          priority: "P1",
          status: "LOCAL_FIX_VERIFIED_REQUIRES_DEPLOY",
        }),
        expect.objectContaining({
          id: "GA4_ENHANCED_MEASUREMENT_DUPLICATE_PAGE_VIEWS",
          priority: "P1",
          status: "VERIFIED_UNFIXED_OWNER_ACTION_REQUIRED",
        }),
      ]),
    );
    expect(READINESS.current_slice).toEqual({
      priority: "P1",
      id: "LIGHTING_DUPLICATE_HYDRATED_JSON_LD",
      status: "LOCAL_FIX_VERIFIED_REQUIRES_DEPLOY",
      evidence:
        "One route-owned WebPage, FAQPage, BreadcrumbList, and Article set replaces static route JSON-LD on hydration and stays current through cross-guide navigation.",
    });
    expect(READINESS.next_slice).toEqual({
      priority: "P1",
      id: "GA4_ENHANCED_MEASUREMENT_HISTORY_PAGE_VIEWS",
      status: "BLOCKED_BY_OWNER_ACCESS",
    });
    expect(RAW_ARTIFACT).not.toContain("PENDING_MERGE");
  });

  it("references only existing repository-relative artifact paths", () => {
    const artifactPaths = Object.values(READINESS.artifact_paths as Record<string, string>);
    expect(artifactPaths.length).toBeGreaterThanOrEqual(8);
    for (const artifactPath of artifactPaths) {
      expect(artifactPath).not.toMatch(/^(?:[A-Za-z]:|\\\\|\/)/);
      expect(existsSync(resolve(ROOT, artifactPath))).toBe(true);
    }
    expect(readFileSync(resolve(ROOT, ".gitignore"), "utf8")).toContain(
      "!artifacts/seo/seo-readiness-status.json",
    );
  });

  it("contains no credentials, private paths, or fake zero metrics", () => {
    expect(READINESS.reporting_access_configuration).toEqual({
      observed_at: "2026-08-01T03:59:17.0220380Z",
      audit_method: "GITHUB_SECRET_NAME_LISTING",
      configured_scopes_checked: [
        "repository",
        "environment:verdant-production",
        "environment:verdant-sandbox",
        "environment:copilot",
      ],
      configured_ga4_repository_or_environment_secret_names_found: [],
      configured_gsc_repository_or_environment_secret_names_found: [],
      expected_gsc_names_referenced_by_workflow: [
        "GSC_CLIENT_ID",
        "GSC_CLIENT_SECRET",
        "GSC_REFRESH_TOKEN",
        "GSC_SITE_URL",
      ],
      local_gsc_token_path: ".seo/gsc-token.local.json",
      local_gsc_token_available: false,
      credential_values_included: false,
    });
    expect(READINESS.privacy).toEqual({
      credentials_included: false,
      private_routes_included: false,
      private_ids_included: false,
      unavailable_metrics_are_null: true,
    });
    for (const artifact of IDENTITY_BEARING_ARTIFACTS) {
      expect(artifact).not.toMatch(/C:\\Users\\/i);
      expect(artifact).not.toMatch(/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/);
      expect(artifact).not.toMatch(/ya29\.[A-Za-z0-9_-]+/);
      expect(artifact).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
      expect(artifact).not.toMatch(
        /["']?(?:client_secret|refresh_token|access_token|api_key|service_role)["']?\s*[=:]\s*["'][^"']+["']/i,
      );
    }
    expect(RAW_ARTIFACT).not.toMatch(
      /"(?:page_views|users|sessions|impressions|clicks|ctr|average_position)"\s*:\s*0(?:[,.])/,
    );
    expect((READINESS.ga4 as { metrics: unknown }).metrics).toBeNull();
    expect((READINESS.gsc as { metrics: unknown }).metrics).toBeNull();
  });

  it("is discoverable from the human-readable launch verification", () => {
    const launchVerification = readFileSync(
      resolve(ROOT, "docs/seo/lighting-launch-verification.md"),
      "utf8",
    );
    const internalLinkMap = readFileSync(resolve(ROOT, "docs/seo/internal-link-map.md"), "utf8");
    expect(launchVerification).toContain("../../artifacts/seo/seo-readiness-status.json");
    expect(launchVerification).toContain("NOT READY — ANALYTICS INSTRUMENTATION DEFECT FOUND");
    expect(internalLinkMap).toContain("both lighting routes are live");
    expect(internalLinkMap).not.toContain("they are not claimed as deployed");
  });
});
