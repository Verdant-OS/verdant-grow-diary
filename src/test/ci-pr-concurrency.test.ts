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

  it("skips only the duplicate 16-batch suite on draft PRs", () => {
    const fullSuite = readWorkflow("vitest-full-suite-pr-gate.yml");
    expect(fullSuite.jobs["full-suite"].if).toBe(
      "${{ github.event_name != 'pull_request' || !github.event.pull_request.draft }}",
    );
    expect(fullSuite.jobs["full-suite"].strategy?.matrix?.batch).toEqual(
      Array.from({ length: 16 }, (_, index) => index),
    );
    expect(Object.hasOwn(fullSuite.on, "merge_group")).toBe(true);
    expect(Object.hasOwn(fullSuite.on, "push")).toBe(true);
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
