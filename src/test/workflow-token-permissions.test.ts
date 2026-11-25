import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

// Every GitHub Actions job must run with an explicitly scoped GITHUB_TOKEN,
// declared at the workflow top level or on the job itself. A job with no
// `permissions:` anywhere inherits the repository default, which may be
// read-write. Security review finding B2 (2026-11-19).

type Workflow = {
  permissions?: unknown;
  jobs?: Record<string, { permissions?: unknown }>;
};

const WORKFLOW_DIR = resolve(__dirname, "../../.github/workflows");

const workflowFiles = readdirSync(WORKFLOW_DIR)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .sort();

function loadWorkflow(name: string): Workflow {
  return load(readFileSync(resolve(WORKFLOW_DIR, name), "utf8")) as Workflow;
}

// Jobs that still inherit the repository default token. This list may only
// shrink: scope a job and delete its entry here in the same change.
const KNOWN_UNSCOPED_JOBS: ReadonlyArray<readonly [string, string]> = [
  ["irrigation-pgtap-rls-gate.yml", "harness-typecheck"],
  ["irrigation-pgtap-rls-gate.yml", "pgtap-irrigation"],
];

// Workflows that need no write scope and were limited to read-only contents.
const READ_ONLY_WORKFLOWS = [
  "agent-integrations-smoke.yml",
  "auth-loading-smoke.yml",
  "datadog-synthetics.yml",
  "demo-proof-walkthrough-readonly.yml",
  "e2e-fixture-garden-rotation.yml",
  "ecowitt-bridge-cli-suite.yml",
  "ecowitt-config-validate-contract.yml",
  "ecowitt-only-safety-scan.yml",
  "ecowitt-testbench-safety.yml",
  "gamification-staging-smoke.yml",
  "genetics-traceability-smoke.yml",
  "irrigation-overflow-smoke.yml",
  "jsonld-rich-results.yml",
  "lighthouse-ci.yml",
  "lint.yml",
  "mcp-local-rls-integration.yml",
  "one-tent-loop-proof-never-healthy.yml",
  "one-tent-loop-smoke-test.yml",
  "paddle-preflight-renderer-tests.yml",
  "pheno-journey-smoke.yml",
  "quicklog-gate.yml",
  "security-db-local.yml",
  "sensor-ingest-webhook-edge-tests.yml",
  "seo-parity-and-head-fidelity.yml",
  "sitemap-robots-parity.yml",
  "stabilization-pr-scope.yml",
  "supabase-migrations-sync-check.yml",
  "typecheck.yml",
  "vitest-batched-full-suite.yml",
] as const;

function unscopedJobs(): Array<[string, string]> {
  const result: Array<[string, string]> = [];
  for (const name of workflowFiles) {
    const workflow = loadWorkflow(name);
    if (workflow.permissions !== undefined) continue;
    for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
      if (job?.permissions === undefined) result.push([name, jobId]);
    }
  }
  return result;
}

describe("workflow GITHUB_TOKEN scoping", () => {
  it("finds the workflow directory", () => {
    expect(workflowFiles.length).toBeGreaterThan(0);
  });

  it("scopes the token for every job except the known exceptions", () => {
    const known = new Set(KNOWN_UNSCOPED_JOBS.map(([file, job]) => `${file}#${job}`));
    const unexpected = unscopedJobs()
      .map(([file, job]) => `${file}#${job}`)
      .filter((key) => !known.has(key));
    expect(unexpected).toEqual([]);
  });

  it("keeps the exception list free of entries that are already scoped or gone", () => {
    const current = new Set(unscopedJobs().map(([file, job]) => `${file}#${job}`));
    const stale = KNOWN_UNSCOPED_JOBS.map(([file, job]) => `${file}#${job}`).filter(
      (key) => !current.has(key),
    );
    expect(stale).toEqual([]);
  });

  it.each(READ_ONLY_WORKFLOWS)("%s grants only read access to contents", (name) => {
    const workflow = loadWorkflow(name);
    expect(workflow.permissions).toEqual({ contents: "read" });
    // A job may repeat the same read-only scope; it may never widen it.
    for (const job of Object.values(workflow.jobs ?? {})) {
      if (job?.permissions !== undefined) {
        expect(job.permissions).toEqual({ contents: "read" });
      }
    }
  });
});
