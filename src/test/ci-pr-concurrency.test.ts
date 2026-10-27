import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type Workflow = {
  on: Record<string, { types?: string[] } | null>;
  concurrency?: { group: string; "cancel-in-progress": boolean | string };
  jobs: Record<
    string,
    {
      name?: string;
      if?: string;
      strategy?: {
        "max-parallel"?: number;
        matrix?: { shard?: number[]; batch?: number[] };
      };
    }
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
] as const;

const docsOnlySkip = ["**/*.md", "docs/**"];

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

const requiredWorkflows = ["ci.yml", "security-regression.yml"] as const;
type RequiredWorkflow = (typeof requiredWorkflows)[number];
type RequiredTrigger = "push" | "pull_request" | "merge_group";
const prActivityTypes = ["opened", "synchronize", "reopened"];

function assertRequiredTriggerPolicy(
  name: RequiredWorkflow,
  trigger: RequiredTrigger,
  config: unknown,
) {
  const options = config ?? {};
  expect(typeof options === "object" && !Array.isArray(options), `${name} ${trigger}`).toBe(true);
  expect(options, `${name} ${trigger}`).not.toHaveProperty("paths");
  expect(options, `${name} ${trigger}`).not.toHaveProperty("paths-ignore");
  expect(options, `${name} ${trigger}`).not.toHaveProperty("branches-ignore");

  // Pin the reviewed branch policy rather than partially interpreting ordered
  // glob/negation rules. Security PRs must stay unfiltered for stacked bases.
  const branchFiltered = trigger === "push" || (name === "ci.yml" && trigger === "pull_request");
  const resolved = options as Record<string, unknown>;
  expect(resolved.branches, `${name} ${trigger} branches`).toEqual(
    branchFiltered ? ["main", "verdant-grow-diary"] : undefined,
  );

  // Omitting types uses GitHub's defaults: the three PR activities below, or
  // checks_requested for merge groups. Explicit filters must retain them.
  if (trigger === "push") {
    expect(options, `${name} push`).not.toHaveProperty("types");
  } else if (resolved.types !== undefined) {
    expect(resolved.types, `${name} ${trigger} types`).toEqual(
      expect.arrayContaining(trigger === "pull_request" ? prActivityTypes : ["checks_requested"]),
    );
  }
}

const triggerFilterMutations: {
  label: string;
  trigger: RequiredTrigger;
  patch: Record<string, unknown>;
}[] = [
  ...(["push", "pull_request", "merge_group"] as const).flatMap((trigger) => [
    { label: `${trigger} main-only branches`, trigger, patch: { branches: ["main"] } },
    {
      label: `${trigger} negated deploy branch`,
      trigger,
      patch: { branches: ["main", "verdant-grow-diary", "!verdant-grow-diary"] },
    },
    {
      label: `${trigger} ignored deploy branch`,
      trigger,
      patch: { "branches-ignore": ["verdant-grow-diary"] },
    },
  ]),
  ...prActivityTypes.map((missing) => ({
    label: `pull_request without ${missing}`,
    trigger: "pull_request" as const,
    patch: {
      types: [...prActivityTypes.filter((activity) => activity !== missing), "ready_for_review"],
    },
  })),
  { label: "merge_group empty types", trigger: "merge_group", patch: { types: [] } },
  {
    label: "merge_group without checks_requested",
    trigger: "merge_group",
    patch: { types: ["ready_for_review"] },
  },
  { label: "merge_group invalid null types", trigger: "merge_group", patch: { types: null } },
  { label: "push unsupported types", trigger: "push", patch: { types: ["opened"] } },
];

