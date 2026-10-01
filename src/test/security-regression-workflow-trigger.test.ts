import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type SecurityWorkflow = {
  on: Record<string, { branches?: string[]; "branches-ignore"?: string[]; types?: string[] }>;
  concurrency: { group: string; "cancel-in-progress": string };
  permissions: Record<string, string>;
  jobs: Record<
    string,
    {
      name: string;
      if?: string;
      steps: Array<{ uses?: string; run?: string; with?: Record<string, unknown> }>;
    }
  >;
};

const workflow = load(
  readFileSync(resolve(__dirname, "../../.github/workflows/security-regression.yml"), "utf8"),
) as SecurityWorkflow;

describe("effective security-regression workflow coverage", () => {
  it("runs for stacked PR bases instead of silently omitting an always-required result", () => {
    expect(workflow.on.pull_request).toBeDefined();
    expect(workflow.on.pull_request.branches).toBeUndefined();
    expect(workflow.on.pull_request["branches-ignore"]).toBeUndefined();
  });

  it.each(["opened", "synchronize", "reopened", "ready_for_review", "edited"])(
    "starts security checks on the %s event, including a base retarget",
    (event) => {
      expect(workflow.on.pull_request.types).toContain(event);
    },
  );

  it("preserves deploy-push and merge-queue coverage without a draft skip", () => {
    expect(workflow.on.push.branches).toEqual(["main", "verdant-grow-diary"]);
    expect(Object.hasOwn(workflow.on, "merge_group")).toBe(true);
    expect(workflow.jobs["test-security-regression"].name).toBe("test:security-regression");
    expect(workflow.jobs["test-security-regression"].if).toBeUndefined();
  });

  it("uses a read-only token without persisting checkout credentials on arbitrary PR bases", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    const checkout = workflow.jobs["test-security-regression"].steps.find((step) =>
      step.uses?.startsWith("actions/checkout@"),
    );
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
    expect(Object.hasOwn(workflow.on, "pull_request_target")).toBe(false);
  });

  it("keeps the complete security suite and superseded-PR cancellation", () => {
    expect(
      workflow.jobs["test-security-regression"].steps.flatMap((step) =>
        step.run ? [step.run] : [],
      ),
    ).toEqual([
      "bun install --frozen-lockfile",
      "bun run typecheck",
      "bun run check:supabase-security",
      "bun run test:security-static",
      "bun run test:bridge-sensor-ingest-evidence",
      "bun run test:security-gamification",
      "bun run test:sensor-readings-tent-ownership",
      "bun run test:payments-security",
      "bun run test:storage-security",
      "bun run test:pi-ingest-security",
    ]);
    expect(workflow.concurrency).toEqual({
      group:
        "${{ github.workflow }}-${{ github.event_name == 'pull_request' && format('pr-{0}', github.event.pull_request.number) || github.sha }}",
      "cancel-in-progress": "${{ github.event_name == 'pull_request' }}",
    });
  });
});
