/**
 * Contract for .github/workflows/money-contract-effect-introspection.yml.
 *
 * Unlike migration-drift-probe.yml and money-migration-drift-alert.yml, this
 * workflow is deliberately NOT a scheduled alert. It is a manual, read-only
 * introspection: it observes whether the money contract's live effect
 * matches what the migration asserts, and reports what it found without
 * deciding pass/fail. The load-bearing properties here are the ones that
 * keep it from silently becoming the third scheduled monitor by accident —
 * no schedule trigger, no issue-writing permission, no verdict-asserting
 * language in its own output.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";

const ROOT = resolve(__dirname, "../..");
const WORKFLOW_PATH = ".github/workflows/money-contract-effect-introspection.yml";
const WORKFLOW = readFileSync(resolve(ROOT, WORKFLOW_PATH), "utf8");

const doc = yaml.load(WORKFLOW) as any;
const job = doc.jobs.introspect;

describe("money contract effect introspection — dispatch-only, on purpose", () => {
  it("has no schedule trigger", () => {
    // This is the property that most distinguishes it from the other two
    // production workflows. A regression here would turn a deliberately
    // manual, unverified-guess-avoiding tool into a silent third cron.
    expect(Object.keys(doc.on)).not.toContain("schedule");
    expect(Object.keys(doc.on)).toEqual(["workflow_dispatch"]);
  });

  it("only ever runs from the trusted default branch", () => {
    expect(job.if).toBe("github.ref == 'refs/heads/verdant-grow-diary'");
  });

  it("requests read-only repo permissions — it never writes an issue, label, or comment", () => {
    expect(doc.permissions).toEqual({ contents: "read" });
    expect(doc.permissions.issues).toBeUndefined();
  });

  it("hard-fails on a missing secret instead of reporting into a void", () => {
    const guard = job.steps.find((s: { uses?: string }) =>
      String(s.uses ?? "").includes("require-ci-secret"),
    );
    expect(guard).toBeTruthy();
    expect(guard.with["secret-name"]).toBe("SUPABASE_DB_URL_LIVE");
  });

  it("survives a transient package-mirror failure", () => {
    expect(WORKFLOW).toContain("apt-get update -qq || echo");
    expect(WORKFLOW).toContain("could not install postgresql-client after 3 attempts");
  });
});

describe("money contract effect introspection — never creates a repo-visible verdict", () => {
  it("contains no github-script step and no issue/label API calls", () => {
    // This is the concrete difference from the other two workflows: no
    // reconciliation step, no issue lifecycle, nothing for a Codex-style
    // review to find claiming more than was measured — because it claims
    // nothing at all.
    const hasGithubScript = job.steps.some((s: { uses?: string }) =>
      String(s.uses ?? "").includes("github-script"),
    );
    expect(hasGithubScript).toBe(false);
    expect(WORKFLOW).not.toMatch(/issues\.(create|createComment|update|addLabels)/);
  });

  it("labels its own output as an observation, not a verdict", () => {
    expect(WORKFLOW).toMatch(/OBSERVATION, not a pass\/fail gate/);
  });

  it("uploads the full report as an artifact rather than publishing it as an issue", () => {
    const upload = job.steps.find((s: { uses?: string }) =>
      String(s.uses ?? "").includes("upload-artifact"),
    );
    expect(upload).toBeTruthy();
    expect(upload.with.name).toBe("money-contract-effect-introspection");
  });
});

describe("money contract effect introspection — is bounded and reports non-completion", () => {
  it("bounds the introspection step below the job timeout", () => {
    const introspect = job.steps.find((s: { id?: string }) => s.id === "introspect");
    expect(introspect["timeout-minutes"]).toBeGreaterThan(0);
    expect(job["timeout-minutes"]).toBeGreaterThan(introspect["timeout-minutes"]);
  });

  it("sets PGCONNECT_TIMEOUT as an env var, since URL query options are stripped upstream", () => {
    const introspect = job.steps.find((s: { id?: string }) => s.id === "introspect");
    expect(introspect.env.PGCONNECT_TIMEOUT).toBeTruthy();
    expect(WORKFLOW).not.toMatch(/connect_timeout=/);
  });

  it("gates its final failure step on step OUTCOME, not the exit-code output alone", () => {
    // Same pattern as migration-drift-probe.yml and money-migration-drift-alert.yml,
    // kept for consistency even though the ambiguity is currently inert in
    // this workflow (the introspect step always reports 'success' to Actions
    // via `set +e`, and any step before it that could skip it already fails
    // the job on its own).
    const failStep = job.steps.find(
      (s: { name?: string }) => s.name === "Fail the run if introspection could not complete",
    );
    expect(failStep.if).toContain("steps.introspect.outcome != 'success'");
  });

  it("does not fail the job outright if the report is simply missing — it says so instead", () => {
    const publish = job.steps.find(
      (s: { name?: string }) => s.name === "Publish the introspection report",
    );
    expect(publish.if).toBe("always()");
    expect(WORKFLOW).toContain("No report was produced");
  });
});

describe("money contract effect introspection — reuses the CLI script, no forked logic", () => {
  it("invokes the shared script rather than embedding SQL in the workflow", () => {
    expect(WORKFLOW).toContain("node scripts/introspect-money-contract-effect.mjs --json");
  });

  it("contains no SQL of its own", () => {
    expect(WORKFLOW).not.toMatch(/\bSELECT\b.*\bFROM\b/i);
  });
});
