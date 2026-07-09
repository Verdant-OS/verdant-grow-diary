// Tests for v1.4 diagnostics: per-URL classification diff, decision-trace
// rendering, github run context, job-summary artifact paths + run URL, and
// expanded secret redaction across every written artifact.
// Deterministic (--now); no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  diffUrlClassifications,
  renderUrlDecisionTraceMarkdown,
  githubRunContext,
} from "./seo/seoDiff.mjs";

const RUNNER = resolve("scripts/seo/gsc-inspect-urls.mjs");

const simUrl = (url, classification, extra = {}) => ({
  url,
  classification,
  never_allowlisted: classification === "never_allowlisted",
  would_suppress_issue_types: extra.types ?? [],
  matched_allowlisted_issue_entries: (extra.allow ?? []).map((id) => ({ id })),
  matched_expected_noindex_entries: (extra.noindex ?? []).map((id) => ({ id })),
  matched_expired_entries: (extra.expired ?? []).map((id) => ({
    id,
    section: "allowlisted_issues",
  })),
});

// ---- githubRunContext ------------------------------------------------------

test("githubRunContext builds the run URL from env, nulls otherwise", () => {
  assert.equal(githubRunContext({}).run_url, null);
  const ctx = githubRunContext({
    GITHUB_SERVER_URL: "https://github.com",
    GITHUB_REPOSITORY: "Verdant-OS/verdant-grow-diary",
    GITHUB_RUN_ID: "42",
  });
  assert.equal(ctx.run_url, "https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/42");
});

// ---- diffUrlClassifications ------------------------------------------------

test("diffUrlClassifications detects newly_suppressed and changed classification", () => {
  const prev = [simUrl("https://x/a", "no_match")];
  const curr = [simUrl("https://x/a", "suppressed", { allow: ["auth"], types: ["not_indexed"] })];
  const d = diffUrlClassifications(prev, curr);
  assert.equal(d.previous_available, true);
  assert.deepEqual(d.buckets.newly_suppressed, ["https://x/a"]);
  assert.equal(d.urls[0].changed, true);
  assert.equal(d.urls[0].previous_classification, "no_match");
  assert.equal(d.urls[0].changed_matched_ids, true);
});

test("diffUrlClassifications detects newly_expired and newly_unsuppressed", () => {
  const prev = [
    simUrl("https://x/a", "suppressed", { allow: ["e1"] }),
    simUrl("https://x/b", "no_match"),
  ];
  const curr = [
    simUrl("https://x/a", "no_match"),
    simUrl("https://x/b", "expired_allowlist", { expired: ["e2"] }),
  ];
  const d = diffUrlClassifications(prev, curr);
  assert.deepEqual(d.buckets.newly_unsuppressed, ["https://x/a"]);
  assert.deepEqual(d.buckets.newly_expired, ["https://x/b"]);
});

test("diffUrlClassifications with null previous => NO_BASELINE, no deltas, no crash", () => {
  const curr = [simUrl("https://x/a", "suppressed", { allow: ["auth"] })];
  const d = diffUrlClassifications(null, curr);
  assert.equal(d.previous_available, false);
  assert.equal(d.urls[0].previous_classification, null);
  assert.equal(d.urls[0].newly_suppressed, false);
  for (const b of Object.values(d.buckets)) assert.equal(b.length, 0);
});

test("previous exists but a URL is absent => that URL has null previous_classification", () => {
  const prev = [simUrl("https://x/a", "no_match")];
  const curr = [
    simUrl("https://x/a", "no_match"),
    simUrl("https://x/new", "suppressed", { allow: ["z"] }),
  ];
  const d = diffUrlClassifications(prev, curr);
  const nu = d.urls.find((u) => u.url === "https://x/new");
  assert.equal(nu.previous_classification, null);
});

// ---- renderUrlDecisionTraceMarkdown ---------------------------------------

