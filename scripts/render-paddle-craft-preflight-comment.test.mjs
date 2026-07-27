// Fixture-driven tests for the Paddle Craft preflight comment renderer.
// Run with: node --test scripts/render-paddle-craft-preflight-comment.test.mjs
//
// The point of this suite is to lock in every honesty rule the workflow
// needs:
//   - rc is authoritative
//   - unconfigured warning is narrow (rc=2 + key-unset + fail=0 + PR event)
//   - no `pri_` id or Paddle response body leaks into the rendered comment
//   - failures are classified into distinct remedies

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  COMMENT_MARKER,
  classifyFailure,
  decideVerdict,
  parseVerifierLog,
  parseVerifierReport,
  renderComment,
} from "./render-paddle-craft-preflight-comment.mjs";

const ALL_PASS = `# Paddle Craft catalog preflight
# Environments: sandbox, live
✓ [sandbox] craft_monthly — active price pri_01hxsandboxmonthly
✓ [sandbox] craft_annual — active price pri_01hxsandboxannual
✓ [live] craft_monthly — active price pri_01hxlivemonthly
✓ [live] craft_annual — active price pri_01hxliveannual

SUMMARY: pass=4 fail=0 skip=0
`;

const MISSING_PRICE = `✓ [sandbox] craft_monthly — active price pri_01hxsandboxmonthly
✗ [sandbox] craft_annual — no price entity found (checked active + archived)
✓ [live] craft_monthly — active price pri_01hxlivemonthly
✓ [live] craft_annual — active price pri_01hxliveannual

SUMMARY: pass=3 fail=1 skip=0
`;

const ARCHIVED_ONLY = `✗ [live] craft_annual — found 1 entry/entries but none are active (status: archived)
✓ [live] craft_monthly — active price pri_01hxlivemonthly

SUMMARY: pass=1 fail=1 skip=0
`;

const API_403 = `✗ [live] craft_monthly — Paddle API 403: {"error":{"detail":"Bad token abcdef1234","request_id":"req_secret"}}
✗ [live] craft_annual — Paddle API 403: {"error":{"detail":"Bad token"}}

SUMMARY: pass=0 fail=2 skip=0
`;

const KEY_UNSET_ONLY = `::error::PADDLE_SANDBOX_API_KEY is not set — cannot verify sandbox.
• [sandbox] craft_monthly — PADDLE_SANDBOX_API_KEY not set
• [sandbox] craft_annual — PADDLE_SANDBOX_API_KEY not set

SUMMARY: pass=0 fail=0 skip=2
`;

const SANDBOX_FAIL_PLUS_LIVE_UNSET = `✗ [sandbox] craft_annual — no price entity found (checked active + archived)
✓ [sandbox] craft_monthly — active price pri_01hxsandboxmonthly
::error::PADDLE_LIVE_API_KEY is not set — cannot verify live.

SUMMARY: pass=1 fail=1 skip=2
`;

test("classifyFailure separates causes", () => {
  assert.equal(classifyFailure("Paddle API 403: forbidden").kind, "api_error");
  assert.equal(classifyFailure("Paddle API 500: oops").httpStatus, 500);
  assert.equal(
    classifyFailure("found 1 entry/entries but none are active (status: archived)").kind,
    "inactive",
  );
  assert.equal(classifyFailure("no price entity found (checked active + archived)").kind, "missing");
});

test("all-pass log → verified verdict, no reason-code leak", () => {
  const parsed = parseVerifierLog(ALL_PASS);
  const verdict = decideVerdict({ rc: 0, parsed, eventName: "pull_request" });
  assert.equal(verdict.level, "pass");
  assert.equal(verdict.shouldFail, false);
  const md = renderComment({ verdict, parsed });
  assert.match(md, /Verified/);
  assert.doesNotMatch(md, /pri_/, "internal pri_ ids must never appear in the comment");
});

