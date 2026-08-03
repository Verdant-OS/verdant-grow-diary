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
const LAUNCH_VERIFICATION = readFileSync(
  resolve(ROOT, "docs/seo/lighting-launch-verification.md"),
  "utf8",
);
const MEASUREMENT_PLAN = readFileSync(
  resolve(ROOT, "docs/seo/lighting-four-week-measurement-plan.md"),
  "utf8",
);
const IDENTITY_BEARING_ARTIFACTS = [
  RAW_ARTIFACT,
  RAW_BASELINE,
  readFileSync(resolve(ROOT, "docs/seo/analytics-owner-setup-checklist.md"), "utf8"),
  readFileSync(resolve(ROOT, "docs/seo/lighting-four-week-measurement-plan.md"), "utf8"),
  LAUNCH_VERIFICATION,
];
const JOB_SUMMARY = JSON.parse(
  readFileSync(resolve(ROOT, "artifacts/seo/seo-job-summary.json"), "utf8"),
) as Record<string, unknown>;

const EXPECTED_STATUS_VOCABULARY = [
  "PASS",
  "FAIL",
  "BLOCKED",
  "NO_BASELINE",
  "NO_DATA",
  "NOT_MEASURED",
  "SKIPPED",
  "NOT_APPLICABLE",
];

function collectPlainStatusValues(
  value: unknown,
  path = "$",
): Array<{ path: string; value: unknown }> {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectPlainStatusValues(entry, `${path}[${index}]`));
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
    const entryPath = `${path}.${key}`;
    return [
      ...(key === "status" ? [{ path: entryPath, value: entry }] : []),
      ...collectPlainStatusValues(entry, entryPath),
    ];
  });
}