test("decision trace renders matched IDs, expiration, prev classification and changed marker", () => {
  const curr = [
    simUrl("https://x/a", "suppressed", { allow: ["auth-entry"], types: ["not_indexed"] }),
  ];
  const prev = [simUrl("https://x/a", "no_match")];
  const d = diffUrlClassifications(prev, curr);
  const md = renderUrlDecisionTraceMarkdown(curr, d);
  assert.match(md, /Per-URL decision trace/);
  assert.match(md, /auth-entry/);
  assert.match(md, /no_match/); // previous classification shown
  assert.match(md, /newly-suppressed/);
});

test("decision trace announces NO_BASELINE when no comparable previous run", () => {
  const curr = [simUrl("https://x/a", "no_match")];
  const md = renderUrlDecisionTraceMarkdown(curr, diffUrlClassifications(null, curr));
  assert.match(md, /NO_BASELINE/);
});

// ---- subprocess: dry-run artifacts, paths, run URL, baseline transition ----

const ALLOWLIST = {
  allowlisted_issues: [
    {
      id: "auth-suppress",
      url_patterns: ["https://verdantgrowdiary.com/auth*"],
      issue_types: ["not_indexed"],
      expires_on: "2099-12-31",
    },
  ],
  expected_noindex: [
    {
      id: "auth-noindex",
      url_patterns: ["https://verdantgrowdiary.com/auth*"],
      expires_on: "2099-12-31",
    },
  ],
  never_allowlist: ["https://verdantgrowdiary.com/"],
};

function scaffoldRun() {
  const dir = mkdtempSync(join(tmpdir(), "verdant-v14-"));
  mkdirSync(join(dir, "config"), { recursive: true });
  mkdirSync(join(dir, "artifacts/seo/previous"), { recursive: true });
  writeFileSync(join(dir, "config/seo-allowlist.json"), JSON.stringify(ALLOWLIST));
  return dir;
}

const URLS =
  "https://verdantgrowdiary.com/,https://verdantgrowdiary.com/auth/callback,https://verdantgrowdiary.com/x";

function runDry(dir, extraEnv = {}) {
  return spawnSync(
    "node",
    [
      RUNNER,
      "--dry-run-allowlist",
      "--urls",
      URLS,
      "--allowlist",
      "config/seo-allowlist.json",
      "--now",
      "2026-07-02T00:00:00Z",
      "--previous-dir",
      "artifacts/seo/previous",
    ],
    { cwd: dir, encoding: "utf8", env: { ...process.env, HOME: dir, ...extraEnv } },
  );
}