test("missing price → catalog fail with 'Missing from catalog' remedy", () => {
  const parsed = parseVerifierLog(MISSING_PRICE);
  const verdict = decideVerdict({ rc: 1, parsed, eventName: "pull_request" });
  assert.equal(verdict.level, "fail");
  assert.equal(verdict.shouldFail, true);
  const md = renderComment({ verdict, parsed });
  assert.match(md, /Missing from catalog/);
  assert.doesNotMatch(md, /Paddle API error/);
  assert.doesNotMatch(md, /pri_/);
});

test("archived-only → 'not active' remedy, distinct from missing", () => {
  const parsed = parseVerifierLog(ARCHIVED_ONLY);
  const md = renderComment({
    verdict: decideVerdict({ rc: 1, parsed, eventName: "pull_request" }),
    parsed,
  });
  assert.match(md, /not active/);
  assert.doesNotMatch(md, /Missing from catalog/);
});

test("Paddle API 403 → api_error remedy, response body never leaks", () => {
  const parsed = parseVerifierLog(API_403);
  const md = renderComment({
    verdict: decideVerdict({ rc: 1, parsed, eventName: "pull_request" }),
    parsed,
  });
  assert.match(md, /HTTP 403/);
  assert.match(md, /check credentials \/ Paddle status/);
  assert.doesNotMatch(md, /Bad token/, "API response body must not leak into the comment");
  assert.doesNotMatch(md, /req_secret/);
  assert.doesNotMatch(md, /request_id/);
});

test("key-unset-only + PR event → warn, non-blocking", () => {
  const parsed = parseVerifierLog(KEY_UNSET_ONLY);
  const verdict = decideVerdict({ rc: 2, parsed, eventName: "pull_request" });
  assert.equal(verdict.level, "warn");
  assert.equal(verdict.kind, "unconfigured");
  assert.equal(verdict.shouldFail, false);
  const md = renderComment({ verdict, parsed });
  assert.match(md, /API keys unset/);
  assert.match(md, /not verified — API key unset/);
});

test("key-unset on scheduled run → FAIL (no PR comment to carry the warning)", () => {
  const parsed = parseVerifierLog(KEY_UNSET_ONLY);
  const verdict = decideVerdict({ rc: 2, parsed, eventName: "schedule" });
  assert.equal(verdict.level, "fail");
  assert.equal(verdict.shouldFail, true);
});

test("sandbox real ✗ + live key unset → FAIL even on PR (fail>0 blocks warn branch)", () => {
  const parsed = parseVerifierLog(SANDBOX_FAIL_PLUS_LIVE_UNSET);
  assert.equal(parsed.summary?.fail, 1);
  const verdict = decideVerdict({ rc: 2, parsed, eventName: "pull_request" });
  assert.equal(verdict.level, "fail");
  assert.equal(verdict.shouldFail, true);
  const md = renderComment({ verdict, parsed });
  // The real failure must be reported, not folded into the unconfigured warning.
  assert.match(md, /Catalog check failed/);
});

test("rc=0 but no recognised rows → fail (never infer verified from empty output)", () => {
  const parsed = parseVerifierLog("some banner\nno lines matched\n");
  const verdict = decideVerdict({ rc: 0, parsed, eventName: "pull_request" });
  assert.equal(verdict.level, "fail");
  assert.equal(verdict.kind, "no_output");
});

test("comment always includes the sticky marker", () => {
  const parsed = parseVerifierLog(ALL_PASS);
  const md = renderComment({
    verdict: decideVerdict({ rc: 0, parsed, eventName: "pull_request" }),
    parsed,
  });
  assert.ok(md.startsWith(COMMENT_MARKER));
});

// ---------------------------------------------------------------------
// JSON report path (preferred input) — locks in that the renderer reads
// pre-classified rows from the verifier's machine-readable report and
// never has to re-parse log text.
// ---------------------------------------------------------------------

const REPORT_ALL_PASS = {
  schemaVersion: 1,
  envs: ["sandbox", "live"],
  requiredIds: ["craft_monthly", "craft_annual"],
  rows: [
    { env: "sandbox", externalId: "craft_monthly", status: "pass" },
    { env: "sandbox", externalId: "craft_annual", status: "pass" },
    { env: "live", externalId: "craft_monthly", status: "pass" },
    { env: "live", externalId: "craft_annual", status: "pass" },
  ],
  summary: { pass: 4, fail: 0, skip: 0 },
  exitCode: 0,
  keyUnset: false,
};