describe("SEO readiness status artifact", () => {
  it("keeps the exact blocked-mode contract and current production-defect verdict", () => {
    expect(READINESS).toMatchObject({
      schema_version: 1,
      scope: "LIGHTING_LAUNCH_MEASUREMENT",
      generated_at_semantics: "EVIDENCE_SNAPSHOT_CAPTURE_TIME",
      artifact_revision: {
        revised_at: "2026-08-03T17:25:08Z",
        revision_scope: "PRODUCTION_HOST_ORIGIN_RECHECK",
        production_or_analytics_reverification_performed: true,
      },
      timezone: "America/Chicago",
      artifact_semantics: "POINT_IN_TIME_EVIDENCE_SNAPSHOT",
      operating_mode: "MODE_A_ACCESS_BLOCKED_READINESS_WORK",
      verdict: "NOT READY — PRODUCTION DEFECT FOUND",
      status_vocabulary: EXPECTED_STATUS_VOCABULARY,
      event_classification_vocabulary: [
        "IMPLEMENTED_AND_VERIFIED",
        "IMPLEMENTED_NOT_VERIFIED",
        "MISSING",
        "NOT_APPLICABLE",
        "BLOCKED_BY_ACCESS",
      ],
      production_status: "FAIL",
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
    expect(RAW_ARTIFACT.replace(/\r\n/g, "\n")).toBe(`${JSON.stringify(READINESS, null, 2)}\n`);
  });

  it("keeps every generic status field inside the declared vocabulary", () => {
    expect(READINESS.status_vocabulary_scope).toBe(
      "Every object member named exactly status uses status_vocabulary. Lifecycle detail is carried in lifecycle_state; domain-specific *_status fields document their own value sets.",
    );

    const declaredStatuses = new Set(EXPECTED_STATUS_VOCABULARY);
    for (const { path, value } of collectPlainStatusValues(READINESS)) {
      expect(declaredStatuses, path).toContain(value);
    }
  });

  it("keeps the human-readable handoff aligned with the current production recheck", () => {
    const revision = READINESS.artifact_revision as Record<string, unknown>;
    const currentRecheck = READINESS.current_production_recheck as Record<string, unknown>;
    expect(LAUNCH_VERIFICATION).toContain(`\`${revision.revised_at}\``);
    expect(LAUNCH_VERIFICATION).toContain("## Current P0 production recheck");
    expect(LAUNCH_VERIFICATION).toContain(String(currentRecheck.required_owner_action));
  });

  it("records the current deploy head separately from an unavailable public release", () => {
    expect(READINESS.run_context).toEqual({
      repository: "Verdant-OS/verdant-grow-diary",
      audit_branch: "codex/seo-production-host-outage-20260803",
      audit_head: "7efaaa5ed09a76e01e0555328e204934900f0083",
      pre_recheck_audit_head: "7efaaa5ed09a76e01e0555328e204934900f0083",
      audit_head_is_descendant_of_deploy_branch_head: true,
      deploy_branch: "verdant-grow-diary",
      deploy_branch_head: "7efaaa5ed09a76e01e0555328e204934900f0083",
      audited_release_head: null,
      audited_release_equals_deploy_branch_head: false,
      working_tree_status: "CLEAN_AT_AUDIT_START",
    });
    expect(READINESS.production).toMatchObject({
      host: "https://verdantgrowdiary.com",
      observed_at: "2026-08-03T17:25:08Z",
      served_by: "SQUARESPACE_COMING_SOON",
      manifest_commit: null,
      build_time: null,
      matches_deploy_branch_head: false,
      manifest_is_ancestor_of_deploy_branch_head: false,
      source_delta_since_manifest: "PUBLIC_HOST_DOES_NOT_EXPOSE_A_VERDANT_RELEASE",
      production_publish_required: true,
      release_content_match: "FAIL",
      release_content_scope: "LIGHTING_GUIDES_ONLY",
      full_deploy_branch_parity: "NOT_VERIFIABLE_PUBLIC_HOST_NOT_VERDANT",
      sitemap_url_count: null,
      robots_declares_production_sitemap: false,
      robots_protects_app_prefixes: false,
      last_known_verdant_release: {
        manifest_commit: "a20776993bd606f07977674934864b888a407e1c",
        evidence_scope: "HISTORICAL_ONLY_NOT_CURRENT_PRODUCTION_PROOF",
      },
    });
  });

  it("records that HTTP 200 placeholders do not satisfy the public release contract", () => {
    const endpoints = (READINESS.production as { endpoints: unknown[] }).endpoints;
    expect(endpoints).toEqual(
      expect.arrayContaining([
        {
          path: "/version.json",
          http_status: 200,
          content_identity: "SQUARESPACE_COMING_SOON",
          robots: "noindex",
        },
        {
          path: "/guides/cannabis-grow-light-distance-and-schedule",
          http_status: 200,
          sitemap_occurrences: null,
          content_identity: "SQUARESPACE_COMING_SOON",
          robots: "noindex",
        },
        {
          path: "/guides/cannabis-light-stress-light-burn-bleaching-or-heat",
          http_status: 200,
          sitemap_occurrences: null,
          content_identity: "SQUARESPACE_COMING_SOON",
          robots: "noindex",
        },
        { path: "/sitemap.xml", http_status: 401 },
        { path: "/robots.txt", http_status: 401 },
      ]),
    );
  });

  it("retains historical structured-data evidence without mistaking it for current production", () => {
    expect(READINESS.technical_seo_status).toBe("FAIL");
    expect(READINESS.technical_seo).toMatchObject({
      evidence_scope: "HISTORICAL_LAST_KNOWN_VERDANT_RELEASE",
      lighting_pages: "PASS",
      direct_load_indexability: "PASS",
      route_runtime_structured_data: "PASS",
      local_route_runtime_structured_data: "NOT_APPLICABLE",
      production_navigation_states_verified: 8,
      robots: "PASS",
      sitemap: "PASS",
      protected_route_exclusion: "PASS",
    });
    expect((BASELINE.launch_gates as Record<string, string>).route_runtime_structured_data).toBe(
      "not_verifiable_public_host_not_verdant",
    );
    expect(BASELINE.public_probe).toEqual(
      expect.objectContaining({
        evidence_scope: "HISTORICAL_LAST_KNOWN_VERDANT_RELEASE",
        production_navigation_states_verified: 8,
        structured_data_duplicate_identities_observed: 0,
        structured_data_parse_errors_observed: 0,
      }),
    );
  });

  it("separates passing collection evidence from unavailable authenticated baselines", () => {
    expect(READINESS.analytics_identity).toMatchObject({
      last_full_verified_at: "2026-08-02T02:08:43.179Z",
      verification_method: "INTERCEPTED_BROWSER_COLLECTION_REQUESTS",
      test_events_transmitted: false,
      test_events_transmitted_scope: "COMPLETED_NINE_STATE_FULL_MATRIX_ONLY",
      stream_identity_status: "PASS",
      stream_identity_evidence: "OWNER_CONFIRMED_VALUES_MATCHED_LAST_KNOWN_VERDANT_PRODUCTION_TAG",
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
      verification_counts: {
        navigation_actions: 9,
        exact_explicit_page_views: 9,
        automatic_page_views_without_explicit_page_path: 5,
        verification_events_transmitted: 0,
      },
      last_targeted_recheck_at: "2026-08-02T05:19:48.245Z",
      targeted_post_deploy_recheck: {
        scope: "DIRECT_DEEP_LINK_AND_CROSS_GUIDE_CLIENT_NAVIGATION",
        production_manifest_commit: "a20776993bd606f07977674934864b888a407e1c",
        recorded_in_commit: "913f1b9deb0934d5ce76491cbc945816f4581b73",
        interceptor_host_coverage: [
          "analytics.google.com",
          "google-analytics.com",
          "stats.g.doubleclick.net",
        ],
        collection_requests_fulfilled_locally: 5,
        escaped_collection_requests: 0,
        navigation_actions: 2,
        exact_explicit_page_views: 2,
        automatic_page_views_without_explicit_page_path: 1,
        verification_events_transmitted: 0,
        evidence_scope: "TARGETED_POST_DEPLOY_P0_RECHECK_NOT_A_FULL_MATRIX_REPLACEMENT",
        excluded_exploratory_probe:
          "A preceding exploratory browser probe omitted analytics.google.com from its interception matcher and is excluded from evidence; its transmission status is not asserted.",
      },
    });
    expect(READINESS.ga4).toEqual({
      status: "BLOCKED",
      reason: "AUTHENTICATED_ACCESS_UNAVAILABLE",
      baseline_status: "BLOCKED",
      collection_contract_status: "FAIL",
      stream_identity_status: "PASS",
      current_production_tag_status: "FAIL",
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
        "https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/30727208474",
      latest_workflow_status: "PASS",
      operation_status: "SKIPPED",
      access_status: "BLOCKED",
      execution_status: "SKIPPED",
      oauth_configured: false,
      urls_evaluated: 51,
      api_attempts: 0,
      metrics: null,
    });

    expect(READINESS.monitoring_evidence).toEqual({
      workflow_status: "PASS",
      workflow_run_url: "https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/30727208474",
      workflow_artifact_name: "seo-monitoring-reports",
      workflow_artifact_id: 8826754533,
      workflow_artifact_archive_url:
        "https://api.github.com/repos/Verdant-OS/verdant-grow-diary/actions/artifacts/8826754533/zip",
      workflow_head: "a20776993bd606f07977674934864b888a407e1c",
      workflow_artifact_created_at: "2026-08-02T01:32:13Z",
      urls_evaluated: 51,
      gsc_access_status: "BLOCKED",
      gsc_execution_status: "SKIPPED",
      gsc_api_attempts: 0,
      repository_summary_scope: "HISTORICAL_DRY_RUN",
      repository_summary_is_current: false,
    });
    expect(JOB_SUMMARY).toEqual(
      expect.objectContaining({
        generated_at: "2026-07-02T23:49:05.536Z",
        mode: "dry-run",
        status: "PASS",
        urls_evaluated: 2,
        workflow_run_url: null,
        gsc_access_status: "NOT_APPLICABLE",
      }),
    );
    expect(READINESS.gsc_access_status).toBe("BLOCKED");
  });

  it("keeps the current public-host failure aligned with its historical evidence", () => {
    const production = READINESS.production as Record<string, unknown>;
    const release = BASELINE.release as Record<string, unknown>;
    const publicProbe = BASELINE.public_probe as Record<string, unknown>;
    const currentRecheck = READINESS.current_production_recheck as Record<string, unknown>;
    const baselineCurrentRecheck = BASELINE.current_production_recheck as Record<string, unknown>;
    const baselineGa4 = BASELINE.ga4_access as Record<string, unknown>;
    const baselineGsc = BASELINE.gsc_access as Record<string, unknown>;
    const launchGates = BASELINE.launch_gates as Record<string, string>;

    expect(release.evidence_scope).toBe("HISTORICAL_LAST_KNOWN_VERDANT_RELEASE");
    expect(publicProbe.evidence_scope).toBe("HISTORICAL_LAST_KNOWN_VERDANT_RELEASE");
    expect(production.observed_at).toBe(currentRecheck.observed_at);
    expect(production.manifest_commit).toBeNull();
    expect(production.production_publish_required).toBe(true);
    expect(production.release_content_match).toBe("FAIL");
    expect(production.full_deploy_branch_parity).toBe("NOT_VERIFIABLE_PUBLIC_HOST_NOT_VERDANT");
    expect(production.release_content_scope).toBe("LIGHTING_GUIDES_ONLY");
    expect(BASELINE.artifact_semantics).toBe("POINT_IN_TIME_EVIDENCE_SNAPSHOT");
    expect(BASELINE.generated_at).toBe(READINESS.generated_at);
    expect(baselineCurrentRecheck).toMatchObject({
      observed_at: currentRecheck.observed_at,
      status: "fail_public_host_not_verdant",
      provider: "squarespace",
      title: "Coming Soon",
      robots: "noindex",
      measurement_id_detected: false,
      deployed_commit_hash: "NOT_EXPOSED_BY_PUBLISHER",
    });
    expect(baselineGa4).toMatchObject({
      stream_identity_status: "pass_owner_confirmed_matches_production",
      current_production_tag_status: "fail_not_detected_on_squarespace_placeholder",
      current_production_collection_status: "blocked_not_verdant_app",
      production_collection_observation_scope: "COMPLETED_NINE_STATE_FULL_MATRIX_ONLY",
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
    expect(READINESS.production_status).toBe("FAIL");
    expect(launchGates.release_content_match).toBe("fail");
    expect(READINESS.technical_seo_status).toBe("FAIL");
    expect(launchGates.sitemap_and_robots).toBe("fail_http_401");
    expect(READINESS.ga4_access_status).toBe(launchGates.ga4_baseline.toUpperCase());
    expect(launchGates.ga4_stream_identity).toBe("fail_not_detected_on_squarespace_placeholder");
    expect(READINESS.gsc_access_status).toBe(launchGates.gsc_baseline.toUpperCase());
    expect((READINESS.measurement as Record<string, unknown>).measurement_start_at).toBe(
      BASELINE.measurement_start_at,
    );
    expect(baselineGa4.targeted_post_deploy_recheck).toEqual({
      observed_at: "2026-08-02T05:19:48.245Z",
      scope: "direct_deep_link_and_cross_guide_client_navigation",
      production_manifest_commit: "a20776993bd606f07977674934864b888a407e1c",
      interceptor_host_coverage: [
        "analytics.google.com",
        "google-analytics.com",
        "stats.g.doubleclick.net",
      ],
      collection_requests_fulfilled_locally: 5,
      escaped_collection_requests: 0,
      navigation_actions: 2,
      exact_explicit_page_views: 2,
      automatic_page_views_without_explicit_page_path: 1,
      verification_events_transmitted: 0,
      evidence_scope: "targeted_post_deploy_p0_recheck_not_a_full_matrix_replacement",
      excluded_exploratory_probe_transmission_status: "unknown_not_evidence",
    });
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

  it("records the production owner blocker and the current bounded-slice handoff", () => {
    expect(READINESS.open_blockers).toEqual([
      expect.objectContaining({
        id: "PRODUCTION_HOST_ORIGIN_MISMATCH",
        status: "BLOCKED",
        owner: "OWNER",
      }),
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
          id: "PRODUCTION_HOST_ORIGIN_MISMATCH",
          priority: "P0",
          status: "FAIL",
          lifecycle_state: "VERIFIED_UNFIXED_OWNER_ACTION_REQUIRED",
        }),
        expect.objectContaining({
          id: "ANALYTICS_CONTRACT_TEST_HARNESS",
          priority: "P0",
          status: "FAIL",
          lifecycle_state: "VERIFIED_UNFIXED_SEPARATE_CODE_SLICE",
        }),
        expect.objectContaining({
          id: "GSC_REGRESSION_NO_BASELINE_SEMANTICS",
          priority: "P3",
          status: "PASS",
          lifecycle_state: "FIXED_AND_POST_MERGE_VERIFIED",
        }),
        expect.objectContaining({
          id: "LIGHTING_DUPLICATE_HYDRATED_JSON_LD",
          priority: "P1",
          status: "PASS",
          lifecycle_state: "FIXED_AND_PRODUCTION_VERIFIED",
        }),
        expect.objectContaining({
          id: "GA4_ENHANCED_MEASUREMENT_DUPLICATE_PAGE_VIEWS",
          priority: "P0",
          status: "FAIL",
          lifecycle_state: "VERIFIED_UNFIXED_OWNER_ACTION_REQUIRED",
        }),
        expect.objectContaining({
          id: "STALE_SEO_READINESS_EVIDENCE",
          priority: "P3",
          status: "PASS",
          lifecycle_state: "FIXED_AND_LOCAL_VERIFIED",
        }),
        expect.objectContaining({
          id: "READINESS_ARTIFACT_PROVENANCE",
          priority: "P3",
          status: "PASS",
          lifecycle_state: "FIXED_AND_LOCAL_VERIFIED",
        }),
      ]),
    );
    const provenanceDefect = (READINESS.verified_defects as Array<Record<string, unknown>>).find(
      (defect) => defect.id === "READINESS_ARTIFACT_PROVENANCE",
    );
    expect(provenanceDefect?.evidence).toContain("a20776993bd606f07977674934864b888a407e1c");
    expect(provenanceDefect?.evidence).toContain("913f1b9deb0934d5ce76491cbc945816f4581b73");
    expect(READINESS.current_slice).toEqual({
      priority: "P0",
      id: "PRODUCTION_HOST_ORIGIN_MISMATCH",
      status: "FAIL",
      lifecycle_state: "DOCUMENTED_OWNER_RESTORE_REQUIRED",
      evidence:
        "The current production host is a noindex Squarespace placeholder rather than the Verdant release. This bounded slice records the defect without changing DNS, publisher settings, runtime code, or analytics configuration.",
    });
    expect(READINESS.next_slice).toEqual({
      priority: "P0",
      id: "ANALYTICS_CONTRACT_TEST_HARNESS_RECONCILIATION",
      status: "FAIL",
      lifecycle_state: "UNBLOCKED_SOURCE_REPAIR_REQUIRED",
    });
    expect(READINESS.next_owner_action).toEqual({
      priority: "P0",
      id: "RESTORE_PRODUCTION_HOST_AND_REVERIFY_LIGHTING_RELEASE",
      status: "BLOCKED",
      lifecycle_state: "BLOCKED_BY_OWNER_PUBLISHER_CONFIGURATION",
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
    expect(READINESS.artifact_paths).toMatchObject({
      current_monitoring_evidence: "docs/seo/lighting-launch-verification.md",
      historical_monitoring_summary_json: "artifacts/seo/seo-job-summary.json",
      historical_monitoring_summary_markdown: "artifacts/seo/seo-job-summary.md",
    });
  });

  it("contains no credentials, private paths, or fake zero metrics", () => {
    expect(READINESS.reporting_access_configuration).toEqual({
      observed_at: "2026-08-02T02:08:43.179Z",
      audit_method: "GITHUB_SECRET_NAME_LISTING_AND_CURRENT_DEPLOY_WORKFLOW",
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
    const internalLinkMap = readFileSync(resolve(ROOT, "docs/seo/internal-link-map.md"), "utf8");
    expect(LAUNCH_VERIFICATION).toContain("../../artifacts/seo/seo-readiness-status.json");
    expect(LAUNCH_VERIFICATION).toContain("NOT READY — PRODUCTION DEFECT FOUND");
    expect(LAUNCH_VERIFICATION).toContain("P0 PRODUCTION_HOST_ORIGIN_MISMATCH");
    expect(LAUNCH_VERIFICATION).toContain("Squarespace **Coming Soon** page with `noindex`");
    expect(LAUNCH_VERIFICATION).toContain(
      "A preceding exploratory browser probe omitted `analytics.google.com` from its collection-host",
    );
    expect(MEASUREMENT_PLAN).toContain("2026-08-02T05:19:48.245Z");
    expect(MEASUREMENT_PLAN).toMatch(/fulfilled\s+five\s+collection requests locally/);
    expect(MEASUREMENT_PLAN).toMatch(/zero\s+escaped\s+collection requests/);
    expect(MEASUREMENT_PLAN).toContain("its transmission status is not asserted.");
    expect(MEASUREMENT_PLAN).toMatch(/without replacing the\s+count-bearing nine-state matrix/);
    expect(MEASUREMENT_PLAN).not.toContain(
      "A later current-production re-run did not return an inspectable final envelope",
    );
    expect(internalLinkMap).toContain("last known Verdant production verification");
    expect(internalLinkMap).toContain("Squarespace `Coming Soon` page with `noindex`");
  });
});