test("dry-run persists url_classifications, writes per-URL trace, and reports NO_BASELINE first", () => {
  const dir = scaffoldRun();
  try {
    const r = runDry(dir);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const supp = JSON.parse(
      readFileSync(join(dir, "artifacts/seo/seo-allowlist-suppressions.json"), "utf8"),
    );
    assert.ok(Array.isArray(supp.url_classifications), "url_classifications missing");
    assert.equal(supp.url_classifications.length, 3);
    const md = readFileSync(join(dir, "artifacts/seo/seo-allowlist-suppressions.md"), "utf8");
    assert.match(md, /Per-URL decision trace/);
    assert.match(md, /Per-URL classification \(compact\)/);
    const diff = JSON.parse(
      readFileSync(join(dir, "artifacts/seo/seo-allowlist-suppressions-diff.json"), "utf8"),
    );
    assert.equal(diff.url_diff.baseline, "NO_BASELINE");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("second dry-run with a baseline reports baseline available and stable diff", () => {
  const dir = scaffoldRun();
  try {
    runDry(dir);
    cpSync(
      join(dir, "artifacts/seo/seo-allowlist-suppressions.json"),
      join(dir, "artifacts/seo/previous/seo-allowlist-suppressions.json"),
    );
    const r = runDry(dir);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const diff = JSON.parse(
      readFileSync(join(dir, "artifacts/seo/seo-allowlist-suppressions-diff.json"), "utf8"),
    );
    assert.equal(diff.url_diff.baseline, "available");
    // Identical runs → no per-URL changes.
    for (const v of Object.values(diff.url_diff.counts)) assert.equal(v, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("job-summary JSON mirrors metrics: artifact paths, run URL, and stable flag keys", () => {
  const dir = scaffoldRun();
  try {
    runDry(dir, {
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_REPOSITORY: "Verdant-OS/verdant-grow-diary",
      GITHUB_RUN_ID: "777",
    });
    const js = JSON.parse(readFileSync(join(dir, "artifacts/seo/seo-job-summary.json"), "utf8"));
    // Stable top-level keys always present.
    for (const k of [
      "status",
      "mode",
      "urls_evaluated",
      "workflow_run_url",
      "oauth_configured",
      "gsc_skipped",
      "previous_baseline_found",
      "diff_comparison_ran",
      "expired_allowlist_ids",
      "last_finding_status",
      "regression_status",
      "regression_outcome_groups",
      "artifacts",
      "notes",
    ]) {
      assert.ok(k in js, `job summary missing key ${k}`);
    }
    // Artifact paths present and stable.
    assert.equal(js.artifacts.suppressions_md, "artifacts/seo/seo-allowlist-suppressions.md");
    assert.equal(js.artifacts.job_summary_json, "artifacts/seo/seo-job-summary.json");
    // Run URL built from env.
    assert.equal(
      js.workflow_run_url,
      "https://github.com/Verdant-OS/verdant-grow-diary/actions/runs/777",
    );
    // Markdown includes the run link + stable paths.
    const md = readFileSync(join(dir, "artifacts/seo/seo-job-summary.md"), "utf8");
    assert.match(md, /actions\/runs\/777/);
    assert.match(md, /seo-allowlist-suppressions\.md/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- security / redaction across EVERY artifact ---------------------------

test("no secret-like value leaks into any written artifact", () => {
  const dir = scaffoldRun();
  const SECRETS = {
    GSC_CLIENT_ID: "LEAK_client_id_AAA",
    GSC_CLIENT_SECRET: "LEAK_client_secret_BBB",
    GSC_REFRESH_TOKEN: "LEAK_refresh_token_CCC",
    GSC_ACCESS_TOKEN: "LEAK_access_token_DDD",
    GSC_AUTH_CODE: "LEAK_auth_code_EEE",
    GSC_API_KEY: "LEAK_api_key_FFF",
    SUPABASE_SERVICE_ROLE: "LEAK_service_role_GGG",
    BRIDGE_TOKEN: "LEAK_bridge_token_HHH",
    GSC_SITE_URL: "https://verdantgrowdiary.com/",
  };
  try {
    // First run establishes a baseline, second run exercises the diff path too.
    runDry(dir, SECRETS);
    cpSync(
      join(dir, "artifacts/seo/seo-allowlist-suppressions.json"),
      join(dir, "artifacts/seo/previous/seo-allowlist-suppressions.json"),
    );
    const r = runDry(dir, SECRETS);
    assert.equal(r.status, 0, r.stderr || r.stdout);

    const forbidden = [
      ...Object.values(SECRETS).filter((v) => v.startsWith("LEAK_")),
      "service_role",
      "bridge_token",
      "refresh_token",
      "access_token",
      "authorization",
      ".seo/gsc-token.local.json",
    ];
    const files = [
      "seo-allowlist-suppressions.json",
      "seo-allowlist-suppressions.md",
      "seo-allowlist-suppressions-diff.json",
      "seo-allowlist-suppressions-diff.md",
      "seo-allowlist-dry-run.json",
      "seo-allowlist-dry-run.md",
      "seo-job-summary.json",
      "seo-job-summary.md",
    ];
    for (const f of files) {
      const p = join(dir, "artifacts/seo", f);
      assert.ok(existsSync(p), `missing artifact ${f}`);
      const c = readFileSync(p, "utf8");
      for (const s of forbidden) {
        assert.equal(c.includes(s), false, `${f} leaks "${s}"`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
