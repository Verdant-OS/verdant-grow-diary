import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type Step = {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
};
type Job = {
  if?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  env?: Record<string, string>;
  steps: Step[];
};
type Workflow = {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, Job>;
};

const wf = load(
  readFileSync(resolve(__dirname, "../../.github/workflows/grok-review.yml"), "utf8"),
) as Workflow;
const review = wf.jobs.review;
const post = wf.jobs.post;
const allSteps = [...review.steps, ...post.steps];
const runOf = (job: Job, name: string) => {
  const s = job.steps.find((x) => x.name === name);
  if (!s?.run) throw new Error(`missing step ${name}`);
  return s;
};

describe("grok-review workflow safety contract", () => {
  it("defaults every job to read-only and grants pull-requests: write only to the post job", () => {
    expect(wf.permissions).toEqual({ contents: "read" });
    expect(review.permissions).toEqual({ contents: "read" });
    expect(post.permissions).toEqual({ contents: "read", "pull-requests": "write" });
  });

  it("runs only on non-draft, same-repository PRs into the deploy branch", () => {
    const pr = wf.on.pull_request as { branches: string[] };
    expect(pr.branches).toEqual(["verdant-grow-diary"]);
    expect(review.if).toContain("github.event.pull_request.draft == false");
    expect(review.if).toContain(
      "github.event.pull_request.head.repo.full_name == github.repository",
    );
  });

  it("pins every action to a full commit SHA", () => {
    for (const s of allSteps.filter((x) => x.uses)) {
      expect(s.uses).toMatch(/@[0-9a-f]{40}$/);
    }
  });

  it("checks out without persisting the token where the agent can read it", () => {
    const checkout = review.steps.find((s) => s.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
    expect(post.steps.some((s) => s.uses?.startsWith("actions/checkout@"))).toBe(false);
  });

  it("installs an exact CLI version from npm, never a piped install script", () => {
    const install = runOf(review, "Install Grok CLI (pinned)").run!;
    expect(install).toMatch(/@xai-official\/grok@\d+\.\d+\.\d+/);
    for (const s of allSteps) expect(s.run ?? "").not.toMatch(/curl[^\n]*\|\s*(ba)?sh/);
  });

  it("runs the agent read-only, with no auto-approve and no GitHub token", () => {
    const step = runOf(review, "Review the diff (read-only)");
    for (const flag of [
      "--always-approve",
      "--yolo",
      "bypassPermissions",
      "--dangerously-skip-permissions",
    ]) {
      expect(step.run).not.toContain(flag);
    }
    expect(step.run).toContain("--permission-mode dontAsk");
    expect(step.run).toContain("--disallowed-tools");
    expect(step.run).toContain("run_terminal_cmd");
    expect(step.run).toContain("--no-auto-update");
    expect(Object.keys(step.env ?? {})).toEqual(["XAI_API_KEY", "GROK_DISABLE_AUTOUPDATER"]);
    for (const s of review.steps) {
      expect(JSON.stringify(s.env ?? {})).not.toMatch(/GH_TOKEN|GITHUB_TOKEN|github\.token/);
    }
  });

  it("keeps the xAI key out of the posting job", () => {
    expect(JSON.stringify(post)).not.toContain("XAI_API_KEY");
  });

  it("posts a comment only, never an approval, and marks it as not independent acceptance", () => {
    const step = runOf(post, "Post peer-observation comment");
    expect(step.run).toContain("gh pr comment");
    expect(step.run).not.toMatch(/gh pr review|--approve|pr merge/);
    const header = runOf(post, "Build comment body").run!;
    expect(header).toContain("not an independent review");
  });

  it("never interpolates PR-controlled text into a shell script", () => {
    for (const s of allSteps) {
      expect(s.run ?? "").not.toMatch(
        /\$\{\{\s*github\.event\.pull_request\.(title|body|head\.ref)/,
      );
    }
  });
});
