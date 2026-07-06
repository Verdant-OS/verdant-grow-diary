#!/usr/bin/env node
/**
 * Tests for diagnostics polish: per-URL classification, expired-match
 * detection on affected URLs, and no-secret job summary building.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  simulateAllowlistForUrls,
  findExpiredEntriesMatchingUrls,
} from "./seo/seoAllowlist.mjs";

const NOW = "2026-07-02T00:00:00Z";
const AL = {
  allowlisted_issues: [
    {
      id: "auth-noindex",
      url_patterns: ["https://verdantgrowdiary.com/auth*"],
      issue_types: ["not_indexed"],
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
  ],
  never_allowlist: ["https://verdantgrowdiary.com/"],
};

test("classification: never_allowlisted overrides everything", () => {
  const [s] = simulateAllowlistForUrls(["https://verdantgrowdiary.com/"], AL, NOW);
  assert.equal(s.classification, "never_allowlisted");
  assert.equal(s.matched_expired_entries.length, 0);
});

test("classification: suppressed when active allowlisted_issues match", () => {
  const [s] = simulateAllowlistForUrls(
    ["https://verdantgrowdiary.com/auth/callback"],
    AL,
    NOW,
  );
  assert.equal(s.classification, "suppressed");
  assert.ok(s.reasons.some((r) => r.includes("auth-noindex")));
});

test("classification: expired_allowlist when only expired matches", () => {
  const [s] = simulateAllowlistForUrls(
    ["https://verdantgrowdiary.com/legacy/x"],
    AL,
    NOW,
  );
  assert.equal(s.classification, "expired_allowlist");
  assert.equal(s.matched_expired_entries[0].id, "expired-legacy");
});

test("classification: no_match for unmatched URLs", () => {
  const [s] = simulateAllowlistForUrls(
    ["https://verdantgrowdiary.com/blog"],
    AL,
    NOW,
  );
  assert.equal(s.classification, "no_match");
});

test("findExpiredEntriesMatchingUrls returns only expired entries covering URL", () => {
  const covering = findExpiredEntriesMatchingUrls(
    AL,
    ["https://verdantgrowdiary.com/legacy/x"],
    NOW,
  );
  assert.equal(covering.length, 1);
  assert.equal(covering[0].id, "expired-legacy");
});

test("findExpiredEntriesMatchingUrls returns empty when URLs unaffected", () => {
  const covering = findExpiredEntriesMatchingUrls(
    AL,
    ["https://verdantgrowdiary.com/blog"],
    NOW,
  );
  assert.deepEqual(covering, []);
});
