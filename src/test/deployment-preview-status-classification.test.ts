/**
 * Contract test for the PR status comment posted by
 * `.github/workflows/deployment-preview.yml`.
 *
 * The workflow's `build` job declares `needs: preflight` without `always()`,
 * so a preflight failure leaves the build result at `skipped`. The comment
 * must keep that distinct from a build that ran and failed: a skipped build
 * is unmeasured evidence, not a failure. This test resolves the YAML, takes
 * the step's real `run` script and the real enforcement script, and executes
 * them with `bash` under each job-result combination, with `gh` replaced by a
 * PATH shim that records the posted body. No network, no repo mutation.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { load } from "js-yaml";

const ROOT = resolve(__dirname, "../..");
const WORKFLOW = resolve(ROOT, ".github/workflows/deployment-preview.yml");
const POST_STEP = "Post preview-status comment";
const ENFORCE_STEP = "Enforce overall preview verdict";

type Step = { name?: string; run?: string; env?: Record<string, string> };
type Workflow = { jobs: Record<string, { steps: Step[] }> };

const bashAvailable = spawnSync("bash", ["-c", "true"]).status === 0;

function loadSteps(): { post: Step; enforce: Step } {
  const doc = load(readFileSync(WORKFLOW, "utf8")) as Workflow;
  const steps = doc.jobs["publish-preview-status"].steps;
  const post = steps.find((step) => step.name === POST_STEP);
  const enforce = steps.find((step) => step.name === ENFORCE_STEP);
  if (!post?.run || !enforce?.run) {
    throw new Error(`deployment-preview.yml must define "${POST_STEP}" and "${ENFORCE_STEP}"`);
  }
  return { post, enforce };
}

const GH_SHIM = `#!/usr/bin/env bash
# Records the body that the workflow would post; never reaches GitHub.
printf '%s\\n' "$*" >> "$GH_SHIM_OUT.calls"
if [ "$1" = "pr" ] && [ "$2" = "comment" ]; then
  while [ $# -gt 0 ]; do
    if [ "$1" = "--body" ]; then printf '%s' "$2" > "$GH_SHIM_OUT"; fi
    shift
  done
fi
exit 0
`;

type JobResult = "success" | "failure" | "skipped" | "cancelled";

function runPostStep(dir: string, preflight: JobResult, build: JobResult): string {
  const { post } = loadSteps();
  const out = join(dir, `body-${preflight}-${build}.md`);
  const result = spawnSync("bash", ["-c", post.run as string], {
    encoding: "utf8",
    env: {
      PATH: `${dir}${delimiter}${process.env.PATH ?? ""}`,
      GH_SHIM_OUT: out,
      GH_TOKEN: "shim",
      REPO: "example/repo",
      PR: "1",
      SHA: "0123456789abcdef0123456789abcdef01234567",
      PREFLIGHT: preflight,
      BUILD: build,
      RUN_URL: "https://example.invalid/run",
    },
  });
  expect(result.status, result.stderr).toBe(0);
  return readFileSync(out, "utf8");
}

function runEnforceStep(preflight: JobResult, build: JobResult): number {
  const { enforce } = loadSteps();
  // The enforcement script reads the job results through workflow
  // expressions; substitute the same values GitHub would inject.
  const script = (enforce.run as string)
    .replaceAll("${{ needs.preflight.result }}", preflight)
    .replaceAll("${{ needs.build.result }}", build);
  expect(script).not.toContain("${{");
  return spawnSync("bash", ["-c", script], { encoding: "utf8" }).status ?? -1;
}

describe.skipIf(!bashAvailable)("deployment-preview status comment classification", () => {
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "deployment-preview-status-"));
    const shim = join(dir, "gh");
    writeFileSync(shim, GH_SHIM);
    chmodSync(shim, 0o755);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("reads both job results from the workflow's needs, not from literals", () => {
    const { post } = loadSteps();
    expect(post.env?.PREFLIGHT).toBe("${{ needs.preflight.result }}");
    expect(post.env?.BUILD).toBe("${{ needs.build.result }}");
  });

  it("certifies only the CI build when both stages succeed", () => {
    const body = runPostStep(dir, "success", "success");
    expect(body).toContain("**CI build verified** — preview contents not measured");
    expect(body).not.toContain("do not share a preview");
    expect(body).toContain("`0123456789ab`");
  });

  it("reports a skipped build as not run, never as failed", () => {
    const body = runPostStep(dir, "failure", "skipped");
    expect(body).toContain("**CI build not run** (preflight `failure`)");
    expect(body).toContain("unmeasured, not failed");
    expect(body).toContain("do not share a preview");
    expect(body).not.toContain("CI build failed");
  });

  it("reports a build that ran and failed as failed, never as not run", () => {
    const body = runPostStep(dir, "success", "failure");
    expect(body).toContain("**CI build failed**");
    expect(body).toContain("do not share a preview");
    expect(body).not.toContain("not run");
  });

  it("reports any other build result as incomplete, naming the result", () => {
    const body = runPostStep(dir, "success", "cancelled");
    expect(body).toContain("**CI build did not complete** (`cancelled`)");
    expect(body).toContain("do not share a preview");
    expect(body).not.toContain("CI build failed");
    expect(body).not.toContain("not run");
  });

  it("never certifies the build when preflight failed but build somehow reports success", () => {
    const body = runPostStep(dir, "failure", "success");
    expect(body).not.toContain("CI build verified");
    expect(body).toContain("do not share a preview");
  });

  it("keeps the overall verdict red for every non-success combination", () => {
    expect(runEnforceStep("success", "success")).toBe(0);
    expect(runEnforceStep("failure", "skipped")).toBe(1);
    expect(runEnforceStep("success", "failure")).toBe(1);
    expect(runEnforceStep("success", "cancelled")).toBe(1);
    expect(runEnforceStep("failure", "success")).toBe(1);
  });
});
