import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
};
type Workflow = {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, { if?: string; steps: Step[] }>;
};

const ROOT = resolve(__dirname, "../..");
const workflow = load(
  readFileSync(resolve(ROOT, ".github/workflows/served-build-monotonic.yml"), "utf8"),
) as Workflow;
const steps = Object.values(workflow.jobs).flatMap((job) => job.steps);
const byAction = (action: string) => steps.filter((step) => step.uses?.split("@")[0] === action);

describe("served-build-monotonic workflow", () => {
  it("runs on a schedule and by manual dispatch only", () => {
    expect(Object.keys(workflow.on).sort()).toEqual(["schedule", "workflow_dispatch"]);
    expect(workflow.on).not.toHaveProperty("push");
    expect(workflow.on).not.toHaveProperty("pull_request");
    expect(workflow.on).not.toHaveProperty("pull_request_target");
    expect(workflow.on.schedule).toEqual([{ cron: "*/30 * * * *" }]);
  });

  it("offers an explicit initialize dispatch input that defaults to false", () => {
    expect(workflow.on.workflow_dispatch).toMatchObject({
      inputs: {
        initialize: {
          type: "boolean",
          default: false,
          description:
            "Replace an unreadable checkpoint with the served SHA. A missing checkpoint already records a baseline. A readable checkpoint is still compared.",
        },
      },
    });
  });

  it("only runs the job on the deploy ref", () => {
    for (const job of Object.values(workflow.jobs)) {
      expect(job.if).toBe("github.ref == 'refs/heads/verdant-grow-diary'");
    }
  });

  it("grants read-only contents permission and never cancels a run in progress", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency["cancel-in-progress"]).toBe(false);
  });

  it("checks out the deploy branch with full history for ancestry", () => {
    const [checkout] = byAction("actions/checkout");
    expect(checkout.with).toMatchObject({ ref: "verdant-grow-diary", "fetch-depth": 0 });
  });

  it("invokes the monotonic check with the restored state file", () => {
    const runs = steps.filter((step) => step.run?.includes("check-served-build-monotonic.mjs"));
    expect(runs).toHaveLength(1);
    expect(runs[0].run).toContain("--previous-file .served-build/previous.sha");
    expect(runs[0].run).toContain("--write-file .served-build/previous.sha");
    expect(runs[0].run).toContain("--run-number ${{ github.run_number }}");
    expect(runs[0].if).toBeUndefined();
    // --initialize is passed only on a manual dispatch that asked for it.
    expect(runs[0].run).toContain(
      "${{ github.event_name == 'workflow_dispatch' && inputs.initialize && '--initialize' || '' }}",
    );
    expect(runs[0].run?.match(/--initialize/g)).toHaveLength(1);
  });

  it("restores and saves state under the run- and attempt-scoped cache key", () => {
    const [restore] = byAction("actions/cache/restore");
    const [save] = byAction("actions/cache/save");
    expect(restore.with).toEqual({
      path: ".served-build/previous.sha",
      key: "served-build-sha-${{ github.run_id }}-${{ github.run_attempt }}",
      "restore-keys": "served-build-sha-",
    });
    expect(save.with).toEqual({
      path: ".served-build/previous.sha",
      key: "served-build-sha-${{ github.run_id }}-${{ github.run_attempt }}",
    });
    // Saving only after a successful check: a FAIL must not overwrite the accepted SHA.
    expect(save.if).toBeUndefined();
    const order = [restore, steps.find((s) => s.run?.includes("check-served")), save].map((s) =>
      steps.indexOf(s as Step),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("uses no secrets", () => {
    expect(JSON.stringify(workflow)).not.toContain("secrets.");
  });
});
