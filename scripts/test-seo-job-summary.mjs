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
import { readFileSync, existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const ART = resolve(process.cwd(), "artifacts/seo");
const SECRETS = {
  GSC_CLIENT_ID: "SECRET_CLIENT_ID_ABC123",
  GSC_CLIENT_SECRET: "SECRET_CLIENT_SECRET_XYZ789",
  GSC_REFRESH_TOKEN: "SECRET_REFRESH_TOKEN_QQQ111",
  GSC_SITE_URL: "https://verdantgrowdiary.com/",
  GITHUB_STEP_SUMMARY: resolve(ART, "test-step-summary.md"),
};

test("dry-run artifacts do not leak env secret values", () => {
  rmSync(SECRETS.GITHUB_STEP_SUMMARY, { force: true });
  const res = spawnSync(
    process.execPath,
    [
      "scripts/seo/gsc-inspect-urls.mjs",
      "--dry-run-allowlist",
      "--urls",
      "https://verdantgrowdiary.com/,https://verdantgrowdiary.com/auth/callback",
      "--allowlist",
      "config/seo-allowlist.json",
      "--now",
      "2026-07-02T00:00:00Z",
    ],
    { env: { ...process.env, ...SECRETS }, encoding: "utf8" },
  );
  assert.equal(res.status, 0, res.stderr);
  const files = [
    "seo-job-summary.md",
    "seo-allowlist-dry-run.md",
    "seo-allowlist-dry-run.json",
    "seo-allowlist-suppressions.md",
    "seo-allowlist-suppressions.json",
  ];
  const forbidden = ["SECRET_CLIENT_ID_ABC123", "SECRET_CLIENT_SECRET_XYZ789", "SECRET_REFRESH_TOKEN_QQQ111"];
  for (const f of files) {
    const p = resolve(ART, f);
    assert.ok(existsSync(p), `missing artifact ${f}`);
    const c = readFileSync(p, "utf8");
    for (const s of forbidden) {
      assert.equal(c.includes(s), false, `${f} leaks secret ${s}`);
    }
  }
  if (existsSync(SECRETS.GITHUB_STEP_SUMMARY)) {
    const c = readFileSync(SECRETS.GITHUB_STEP_SUMMARY, "utf8");
    for (const s of forbidden) assert.equal(c.includes(s), false, `step summary leaks ${s}`);
    rmSync(SECRETS.GITHUB_STEP_SUMMARY, { force: true });
  }
});
