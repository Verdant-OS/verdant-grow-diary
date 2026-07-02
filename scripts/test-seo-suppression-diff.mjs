#!/usr/bin/env node
/**
 * Tests for scripts/seo/seoDiff.mjs — pure diff + rendering helpers.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readPreviousSuppressions,
  diffSuppressions,
  renderSuppressionDiffMarkdown,
  renderCompactSuppressionTable,
} from "./seo/seoDiff.mjs";

const PREV = {
  generated_at: "2026-06-30T00:00:00Z",
  suppressed_by_source: {
    "auth-noindex": [
      { code: "not_indexed", message: "auth page not indexed" },
      { code: "not_indexed", message: "callback not indexed" },
    ],
    "legacy-x": [{ code: "not_indexed", message: "legacy/x" }],
  },
};
const CURR = {
  generated_at: "2026-07-02T00:00:00Z",
  suppressed_by_source: {
    "auth-noindex": [
      { code: "not_indexed", message: "auth page not indexed" }, // unchanged
      { code: "not_indexed", message: "new callback path" }, // added
    ],
    // legacy-x fully removed
  },
};

test("diffSuppressions classifies added/removed/unchanged", () => {
  const d = diffSuppressions(PREV, CURR);
  assert.equal(d.added.length, 1);
  assert.equal(d.added[0].message, "new callback path");
  assert.equal(d.removed.length, 2);
  assert.ok(d.removed.some((r) => r.source === "legacy-x"));
  assert.ok(d.removed.some((r) => r.message === "callback not indexed"));
  assert.equal(d.unchanged.length, 1);
  assert.equal(d.previous_available, true);
});

test("diffSuppressions with no previous marks previous_available=false", () => {
  const d = diffSuppressions(null, CURR);
  assert.equal(d.previous_available, false);
  assert.equal(d.removed.length, 0);
  assert.equal(d.added.length, 2);
});

test("renderSuppressionDiffMarkdown is deterministic and contains counts", () => {
  const md1 = renderSuppressionDiffMarkdown(diffSuppressions(PREV, CURR));
  const md2 = renderSuppressionDiffMarkdown(diffSuppressions(PREV, CURR));
  assert.equal(md1, md2);
  assert.match(md1, /Added suppressions:\*\* 1/);
  assert.match(md1, /Removed suppressions:\*\* 2/);
});

test("renderCompactSuppressionTable renders a stable table", () => {
  const t = renderCompactSuppressionTable(CURR.suppressed_by_source);
  assert.match(t, /Allowlist entry \| Suppressed \| Issue codes/);
  assert.match(t, /`auth-noindex` \| 2/);
});

test("renderCompactSuppressionTable handles empty input", () => {
  const t = renderCompactSuppressionTable({});
  assert.match(t, /_\(none\)_ \| 0/);
});

test("readPreviousSuppressions returns null when file missing", () => {
  assert.equal(readPreviousSuppressions("/tmp/nonexistent-verdant-seo-diff.json"), null);
  assert.equal(readPreviousSuppressions(null), null);
});

test("readPreviousSuppressions parses valid JSON, ignores malformed", () => {
  const dir = mkdtempSync(join(tmpdir(), "verdant-diff-"));
  try {
    const good = join(dir, "good.json");
    writeFileSync(good, JSON.stringify(PREV));
    assert.deepEqual(readPreviousSuppressions(good).generated_at, PREV.generated_at);
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not-json");
    assert.equal(readPreviousSuppressions(bad), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
