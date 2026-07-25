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