describe.each(requiredWorkflows)("%s required-trigger regression fences", (name) => {
  it.each(triggerFilterMutations)("rejects $label", ({ trigger, patch }) => {
    const resolvedConfig = readWorkflow(name).on[trigger] ?? {};
    const candidate: Record<string, unknown> = { ...resolvedConfig, ...patch };
    // GitHub permits either branches or branches-ignore, never both.
    if (Object.hasOwn(patch, "branches-ignore")) delete candidate.branches;
    expect(() => assertRequiredTriggerPolicy(name, trigger, candidate)).toThrow();
  });

  it.each([null, { types: ["checks_requested"] }])("accepts merge_group default %j", (config) => {
    expect(() => assertRequiredTriggerPolicy(name, "merge_group", config)).not.toThrow();
  });

  it("accepts the default pull_request activity types", () => {
    const config = { ...readWorkflow(name).on.pull_request };
    delete config.types;
    expect(() => assertRequiredTriggerPolicy(name, "pull_request", config)).not.toThrow();
  });
});

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

  it("cancels superseded pull_request runs and no other event", () => {
    const allowed = new Set([
      cancelSupersededPr,
      "${{ github.event_name == 'pull_request' || (github.event_name == 'push' && github.ref != 'refs/heads/verdant-grow-diary' && github.ref != 'refs/heads/main') }}",
    ]);
    const offenders = prWorkflows
      .filter(({ workflow }) => !allowed.has(String(workflow.concurrency?.["cancel-in-progress"])))
      .map(
        ({ name, workflow }) => `${name}:${String(workflow.concurrency?.["cancel-in-progress"])}`,
      );
    expect(offenders).toEqual([]);
  });

  it("cancels superseded feature-branch pushes of the non-required tsgo build", () => {
    expect(readWorkflow("typecheck-build-push.yml").concurrency).toEqual({
      group: "${{ github.workflow }}-${{ github.ref }}",
      "cancel-in-progress":
        "${{ github.event_name == 'pull_request' || (github.event_name == 'push' && github.ref != 'refs/heads/verdant-grow-diary' && github.ref != 'refs/heads/main') }}",
    });
  });

  it("skips docs-only diffs on duplicate non-required workflows", () => {
    for (const name of [
      "lint.yml",
      "typecheck.yml",
      "typecheck-build-push.yml",
      "dependency-security-ci.yml",
      "vitest-full-suite-pr-gate.yml",
    ]) {
      const text = readFileSync(resolve(workflowsDir, name), "utf8");
      const workflow = load(text) as {
        on: Record<string, { "paths-ignore"?: string[] } | null>;
      };
      for (const trigger of ["pull_request", "push"] as const) {
        if (!Object.hasOwn(workflow.on, trigger)) continue;
        expect(workflow.on[trigger]?.["paths-ignore"], `${name} ${trigger}`).toEqual(docsOnlySkip);
      }
      if (Object.hasOwn(workflow.on, "merge_group")) {
        const config = workflow.on.merge_group ?? {};
        expect(config, name).not.toHaveProperty("paths");
        expect(config, name).not.toHaveProperty("paths-ignore");
      }
    }
  });

  it.each(requiredWorkflows)(
    "keeps the required triggers in %s live and free of path filters",
    (name) => {
      const workflow = readWorkflow(name);
      for (const trigger of ["pull_request", "push", "merge_group"] as const) {
        expect(workflow.on, name).toHaveProperty(trigger);
        assertRequiredTriggerPolicy(name, trigger, workflow.on[trigger]);
      }
    },
  );

  it("preserves all required CI contexts and their draft execution", () => {
    const ci = readWorkflow("ci.yml");
    expect(ci.jobs["full-suite"].strategy?.matrix?.shard).toEqual(
      Array.from({ length: 32 }, (_, index) => index + 1),
    );
    expect(ci.jobs["full-suite"].strategy?.["max-parallel"]).toBe(8);
    expect(ci.jobs.test.name).toBe("Lint, typecheck, test, build");
    expect(ci.jobs["edge-shared-sync-preflight"].name).toBe(
      "Preflight — edge shared-lib mirror in sync",
    );
    expect(ci.jobs["legal-seo"].name).toBe("test:legal-seo");
    const heavyDraftSkip =
      "github.event_name != 'pull_request' || github.event.pull_request.draft == false";
    // Heavy required jobs skip on drafts (Skipped satisfies the ruleset) and run
    // when the PR is ready and on merge_group. Cheap required jobs stay unconditional.
    expect(ci.jobs.test.if).toBe(heavyDraftSkip);
    expect(ci.jobs["full-suite"].if).toBe(heavyDraftSkip);
    expect(ci.jobs["quicklog-correction-measured-values"].if).toBe(heavyDraftSkip);
    expect(ci.jobs["edge-shared-sync-preflight"].if).toBeUndefined();
    expect(ci.jobs["legal-seo"].if).toBeUndefined();
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
      job.name === "Quick Log correction measured values"
        ? []
        : job.strategy?.matrix?.shard
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
