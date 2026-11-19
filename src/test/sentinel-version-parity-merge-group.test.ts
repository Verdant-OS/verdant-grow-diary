/**
 * Sentinel-Version parity must report on merge-queue entries (2026-11-12).
 *
 * The `copilot-advisory-review` ruleset (created 2026-11-06 22:25 UTC) requires the context
 * "Governance files agree on Sentinel-Version" on refs/heads/verdant-grow-diary. The merge
 * queue waits for every required context on its own test merge, and this workflow had no
 * `merge_group` trigger, so no queue entry could ever land: the deploy branch did not move
 * after 2026-11-06 22:23 UTC, and #2928 and #2938 sat green in the queue until it timed them
 * out.
 *
 * Asserts on the parsed workflow, not on its source text.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type ParityWorkflow = {
  on: Record<string, { types?: string[]; paths?: string[]; branches?: string[] } | null>;
  jobs: Record<
    string,
    {
      name: string;
      if?: string;
      steps: Array<{ name?: string; run?: string; env?: Record<string, string> }>;
    }
  >;
};

const workflow = load(
  readFileSync(resolve(__dirname, "../../.github/workflows/sentinel-version-parity.yml"), "utf8"),
) as ParityWorkflow;

const REQUIRED_CONTEXT = "Governance files agree on Sentinel-Version";

describe("sentinel-version-parity merge-queue coverage", () => {
  it("still names its job with the ruleset-required context", () => {
    expect(workflow.jobs.parity.name).toBe(REQUIRED_CONTEXT);
  });

  it("runs on merge_group checks_requested, with no path filter and no job-level skip", () => {
    expect(Object.hasOwn(workflow.on, "merge_group")).toBe(true);
    const mergeGroup = workflow.on.merge_group;
    expect(mergeGroup?.types).toEqual(["checks_requested"]);
    expect(mergeGroup?.paths).toBeUndefined();
    expect(workflow.jobs.parity.if).toBeUndefined();
  });

  it("compares a queue entry with the base the queue built on", () => {
    const check = workflow.jobs.parity.steps.find(
      (step) => step.run === "node scripts/check-sentinel-version-parity.mjs",
    );
    expect(check).toBeDefined();
    const base = check?.env?.SENTINEL_BASE_SHA ?? "";
    expect(base).toContain("github.event.pull_request.base.sha");
    expect(base).toContain("github.event.merge_group.base_sha");
    expect(base).toContain("github.event.before");
  });

  it("keeps the existing pull_request and push triggers", () => {
    expect(workflow.on.pull_request?.types).toEqual([
      "opened",
      "synchronize",
      "reopened",
      "ready_for_review",
    ]);
    expect(workflow.on.push?.branches).toEqual(["main", "verdant-grow-diary"]);
  });
});
