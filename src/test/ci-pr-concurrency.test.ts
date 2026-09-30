import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type Workflow = {
  on: Record<string, { types?: string[] } | null>;
  concurrency?: { group: string; "cancel-in-progress": boolean | string };
  jobs: Record<
    string,
    { name?: string; if?: string; strategy?: { matrix?: { shard?: number[]; batch?: number[] } } }
  >;
};

const workflowsDir = resolve(__dirname, "../../.github/workflows");
const readWorkflow = (name: string): Workflow =>
  load(readFileSync(resolve(workflowsDir, name), "utf8")) as Workflow;

const workflows = readdirSync(workflowsDir)
  .filter((name) => /\.ya?ml$/.test(name))
  .sort()
  .map((name) => ({ name, workflow: readWorkflow(name) }));
const prWorkflows = workflows.filter(({ workflow }) => Object.hasOwn(workflow.on, "pull_request"));

const prGroup =
  "${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.sha }}";
const cancelSupersededPr = "${{ github.event_name == 'pull_request' }}";
const replacedGroups = [
  "vitest-full-suite-pr-gate.yml",
  "seo-parity-and-head-fidelity.yml",
  "core-link-form-census.yml",
  "irrigation-evidence-gate.yml",
  "google-analytics-e2e.yml",
  "typecheck-build-push.yml",
] as const;

// Non-required, non-security PR workflows that wait for ready_for_review instead of
// running on every draft push. ci.yml, security-regression.yml and the mustBeGreen
// gates in config/required-status-checks.json are deliberately absent.
const skipDraftPr =
  "${{ github.event_name != 'pull_request' || !github.event.pull_request.draft }}";
const draftSkippedWorkflows = [
  "ai-doctor-golden-cases.yml",
  "ai-doctor-readiness-ui.yml",
  "contextual-pheno-comparison-v0.yml",
  "edge-shared-sync.yml",
  "lint.yml",
  "paddle-preflight-renderer-tests.yml",
  "quicklog-gate.yml",
  "seo-parity-and-head-fidelity.yml",
  "typecheck-build-push.yml",
  "typecheck.yml",
] as const;

describe("resolved PR workflow concurrency", () => {
  it("gives every PR workflow a concurrency group", () => {
    expect(prWorkflows.length).toBeGreaterThan(0);
    expect(
      prWorkflows.filter(({ workflow }) => !workflow.concurrency?.group).map(({ name }) => name),
    ).toEqual([]);
  });

  it.each(replacedGroups)("keeps PR cancellation separate from deploy SHAs in %s", (name) => {
    expect(readWorkflow(name).concurrency).toEqual({
      group: prGroup,
      "cancel-in-progress": cancelSupersededPr,
    });
  });

  it("starts every PR workflow when a draft is marked ready for review", () => {
    expect(
      prWorkflows
        .filter(({ workflow }) => !workflow.on.pull_request?.types?.includes("ready_for_review"))
        .map(({ name }) => name),
    ).toEqual([]);
  });

  it("runs the duplicate 16-batch suite only in the merge queue and on deploy pushes", () => {
    // ci.yml's 32 required shards already run the whole suite on every PR (256 isolated
    // partitions), so the 16-batch duplicate no longer spends PR runner capacity.
    const fullSuite = readWorkflow("vitest-full-suite-pr-gate.yml");
    expect(Object.hasOwn(fullSuite.on, "pull_request")).toBe(false);
    expect(Object.hasOwn(fullSuite.on, "merge_group")).toBe(true);
    expect(Object.hasOwn(fullSuite.on, "push")).toBe(true);
    expect(fullSuite.jobs["full-suite"].strategy?.matrix?.batch).toEqual(
      Array.from({ length: 16 }, (_, index) => index),
    );
  });

  it("skips exactly the reviewed non-required PR workflows on draft PRs", () => {
    const draftSkipped = prWorkflows
      .filter(({ workflow }) => Object.values(workflow.jobs).some((job) => job.if === skipDraftPr))
      .map(({ name }) => name);
    expect(draftSkipped).toEqual([...draftSkippedWorkflows].sort());
    for (const name of draftSkippedWorkflows) {
      for (const job of Object.values(readWorkflow(name).jobs)) expect(job.if).toBe(skipDraftPr);
    }
  });

  it("preserves all required CI contexts and their draft execution", () => {
    const ci = readWorkflow("ci.yml");
    expect(ci.jobs["full-suite"].strategy?.matrix?.shard).toEqual(
      Array.from({ length: 32 }, (_, index) => index + 1),
    );
    expect(ci.jobs.test.name).toBe("Lint, typecheck, test, build");
    expect(ci.jobs["edge-shared-sync-preflight"].name).toBe(
      "Preflight — edge shared-lib mirror in sync",
    );
    expect(ci.jobs["legal-seo"].name).toBe("test:legal-seo");
    for (const job of Object.values(ci.jobs)) expect(job.if).toBeUndefined();
    expect(readWorkflow("security-regression.yml").jobs["test-security-regression"].if).toBe(
      undefined,
    );
    expect(Object.hasOwn(ci.on, "merge_group")).toBe(true);
  });

  it("reports every context pinned in the deploy ruleset", () => {
    const { required } = JSON.parse(
      readFileSync(resolve(__dirname, "../../config/required-status-checks.json"), "utf8"),
    ) as { required: string[] };
    const ci = readWorkflow("ci.yml");
    const reported = Object.values(ci.jobs).flatMap((job) =>
      job.strategy?.matrix?.shard
        ? job.strategy.matrix.shard.map((shard) =>
            job.name?.replace("${{ matrix.shard }}", String(shard)),
          )
        : [job.name],
    );
    expect(required).toHaveLength(35);
    expect(reported).toHaveLength(35);
    expect([...reported].sort()).toEqual([...required].sort());
  });
});
