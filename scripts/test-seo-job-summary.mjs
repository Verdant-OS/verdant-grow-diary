#!/usr/bin/env node
/**
 * Safety test: verify seo-job-summary.md and seo-allowlist-dry-run.*
 * do not leak env values that look like secrets.
 *
 * Runs the dry-run command in a child process with fake env vars, then
 * asserts none of them appear in generated artifact contents.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

const ROOT = process.cwd();
const SCRIPT = resolve(ROOT, "scripts/seo/gsc-inspect-urls.mjs");
const ALLOWLIST = resolve(ROOT, "config/seo-allowlist.json");
const SECRET_VALUES = {
  GSC_CLIENT_ID: "SECRET_CLIENT_ID_ABC123",
  GSC_CLIENT_SECRET: "SECRET_CLIENT_SECRET_XYZ789",
  GSC_REFRESH_TOKEN: "SECRET_REFRESH_TOKEN_QQQ111",
  GSC_SITE_URL: "https://verdantgrowdiary.com/",
};

test("dry-run artifacts stay isolated and do not leak env secret values", () => {
  const workspace = mkdtempSync(join(tmpdir(), "verdant-seo-summary-"));
  const artifacts = resolve(workspace, "artifacts/seo");
  const stepSummary = resolve(artifacts, "test-step-summary.md");
  assert.equal(
    artifacts.startsWith(`${ROOT}${sep}`),
    false,
    "test artifacts must stay outside the repository",
  );
  try {
    const res = spawnSync(
      process.execPath,
      [
        SCRIPT,
        "--dry-run-allowlist",
        "--urls",
        "https://verdantgrowdiary.com/,https://verdantgrowdiary.com/auth/callback",
        "--allowlist",
        ALLOWLIST,
        "--now",
        "2026-07-02T00:00:00Z",
      ],
      {
        cwd: workspace,
        env: { ...process.env, ...SECRET_VALUES, GITHUB_STEP_SUMMARY: stepSummary },
        encoding: "utf8",
      },
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
    for (const f of files) {
      const p = resolve(artifacts, f);
      assert.ok(existsSync(p), `missing artifact ${f}`);
      const c = readFileSync(p, "utf8");
      for (const s of forbidden) {
        assert.equal(c.includes(s), false, `${f} leaks secret ${s}`);
      }
    }
    if (existsSync(stepSummary)) {
      const c = readFileSync(stepSummary, "utf8");
      for (const s of forbidden) assert.equal(c.includes(s), false, `step summary leaks ${s}`);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
