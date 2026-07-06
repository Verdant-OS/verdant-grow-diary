#!/usr/bin/env node
/**
 * Runtime tests for verify-last-gsc-finding.mjs regression-only mode.
 * Executes the script as a subprocess against a fake project layout, so
 * we exercise real config loading, allowlist expiration, and exit codes
 * without any GSC calls or network access.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const SCRIPT = resolve(process.cwd(), "scripts/seo/verify-last-gsc-finding.mjs");

function scaffold({ config, allowlist, previous }) {
  const dir = mkdtempSync(join(tmpdir(), "verdant-verify-"));
  mkdirSync(join(dir, "config"), { recursive: true });
  mkdirSync(join(dir, "artifacts/seo/previous"), { recursive: true });
  writeFileSync(join(dir, "config/seo-last-gsc-finding.json"), JSON.stringify(config));
  writeFileSync(join(dir, "config/seo-allowlist.json"), JSON.stringify(allowlist));
  if (previous) {
    writeFileSync(
      join(dir, "artifacts/seo/previous/gsc-last-finding-verification.json"),
      JSON.stringify(previous),
    );
  }
  return dir;
}

function run(dir, args) {
  return spawnSync("node", [SCRIPT, ...args], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, HOME: dir },
  });
}

const CONFIG = {
  finding_id: "test-finding",
  description: "real finding for tests",
  affected_urls: ["https://verdantgrowdiary.com/legacy/x"],
  expected_resolution: { indexing_allowed: true },
};
const ALLOWLIST_EXPIRED = {
  allowlisted_issues: [
    {
      id: "legacy-suppress",
      url_patterns: ["https://verdantgrowdiary.com/legacy*"],
      issue_types: ["not_indexed"],
      expires_on: "2000-01-01",
    },
  ],
  expected_noindex: [],
  never_allowlist: [],
};
const ALLOWLIST_ACTIVE = {
  allowlisted_issues: [
    {
      id: "legacy-suppress",
      url_patterns: ["https://verdantgrowdiary.com/legacy*"],
      issue_types: ["not_indexed"],
      expires_on: "2099-12-31",
    },
  ],
  expected_noindex: [],
  never_allowlist: [],
};
const PREV_RESOLVED = {
  status: "resolved",
  results: [{ url: "https://verdantgrowdiary.com/legacy/x", resolved: true }],
};

test("regression mode exits 4 when previously-resolved URL is now expired-covered", () => {
  const dir = scaffold({
    config: CONFIG,
    allowlist: ALLOWLIST_EXPIRED,
    previous: PREV_RESOLVED,
  });
  try {
    const r = run(dir, ["--fail-only-previously-resolved-expired", "--now", "2026-07-02T00:00:00Z"]);
    assert.equal(r.status, 4, r.stderr || r.stdout);
    const out = JSON.parse(readFileSync(join(dir, "artifacts/seo/gsc-last-finding-verification.json"), "utf8"));
    assert.equal(out.status, "regression");
    assert.equal(out.regression_count, 1);
    assert.equal(out.urls[0].regressed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("regression mode exits 0 when allowlist is still active", () => {
  const dir = scaffold({
    config: CONFIG,
    allowlist: ALLOWLIST_ACTIVE,
    previous: PREV_RESOLVED,
  });
  try {
    const r = run(dir, ["--fail-only-previously-resolved-expired", "--now", "2026-07-02T00:00:00Z"]);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const out = JSON.parse(readFileSync(join(dir, "artifacts/seo/gsc-last-finding-verification.json"), "utf8"));
    assert.equal(out.status, "no_regression");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("regression mode exits 0 when previous run had URL as unresolved (no regression possible)", () => {
  const dir = scaffold({
    config: CONFIG,
    allowlist: ALLOWLIST_EXPIRED,
    previous: {
      status: "unresolved",
      results: [{ url: "https://verdantgrowdiary.com/legacy/x", resolved: false }],
    },
  });
  try {
    const r = run(dir, ["--fail-only-previously-resolved-expired", "--now", "2026-07-02T00:00:00Z"]);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const out = JSON.parse(readFileSync(join(dir, "artifacts/seo/gsc-last-finding-verification.json"), "utf8"));
    assert.equal(out.status, "no_regression");
    assert.equal(out.urls[0].previously_resolved, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("regression mode exits 0 when no previous verification artifact is available", () => {
  const dir = scaffold({ config: CONFIG, allowlist: ALLOWLIST_EXPIRED, previous: null });
  try {
    const r = run(dir, ["--fail-only-previously-resolved-expired", "--now", "2026-07-02T00:00:00Z"]);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const out = JSON.parse(readFileSync(join(dir, "artifacts/seo/gsc-last-finding-verification.json"), "utf8"));
    assert.equal(out.previous_available, false);
    assert.equal(out.status, "no_regression");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("regression mode is skipped safely when config is a placeholder", () => {
  const dir = scaffold({
    config: { ...CONFIG, description: "Placeholder — replace with the finding." },
    allowlist: ALLOWLIST_EXPIRED,
    previous: PREV_RESOLVED,
  });
  try {
    const r = run(dir, ["--fail-only-previously-resolved-expired"]);
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const out = JSON.parse(readFileSync(join(dir, "artifacts/seo/gsc-last-finding-verification.json"), "utf8"));
    assert.equal(out.status, "skipped");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