const REPORT_COVERAGE_GAP = {
  schemaVersion: 1,
  envs: ["live"],
  requiredIds: ["craft_monthly", "craft_annual"],
  rows: [
    { env: "live", externalId: "craft_monthly", status: "pass" },
    { env: "live", externalId: "craft_annual", status: "pass" },
    {
      env: "live",
      externalId: "craft_quarterly",
      status: "fail",
      cause: { kind: "coverage_gap" },
    },
  ],
  summary: { pass: 2, fail: 1, skip: 0 },
  exitCode: 1,
  keyUnset: false,
};

const REPORT_KEY_UNSET = {
  schemaVersion: 1,
  envs: ["sandbox", "live"],
  requiredIds: ["craft_monthly", "craft_annual"],
  rows: [
    { env: "sandbox", externalId: "craft_monthly", status: "skip" },
    { env: "sandbox", externalId: "craft_annual", status: "skip" },
  ],
  summary: { pass: 0, fail: 0, skip: 2 },
  exitCode: 2,
  keyUnset: true,
};

test("parseVerifierReport → verified verdict, no glyph parsing required", () => {
  const parsed = parseVerifierReport(REPORT_ALL_PASS);
  assert.equal(parsed.rows.length, 4);
  assert.deepEqual(parsed.summary, { pass: 4, fail: 0, skip: 0 });
  assert.equal(parsed.keyUnsetMentioned, false);
  const verdict = decideVerdict({ rc: 0, parsed, eventName: "pull_request" });
  assert.equal(verdict.level, "pass");
});

test("parseVerifierReport preserves coverage_gap classification", () => {
  const parsed = parseVerifierReport(REPORT_COVERAGE_GAP);
  const gapRow = parsed.rows.find((r) => r.externalId === "craft_quarterly");
  assert.ok(gapRow, "coverage_gap row must round-trip through the report parser");
  assert.equal(gapRow.status, "fail");
  assert.equal(gapRow.cause?.kind, "coverage_gap");
});

test("parseVerifierReport preserves api_error httpStatus for renderer remedy", () => {
  const parsed = parseVerifierReport({
    schemaVersion: 1,
    envs: ["live"],
    requiredIds: ["craft_monthly"],
    rows: [
      {
        env: "live",
        externalId: "craft_monthly",
        status: "fail",
        cause: { kind: "api_error", httpStatus: 429 },
      },
    ],
    summary: { pass: 0, fail: 1, skip: 0 },
    exitCode: 1,
    keyUnset: false,
  });
  assert.equal(parsed.rows[0].cause.kind, "api_error");
  assert.equal(parsed.rows[0].cause.httpStatus, 429);
  const md = renderComment({
    verdict: decideVerdict({ rc: 1, parsed, eventName: "pull_request" }),
    parsed,
  });
  assert.match(md, /HTTP 429/);
});

test("parseVerifierReport surfaces keyUnset → warn branch on PR event", () => {
  const parsed = parseVerifierReport(REPORT_KEY_UNSET);
  assert.equal(parsed.keyUnsetMentioned, true);
  const verdict = decideVerdict({ rc: 2, parsed, eventName: "pull_request" });
  assert.equal(verdict.level, "warn");
});

test("parseVerifierReport rejects malformed rows without contaminating output", () => {
  const parsed = parseVerifierReport({
    schemaVersion: 1,
    envs: ["sandbox"],
    requiredIds: ["craft_monthly"],
    rows: [
      { env: "mars", externalId: "craft_monthly", status: "pass" }, // bad env
      { env: "sandbox", externalId: 123, status: "pass" }, // bad id type
      { env: "sandbox", externalId: "craft_monthly", status: "explode" }, // bad status
      { env: "sandbox", externalId: "craft_monthly", status: "pass" }, // good
      {
        env: "sandbox",
        externalId: "craft_annual",
        status: "fail",
        cause: { kind: "cosmic_ray" }, // unknown cause kind
      },
    ],
    summary: { pass: 1, fail: 1, skip: 0 },
    exitCode: 1,
    keyUnset: false,
  });
  assert.equal(parsed.rows.length, 2, "only well-formed rows survive");
  const failRow = parsed.rows.find((r) => r.status === "fail");
  assert.equal(
    failRow?.cause?.kind,
    "missing",
    "unknown cause kinds collapse to the safe default remedy",
  );
});

