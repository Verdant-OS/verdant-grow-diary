// Tests for v1.4 regression-only outcome grouping.
// Pure grouping (groupRegressionOutcomes) + subprocess assertions on the
// verifier's outcome_groups. Deterministic (--now); no network, no secrets.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { groupRegressionOutcomes, REGRESSION_OUTCOME_GROUPS } from "./seo/seoDiff.mjs";

const VERIFY = resolve("scripts/seo/verify-last-gsc-finding.mjs");

// ---- pure groupRegressionOutcomes -----------------------------------------

test("groups a previously-resolved + expired-covered URL as unresolved_expired_allowlist", () => {
  const g = groupRegressionOutcomes(
    [
      {
        url: "https://verdantgrowdiary.com/legacy/x",
        was_resolved: true,
        in_previous_baseline: true,
        regressed: true,
        expired_allowlist_ids: ["legacy-expired"],
        expected_noindex_ids: [],
      },
    ],
    { previousAvailable: true },
  );
  assert.equal(g.unresolved_expired_allowlist.count, 1);
  assert.deepEqual(g.unresolved_expired_allowlist.example_urls, [
    "https://verdantgrowdiary.com/legacy/x",
  ]);
  assert.deepEqual(g.unresolved_expired_allowlist.expired_allowlist_ids, ["legacy-expired"]);
  assert.match(g.unresolved_expired_allowlist.exit_code_behavior, /exit 4/);
});

test("an unrelated expired entry does not misgroup a still-resolved URL", () => {
  // URL resolved, NOT covered by an expired entry (regressed=false) → resolved.
  const g = groupRegressionOutcomes(
    [
      {
        url: "https://verdantgrowdiary.com/a",
        was_resolved: true,
        in_previous_baseline: true,
        regressed: false,
        expired_allowlist_ids: [],
        expected_noindex_ids: [],
      },
    ],
    { previousAvailable: true },
  );
  assert.equal(g.resolved.count, 1);
  assert.equal(g.unresolved_expired_allowlist.count, 0);
});

test("no previous baseline groups everything as no_baseline", () => {
  const g = groupRegressionOutcomes(
    [
      {
        url: "https://verdantgrowdiary.com/a",
        was_resolved: false,
        in_previous_baseline: false,
        regressed: false,
        expired_allowlist_ids: [],
        expected_noindex_ids: [],
      },
    ],
    { previousAvailable: false },
  );
  assert.equal(g.no_baseline.count, 1);
  assert.equal(g.resolved.count, 0);
  assert.equal(g.still_unresolved.count, 0);
});

test("URL recorded-but-unresolved in baseline groups as still_unresolved; absent groups as no_baseline", () => {
  const g = groupRegressionOutcomes(
    [
      {
        url: "https://x/recorded",
        was_resolved: false,
        in_previous_baseline: true,
        regressed: false,
        expired_allowlist_ids: [],
        expected_noindex_ids: [],
      },
      {
        url: "https://x/absent",
        was_resolved: false,
        in_previous_baseline: false,
        regressed: false,
        expired_allowlist_ids: [],
        expected_noindex_ids: [],
      },
    ],
    { previousAvailable: true },
  );
  assert.equal(g.still_unresolved.count, 1);
  assert.deepEqual(g.still_unresolved.example_urls, ["https://x/recorded"]);
  assert.equal(g.no_baseline.count, 1);
  assert.deepEqual(g.no_baseline.example_urls, ["https://x/absent"]);
});

test("runBlocked routes every URL to the blocked bucket", () => {
  const g = groupRegressionOutcomes([{ url: "https://x/a" }, { url: "https://x/b" }], {
    previousAvailable: true,
    runBlocked: true,
  });
  assert.equal(g.blocked.count, 2);
});

test("example URLs are capped at 3 and all six buckets are always present", () => {
  const many = Array.from({ length: 5 }, (_, i) => ({
    url: `https://x/${i}`,
    was_resolved: true,
    in_previous_baseline: true,
    regressed: true,
    expired_allowlist_ids: ["e"],
    expected_noindex_ids: [],
  }));
  const g = groupRegressionOutcomes(many, { previousAvailable: true });
  assert.equal(g.unresolved_expired_allowlist.count, 5);
  assert.equal(g.unresolved_expired_allowlist.example_urls.length, 3);
  for (const name of REGRESSION_OUTCOME_GROUPS) assert.ok(g[name], `missing bucket ${name}`);
});

// ---- subprocess: verifier writes outcome_groups ---------------------------

function scaffold({ config, allowlist, previous }) {
  const dir = mkdtempSync(join(tmpdir(), "verdant-regr-"));
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

const CONFIG = {
  finding_id: "f1",
  description: "real finding to verify",
  affected_urls: ["https://verdantgrowdiary.com/legacy/x"],
};
const ALLOWLIST_EXPIRED = {
  allowlisted_issues: [
    {
      id: "legacy-expired",
      url_patterns: ["https://verdantgrowdiary.com/legacy*"],
      issue_types: ["not_indexed"],
      expires_on: "2000-01-01",
    },
  ],
  expected_noindex: [],
  never_allowlist: [],
};
const PREV_RESOLVED = {
  status: "resolved",
  results: [{ url: "https://verdantgrowdiary.com/legacy/x", resolved: true }],
};

test("verifier emits outcome_groups.unresolved_expired_allowlist and exits 4 on regression", () => {
  const dir = scaffold({ config: CONFIG, allowlist: ALLOWLIST_EXPIRED, previous: PREV_RESOLVED });
  try {
    const r = spawnSync(
      "node",
      [VERIFY, "--fail-only-previously-resolved-expired", "--now", "2026-07-02T00:00:00Z"],
      {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, HOME: dir },
      },
    );
    assert.equal(r.status, 4, r.stderr || r.stdout);
    const out = JSON.parse(
      readFileSync(join(dir, "artifacts/seo/gsc-last-finding-verification.json"), "utf8"),
    );
    // Backward-compatible legacy fields unchanged.
    assert.equal(out.status, "regression");
    assert.equal(out.regression_count, 1);
    // New additive grouping.
    assert.ok(out.outcome_groups, "outcome_groups missing");
    assert.equal(out.outcome_groups.unresolved_expired_allowlist.count, 1);
    assert.deepEqual(out.outcome_groups.unresolved_expired_allowlist.expired_allowlist_ids, [
      "legacy-expired",
    ]);
    const md = readFileSync(join(dir, "artifacts/seo/gsc-last-finding-verification.md"), "utf8");
    assert.match(md, /Regression outcome groups/);
    assert.match(md, /unresolved_expired_allowlist/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("verifier with no previous baseline groups as no_baseline and exits 0", () => {
  const dir = scaffold({ config: CONFIG, allowlist: ALLOWLIST_EXPIRED, previous: null });
  try {
    const r = spawnSync(
      "node",
      [VERIFY, "--fail-only-previously-resolved-expired", "--now", "2026-07-02T00:00:00Z"],
      {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, HOME: dir },
      },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const out = JSON.parse(
      readFileSync(join(dir, "artifacts/seo/gsc-last-finding-verification.json"), "utf8"),
    );
    assert.equal(out.status, "no_regression");
    assert.equal(out.previous_available, false);
    assert.equal(out.outcome_groups.no_baseline.count, 1);
    assert.equal(out.outcome_groups.unresolved_expired_allowlist.count, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
