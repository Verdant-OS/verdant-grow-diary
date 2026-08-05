/**
 * Paddle Craft preflight — the verdict must actually reach the gate.
 *
 * Motivated by a live defect. `decideVerdict` correctly returns
 * `{ level: "warn", shouldFail: false }` when the Paddle API keys are unset
 * on a pull_request — the deliberate "not configured yet, don't block"
 * path. The workflow then read that verdict with:
 *
 *     LEVEL=$(node -e '…process.env.VJ…' VJ="$RUNNER_TEMP/…/verdict.json" 2>/dev/null || echo unknown)
 *
 * `VAR=value cmd` only exports VAR when the assignment PRECEDES the command.
 * Written after `node -e '…'` it is just argv[1], so `process.env.VJ` was
 * undefined, `readFileSync(undefined)` threw, `2>/dev/null` ate the error,
 * and the `|| echo` fallbacks pinned `should_fail=true`. The rendered comment
 * said "Not blocking this PR" while the job failed the PR — every PR, until
 * someone creates the Paddle secrets.
 *
 * Two independent things are asserted here because fixing either alone leaves
 * the hole open: the verdict logic must keep its non-blocking branch, and the
 * workflow must actually read it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
// Plain .mjs CLI module — imported directly so the branch that decides
// whether this gate blocks a PR is exercised, not just described.
import { decideVerdict } from "../../scripts/render-paddle-craft-preflight-comment.mjs";

const WORKFLOW_PATH = resolve(
  process.cwd(),
  ".github",
  "workflows",
  "paddle-craft-catalog-preflight.yml",
);
const WORKFLOW = readFileSync(WORKFLOW_PATH, "utf8");
const PACKAGE_JSON = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

/** The verifier's log shape for "keys unset, nothing checked". */
const UNCONFIGURED_PARSE = {
  rows: [
    { env: "sandbox", externalId: "craft_monthly", status: "skip" },
    { env: "sandbox", externalId: "craft_annual", status: "skip" },
  ],
  summary: { pass: 0, fail: 0, skip: 2 },
  keyUnsetMentioned: true,
};

describe("paddle preflight verdict plumbing", () => {
  it("does not block a PR when the Paddle keys are simply unset", () => {
    // The branch the plumbing bug silently overrode.
    const verdict = decideVerdict({
      rc: 2,
      parsed: UNCONFIGURED_PARSE,
      eventName: "pull_request",
    });
    expect(verdict.shouldFail).toBe(false);
    expect(verdict.level).toBe("warn");
  });

  it("still blocks when rc=2 comes with real failures, or off a PR", () => {
    // Non-triviality: proves the assertion above is a real branch and not a
    // blanket "rc=2 never fails".
    const withFailures = decideVerdict({
      rc: 2,
      parsed: { ...UNCONFIGURED_PARSE, summary: { pass: 0, fail: 1, skip: 1 } },
      eventName: "pull_request",
    });
    expect(withFailures.shouldFail).toBe(true);

    // A nightly run has no PR comment to carry the warning.
    const nightly = decideVerdict({
      rc: 2,
      parsed: UNCONFIGURED_PARSE,
      eventName: "schedule",
    });
    expect(nightly.shouldFail).toBe(true);
  });

  it("reads the verdict with the env assignment BEFORE the command", () => {
    // The actual bug. `node -e '…' VJ=…` parses as a positional argument.
    expect(
      /VJ="[^"]*verdict\.json"\s+node\s+-e/.test(WORKFLOW),
      "the workflow must set VJ *before* `node -e` — written after, it is a " +
        "positional argument and process.env.VJ is undefined",
    ).toBe(true);

    expect(
      /node\s+-e\s+'[\s\S]*?'\s*\\?\s*\n?\s*VJ=/.test(WORKFLOW),
      "found `node -e '…' VJ=…` — the assignment must precede the command",
    ).toBe(false);
  });

  it("does not silently swallow a failed verdict read", () => {
    // Failing closed is right; failing closed *quietly* is what hid this for
    // as long as it hid. The symptom was indistinguishable from a genuine
    // catalog failure, which is why nobody chased it.
    expect(
      /2>\/dev\/null\s*\|\|\s*echo\s+(unknown|true)/.test(WORKFLOW),
      "a verdict read that fails must annotate the run, not fall through to " +
        "a silent `|| echo` default",
    ).toBe(false);
    expect(WORKFLOW).toMatch(/::error::.*verdict/i);
  });

  it("runs the renderer's own tests in CI", () => {
    // The suite existed and passed locally, but no workflow invoked it, so
    // the verdict logic above was shipping unguarded.
    const script = PACKAGE_JSON.scripts?.["test:paddle-craft-preflight-renderer"];
    expect(script, "package.json must define the renderer test script").toBeTruthy();
    expect(script).toContain("render-paddle-craft-preflight-comment.test.mjs");
    expect(
      WORKFLOW.includes("bun run test:paddle-craft-preflight-renderer"),
      "the preflight workflow must run the renderer tests — otherwise the " +
        "logic deciding whether this gate blocks a PR has no CI coverage",
    ).toBe(true);
  });

  it("keeps the renderer script on the workflow's paths trigger", () => {
    // If the renderer can change without re-running this workflow, its tests
    // stop gating it again by a different route.
    expect(WORKFLOW).toContain("scripts/render-paddle-craft-preflight-comment.mjs");
  });
});
