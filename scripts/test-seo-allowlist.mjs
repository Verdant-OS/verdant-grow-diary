#!/usr/bin/env node
/**
 * Tests for scripts/seo/seoAllowlist.mjs — pure helper behavior.
 * Runs under `node --test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadAllowlist,
  applyAllowlist,
  isExpectedNoindex,
  isNeverAllowlisted,
  validateAllowlist,
} from "./seo/seoAllowlist.mjs";

const AL = {
  allowlisted_issues: [
    {
      id: "auth-routes-expected-non-indexable",
      description: "auth routes",
      url_patterns: ["https://verdantgrowdiary.com/auth*"],
      issue_types: ["not_indexed", "noindex_detected", "blocked_by_robots"],
      expires_on: "2099-12-31",
    },
    {
      id: "expired-entry",
      description: "expired",
      url_patterns: ["https://verdantgrowdiary.com/legacy*"],
      issue_types: ["not_indexed"],
      expires_on: "2000-01-01",
    },
  ],
  expected_noindex: [
    {
      id: "protected-routes-noindex",
      url_patterns: ["https://verdantgrowdiary.com/auth*"],
      expires_on: "2099-12-31",
    },
  ],
  never_allowlist: [
    "https://verdantgrowdiary.com/",
    "https://verdantgrowdiary.com/pricing",
  ],
  _source: "test",
};

test("loadAllowlist returns empty structure when file missing", () => {
  const empty = loadAllowlist("/nonexistent/path/seo-allowlist.json");
  assert.deepEqual(empty.allowlisted_issues, []);
  assert.deepEqual(empty.expected_noindex, []);
  assert.deepEqual(empty.never_allowlist, []);
});

test("isNeverAllowlisted matches exact URLs only", () => {
  assert.equal(isNeverAllowlisted("https://verdantgrowdiary.com/", AL), true);
  assert.equal(isNeverAllowlisted("https://verdantgrowdiary.com/pricing", AL), true);
  assert.equal(isNeverAllowlisted("https://verdantgrowdiary.com/auth", AL), false);
});

test("isExpectedNoindex matches active entries, ignores expired", () => {
  assert.equal(isExpectedNoindex("https://verdantgrowdiary.com/auth/callback", AL), true);
  assert.equal(isExpectedNoindex("https://verdantgrowdiary.com/welcome", AL), false);
});

test("isExpectedNoindex never applies to never_allowlist URLs", () => {
  const al = {
    ...AL,
    expected_noindex: [
      { id: "trap", url_patterns: ["https://verdantgrowdiary.com/*"], expires_on: "2099-12-31" },
    ],
  };
  // Structural validation should catch this, but the runtime guard must
  // ALSO refuse to noindex a never_allowlist URL.
  assert.equal(isExpectedNoindex("https://verdantgrowdiary.com/", al), false);
});

test("applyAllowlist suppresses matching issue codes and records source id", () => {
  const issues = [
    { code: "not_indexed", message: "auth: not indexed" },
    { code: "canonical_mismatch", message: "auth: canonical mismatch" },
  ];
  const { kept, suppressed } = applyAllowlist(
    "https://verdantgrowdiary.com/auth/callback",
    issues,
    AL,
  );
  assert.equal(kept.length, 1);
  assert.equal(kept[0].code, "canonical_mismatch");
  assert.equal(suppressed.length, 1);
  assert.equal(suppressed[0].suppressed_by, "auth-routes-expected-non-indexable");
});

test("applyAllowlist never suppresses issues on never_allowlist URLs", () => {
  const al = {
    ...AL,
    allowlisted_issues: [
      {
        id: "trap-home",
        url_patterns: ["https://verdantgrowdiary.com/*"],
        issue_types: ["not_indexed"],
        expires_on: "2099-12-31",
      },
    ],
  };
  const issues = [{ code: "not_indexed", message: "home: not indexed" }];
  const { kept, suppressed } = applyAllowlist("https://verdantgrowdiary.com/", issues, al);
  assert.equal(kept.length, 1);
  assert.equal(suppressed.length, 0);
});

test("applyAllowlist ignores expired entries", () => {
  const issues = [{ code: "not_indexed", message: "legacy: not indexed" }];
  const { kept, suppressed } = applyAllowlist(
    "https://verdantgrowdiary.com/legacy/x",
    issues,
    AL,
  );
  assert.equal(kept.length, 1);
  assert.equal(suppressed.length, 0);
});

test("validateAllowlist flags patterns that capture never_allowlist URLs", () => {
  const bad = {
    allowlisted_issues: [
      {
        id: "too-broad",
        url_patterns: ["https://verdantgrowdiary.com/*"],
        issue_types: ["not_indexed"],
      },
    ],
    expected_noindex: [],
    never_allowlist: ["https://verdantgrowdiary.com/"],
  };
  const errs = validateAllowlist(bad);
  assert.ok(errs.some((e) => e.includes("never_allowlist URL")));
});

test("validateAllowlist accepts the shipped config shape", () => {
  const errs = validateAllowlist(AL);
  assert.deepEqual(errs, []);
});

test("validateAllowlist requires ids, url_patterns, and issue_types", () => {
  const errs = validateAllowlist({
    allowlisted_issues: [{ url_patterns: [], issue_types: [] }],
    expected_noindex: [{ id: "ok", url_patterns: [] }],
    never_allowlist: [],
  });
  assert.ok(errs.some((e) => /missing id/.test(e)));
  assert.ok(errs.some((e) => /url_patterns/.test(e)));
  assert.ok(errs.some((e) => /issue_types/.test(e)));
});
