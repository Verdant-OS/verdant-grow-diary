#!/usr/bin/env node
/**
 * Tests for allowlist expiration + dry-run simulation helpers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { findExpiredEntries, simulateAllowlistForUrls } from "./seo/seoAllowlist.mjs";

const AL = {
  allowlisted_issues: [
    {
      id: "auth-noindex",
      url_patterns: ["https://verdantgrowdiary.com/auth*"],
      issue_types: ["not_indexed", "noindex_detected"],
      expires_on: "2099-12-31",
    },
    {
      id: "expired-legacy",
      url_patterns: ["https://verdantgrowdiary.com/legacy*"],
      issue_types: ["not_indexed"],
      expires_on: "2000-01-01",
    },
  ],
  expected_noindex: [
    {
      id: "protected-noindex",
      url_patterns: ["https://verdantgrowdiary.com/auth*"],
      expires_on: "2099-12-31",
    },
    {
      id: "expired-noindex",
      url_patterns: ["https://verdantgrowdiary.com/beta*"],
      expires_on: "2001-06-15",
    },
  ],
  never_allowlist: ["https://verdantgrowdiary.com/", "https://verdantgrowdiary.com/pricing"],
  _source: "test",
};

const NOW = "2026-07-02T00:00:00Z";

test("findExpiredEntries returns entries whose expires_on has passed", () => {
  const expired = findExpiredEntries(AL, NOW);
  const ids = expired.map((e) => `${e.section}:${e.id}`).sort();
  assert.deepEqual(ids, [
    "allowlisted_issues:expired-legacy",
    "expected_noindex:expired-noindex",
  ]);
});

test("findExpiredEntries ignores entries without expires_on", () => {
  const al = {
    allowlisted_issues: [{ id: "no-expiry", url_patterns: ["*"], issue_types: ["x"] }],
    expected_noindex: [],
    never_allowlist: [],
  };
  assert.deepEqual(findExpiredEntries(al, NOW), []);
});

test("findExpiredEntries treats today as still-active", () => {
  const al = {
    allowlisted_issues: [
      { id: "today", url_patterns: ["*"], issue_types: ["x"], expires_on: NOW.slice(0, 10) },
    ],
    expected_noindex: [],
    never_allowlist: [],
  };
  assert.deepEqual(findExpiredEntries(al, NOW), []);
});

test("simulateAllowlistForUrls flags never_allowlisted URLs as never-suppressed", () => {
  const sim = simulateAllowlistForUrls(
    ["https://verdantgrowdiary.com/", "https://verdantgrowdiary.com/pricing"],
    AL,
    NOW,
  );
  for (const s of sim) {
    assert.equal(s.never_allowlisted, true);
    assert.equal(s.would_be_expected_noindex, false);
    assert.deepEqual(s.would_suppress_issue_types, []);
    assert.deepEqual(s.matched_allowlisted_issue_entries, []);
    assert.deepEqual(s.matched_expected_noindex_entries, []);
  }
});

test("simulateAllowlistForUrls reports which entries would match a URL", () => {
  const [sim] = simulateAllowlistForUrls(
    ["https://verdantgrowdiary.com/auth/callback"],
    AL,
    NOW,
  );
  assert.equal(sim.never_allowlisted, false);
  assert.equal(sim.would_be_expected_noindex, true);
  assert.deepEqual(sim.matched_expected_noindex_entries.map((e) => e.id), ["protected-noindex"]);
  assert.deepEqual(sim.matched_allowlisted_issue_entries.map((e) => e.id), ["auth-noindex"]);
  assert.deepEqual([...sim.would_suppress_issue_types].sort(), ["noindex_detected", "not_indexed"]);
});

test("simulateAllowlistForUrls ignores expired entries", () => {
  const [sim] = simulateAllowlistForUrls(
    ["https://verdantgrowdiary.com/legacy/x", "https://verdantgrowdiary.com/beta/y"],
    AL,
    NOW,
  );
  assert.deepEqual(sim.would_suppress_issue_types, []);
  assert.deepEqual(sim.matched_expected_noindex_entries, []);
});