test("parseVerifierReport returns empty parsed for non-object input", () => {
  assert.deepEqual(parseVerifierReport(null).rows, []);
  assert.deepEqual(parseVerifierReport("not json").rows, []);
  assert.equal(parseVerifierReport({}).summary, null);
});


test("coverage_gap remedy tells operators to widen the allowlist, not create a price", () => {
  // The price EXISTS and is active; the app just doesn't know it is sellable.
  // Falling through to "Missing from catalog — create the price" sends an
  // operator to create a duplicate of the price they are looking at.
  const comment = renderComment({
    verdict: { level: "fail", kind: "catalog_or_crash", shouldFail: true },
    parsed: {
      rows: [
        {
          env: "live",
          externalId: "credit_pack_500",
          status: "fail",
          detail: "active in catalog but not in REQUIRED_PLAN_IDS",
          cause: { kind: "coverage_gap" },
        },
      ],
      summary: { pass: 0, fail: 1, skip: 0 },
      keyUnsetMentioned: false,
    },
    runUrl: "https://example.test/run",
    artifactHint: "log",
  });
  assert.match(comment, /add this external_id to/i);
  assert.doesNotMatch(comment, /create the price via/i);
});

// --- log-fallback parity with the JSON path -------------------------------
// The renderer has TWO input paths. Fixing a cause only on the --report path
// leaves --log handing out the old, wrong remedy.

test("log fallback classifies a coverage gap, not a missing price", () => {
  const parsed = parseVerifierLog([
    "# Paddle Craft catalog preflight",
    "✗ [live] credit_pack_500 — active in catalog but not in REQUIRED_PLAN_IDS — add to src/lib/paidPlanAllowlist.ts",
    "",
    "SUMMARY: pass=0 fail=1 skip=0",
  ].join("\n"));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].cause.kind, "coverage_gap");

  const comment = renderComment({
    verdict: { level: "fail", kind: "catalog_or_crash", shouldFail: true },
    parsed,
    runUrl: "https://example.test/run",
    artifactHint: "log",
  });
  assert.match(comment, /add this external_id to/i);
  assert.doesNotMatch(comment, /create the price via/i);
});

test("log fallback keeps the coverage row instead of dropping it", () => {
  // The synthetic id contains spaces. Under the old `\S+` id group this line
  // matched nothing and the failure rendered as no row at all.
  const parsed = parseVerifierLog([
    "✗ [live] craft_* / credit_pack_* (coverage) — catalog enumeration failed: Paddle API 500",
    "",
    "SUMMARY: pass=0 fail=1 skip=0",
  ].join("\n"));
  assert.equal(parsed.rows.length, 1, "row must not vanish");
  assert.equal(parsed.rows[0].externalId, "craft_* / credit_pack_* (coverage)");
  assert.equal(parsed.rows[0].cause.kind, "enumeration_error");

  const comment = renderComment({
    verdict: { level: "fail", kind: "catalog_or_crash", shouldFail: true },
    parsed,
    runUrl: "https://example.test/run",
    artifactHint: "log",
  });
  assert.match(comment, /could not enumerate the catalog/i);
});

test("log fallback still reads an ordinary id and a genuinely missing price", () => {
  // Non-triviality: the widened id group must not have broken normal rows or
  // collapsed every cause into the new branches.
  const parsed = parseVerifierLog([
    "✗ [live] craft_annual — no price entity found (checked active + archived)",
    "",
    "SUMMARY: pass=0 fail=1 skip=0",
  ].join("\n"));
  assert.equal(parsed.rows[0].externalId, "craft_annual");
  assert.equal(parsed.rows[0].cause.kind, "missing");
});
