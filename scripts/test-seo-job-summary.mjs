#!/usr/bin/env node
/**
 * Safety test: verify seo-job-summary.md and seo-allowlist-dry-run.*
 * do not leak env values that look like secrets or mutate tracked artifacts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = resolve(ROOT, "scripts/seo/gsc-inspect-urls.mjs");
const ROOT_SUMMARIES = [
  resolve(ROOT, "artifacts/seo/seo-job-summary.json"),
  resolve(ROOT, "artifacts/seo/seo-job-summary.md"),
];

test("tracked dry-run summary scopes PASS away from authenticated GSC evidence", () => {
  const summary = JSON.parse(readFileSync(ROOT_SUMMARIES[0], "utf8"));
  const markdown = readFileSync(ROOT_SUMMARIES[1], "utf8");

  assert.equal(summary.mode, "dry-run");
  assert.equal(summary.status, "PASS");
  assert.equal(summary.status_scope, "OPERATION");
  assert.equal(summary.gsc_access_status, "NOT_APPLICABLE");
  assert.equal(summary.gsc_execution_status, "SKIPPED");
  assert.equal(summary.gsc_token_refresh_status, "SKIPPED");
  assert.equal(summary.gsc_inspection_attempted, 0);
  assert.equal(summary.gsc_inspection_succeeded, 0);
  assert.equal(summary.gsc_inspection_failed, 0);
  assert.equal(summary.gsc_skipped, true);
  assert.equal(summary.previous_baseline_found, false);

  assert.match(markdown, /Operation status:\*\* PASS/);
  assert.match(markdown, /GSC access status:\*\* NOT_APPLICABLE/);
  assert.match(markdown, /GSC execution status:\*\* SKIPPED/);
  assert.match(markdown, /Previous baseline found:\*\* no \(NO_BASELINE\)/);
  assert.match(markdown, /Dry-run — no GSC API calls/);
});

test("dry-run artifacts are isolated, scoped, and do not leak env secret values", () => {
  const dir = mkdtempSync(join(tmpdir(), "verdant-seo-job-summary-"));
  const art = resolve(dir, "artifacts/seo");
  const stepSummary = resolve(art, "test-step-summary.md");
  const rootSummaryBefore = ROOT_SUMMARIES.map((path) => readFileSync(path, "utf8"));
  const secrets = {
    GSC_CLIENT_ID: "SECRET_CLIENT_ID_ABC123",
    GSC_CLIENT_SECRET: "SECRET_CLIENT_SECRET_XYZ789",
    GSC_REFRESH_TOKEN: "SECRET_REFRESH_TOKEN_QQQ111",
    GSC_SITE_URL: "https://verdantgrowdiary.com/",
    GITHUB_STEP_SUMMARY: stepSummary,
  };

  try {
    mkdirSync(resolve(dir, "config"), { recursive: true });
    copyFileSync(
      resolve(ROOT, "config/seo-allowlist.json"),
      resolve(dir, "config/seo-allowlist.json"),
    );

    const res = spawnSync(
      process.execPath,
      [
        RUNNER,
        "--dry-run-allowlist",
        "--urls",
        "https://verdantgrowdiary.com/,https://verdantgrowdiary.com/auth/callback",
        "--allowlist",
        "config/seo-allowlist.json",
        "--now",
        "2026-07-02T00:00:00Z",
      ],
      { cwd: dir, env: { ...process.env, ...secrets }, encoding: "utf8" },
    );
    assert.equal(res.status, 0, res.stderr);

    const files = [
      "seo-job-summary.md",
      "seo-allowlist-dry-run.md",
      "seo-allowlist-dry-run.json",
      "seo-allowlist-suppressions.md",
      "seo-allowlist-suppressions.json",
    ];
    const forbidden = [
      "SECRET_CLIENT_ID_ABC123",
      "SECRET_CLIENT_SECRET_XYZ789",
      "SECRET_REFRESH_TOKEN_QQQ111",
    ];
    for (const file of files) {
      const path = resolve(art, file);
      assert.ok(existsSync(path), `missing artifact ${file}`);
      const content = readFileSync(path, "utf8");
      for (const secret of forbidden) {
        assert.equal(content.includes(secret), false, `${file} leaks secret ${secret}`);
      }
    }

    const summary = JSON.parse(readFileSync(resolve(art, "seo-job-summary.json"), "utf8"));
    assert.equal(summary.mode, "dry-run");
    assert.equal(summary.status, "PASS");
    assert.equal(summary.status_scope, "OPERATION");
    assert.equal(summary.gsc_access_status, "NOT_APPLICABLE");
    assert.equal(summary.gsc_execution_status, "SKIPPED");
    assert.equal(summary.gsc_token_refresh_status, "SKIPPED");
    assert.equal(summary.gsc_inspection_attempted, 0);
    assert.equal(summary.gsc_inspection_succeeded, 0);
    assert.equal(summary.gsc_inspection_failed, 0);
    assert.equal(summary.gsc_skipped, true);

    const markdown = readFileSync(resolve(art, "seo-job-summary.md"), "utf8");
    assert.match(markdown, /Operation status:\*\* PASS/);
    assert.match(markdown, /GSC access status:\*\* NOT_APPLICABLE/);
    assert.match(markdown, /GSC execution status:\*\* SKIPPED/);
    assert.match(markdown, /Dry-run — no GSC API calls/);

    if (existsSync(stepSummary)) {
      const content = readFileSync(stepSummary, "utf8");
      for (const secret of forbidden) {
        assert.equal(content.includes(secret), false, `step summary leaks ${secret}`);
      }
    }

    assert.deepEqual(
      ROOT_SUMMARIES.map((path) => readFileSync(path, "utf8")),
      rootSummaryBefore,
      "test must not mutate tracked SEO job summaries",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
