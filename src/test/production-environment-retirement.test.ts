import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { load as loadYaml } from "js-yaml";
import { describe, expect, it } from "vitest";

type Step = {
  uses?: string;
  run?: string;
  env?: Record<string, string>;
  with?: Record<string, unknown>;
};
type Job = {
  environment?: string | { name: string };
  if?: string;
  needs?: string | string[];
  env?: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  on: Record<string, { inputs?: Record<string, { required?: boolean }> }>;
  permissions: Record<string, string>;
  concurrency: Record<string, unknown>;
  jobs: Record<string, Job>;
};

const DIRECTORY = resolve(__dirname, "../../.github/workflows");
const RETIRED_ENVIRONMENT = "verdant-production";
const WRITER_ENVIRONMENT = "verdant-production-solo-founder";
const MONITORS = [
  ["migration-drift-probe.yml", "probe"],
  ["money-migration-drift-alert.yml", "verify"],
  ["ai-credit-service-contract-effect.yml", "verify"],
] as const;
const WRITERS = [
  "apply-pinned-production-migrations",
  "apply-candidate-number-maintenance-migrations",
  "apply-pinned-breeding-reconciliation",
  "apply-quicklog-corrections-retractions",
] as const;

function workflow(filename: string): Workflow {
  return loadYaml(readFileSync(resolve(DIRECTORY, filename), "utf8")) as Workflow;
}

describe("retired production environment schedules", () => {
  it.each(MONITORS)("keeps %s manual and fail-closed", (filename, jobId) => {
    const parsed = workflow(filename);
    const job = parsed.jobs[jobId];
    expect(Object.keys(parsed.on)).toEqual(["workflow_dispatch"]);
    expect(job.environment).toBe(RETIRED_ENVIRONMENT);
    expect(job.if).toBe("github.ref == 'refs/heads/verdant-grow-diary'");
    const secretGuard = job.steps.find(
      (step) => step.uses === "./.github/actions/require-ci-secret",
    );
    expect(secretGuard?.with?.["secret-name"]).toBe("SUPABASE_DB_URL");
    expect(secretGuard?.with?.["secret-value"]).toBe("${{ secrets.SUPABASE_DB_URL }}");
  });

  it("leaves no scheduled workflow bound to the retired environment", () => {
    const scheduled = readdirSync(DIRECTORY)
      .filter((filename) => /\.ya?ml$/.test(filename))
      .filter((filename) => {
        const parsed = workflow(filename);
        if (!parsed.on?.schedule) return false;
        return Object.values(parsed.jobs).some((job) => {
          const environment = job.environment;
          return (
            (typeof environment === "string" ? environment : environment?.name) ===
            RETIRED_ENVIRONMENT
          );
        });
      });
    expect(scheduled).toEqual([]);
  });
});

describe("production writers use the existing protected delivery environment", () => {
  it.each(WRITERS)("repoints %s while preserving dispatch and serialization", (name) => {
    const parsed = workflow(`${name}.yml`);
    expect(Object.keys(parsed.on)).toEqual(["workflow_dispatch"]);
    expect(parsed.on.workflow_dispatch.inputs?.expected_head_sha.required).toBe(true);
    expect(parsed.on.workflow_dispatch.inputs?.confirm_project_ref.required).toBe(true);
    expect(parsed.permissions.contents).toBe("read");
    expect(parsed.concurrency).toEqual({
      group: "verdant-production-migration-writer",
      "cancel-in-progress": false,
      queue: "max",
    });
    expect(parsed.jobs.validate.environment).toBeUndefined();
    const apply = parsed.jobs.apply;
    expect(apply.environment).toBe(WRITER_ENVIRONMENT);
    expect(apply.needs).toBe("validate");
    expect(apply.env?.TARGET_ENV).toBe("production");
    const checkout = apply.steps.find((step) => step.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with).toEqual({ ref: "${{ github.sha }}", "persist-credentials": false });
    const runner = apply.steps.find((step) => step.run === `node scripts/${name}.mjs`);
    expect(runner?.env?.SUPABASE_DB_URL).toBe("${{ secrets.SUPABASE_DB_URL }}");
  });

  it.each(WRITERS)("points %s secret recovery guidance at the same environment", (name) => {
    const apply = workflow(`${name}.yml`).jobs.apply;
    const guards = apply.steps.filter(
      (step) => step.uses === "./.github/actions/require-ci-secret",
    );
    expect(guards.length).toBeGreaterThan(0);
    for (const guard of guards) {
      const guidance: string[] = JSON.parse(String(guard.with?.["fix-steps-json"]));
      expect(guidance.join("\n")).toContain(WRITER_ENVIRONMENT);
      expect(guidance.join("\n")).not.toMatch(/verdant-production(?:[.,]| environment| before)/);
    }
  });
});
