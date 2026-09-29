import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type Workflow = {
  on: Record<string, { types?: string[] } | null>;
  concurrency?: { group: string; "cancel-in-progress": boolean | string };
  jobs: Record<
    string,
    { name?: string; if?: string; strategy?: { matrix?: { shard?: number[] } } }
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
});
