import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  outputs?: Record<string, string>;
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
    expect(Object.keys(step.env ?? {})).toEqual(["XAI_API_KEY"]);
    for (const s of review.steps) {
      expect(JSON.stringify(s.env ?? {})).not.toMatch(/GH_TOKEN|GITHUB_TOKEN|github\.token/);
    }
  });

  it("scopes file reads to the workspace and denies /proc and /sys", () => {
    const run = runOf(review, "Review the diff (read-only)").run!;
    expect(run).not.toMatch(/--allow ['"]Read['"]/);
    expect(run).not.toMatch(/--allow ['"]Grep['"]/);
    expect(run).toContain('--allow "Read(${GITHUB_WORKSPACE}/**)"');
    expect(run).toContain('--allow "Grep(${GITHUB_WORKSPACE}/**)"');
    for (const path of ["/proc/**", "/sys/**"]) {
      expect(run).toContain(`--deny "Read(${path})"`);
      expect(run).toContain(`--deny "Grep(${path})"`);
    }
    expect(run).toContain("--sandbox review-locked");
    const profile = runOf(review, "Write locked sandbox profile").run!;
    expect(profile).toContain('extends = "strict"');
    // The docs name ~/.grok/sandbox.toml; GROK_HOME is the documented home override.
    expect(profile).toContain('"$GROK_HOME/sandbox.toml"');
    expect(profile).toContain('"$HOME/.grok/sandbox.toml"');
    for (const path of ['"/proc"', '"/sys"']) expect(profile).toContain(path);
  });

  it("withholds credential-like output before it leaves the review job", () => {
    const names = review.steps.map((s) => s.name);
    const scanAt = names.indexOf("Withhold credential-like output");
    const uploadAt = names.indexOf("Upload review text");
    expect(scanAt).toBeGreaterThan(names.indexOf("Review the diff (read-only)"));
    expect(scanAt).toBeLessThan(uploadAt);
    const scan = review.steps[scanAt];
    expect(Object.keys(scan.env ?? {})).toEqual(["XAI_API_KEY"]);
    expect(scan.run).toContain('grep -qF -- "$XAI_API_KEY"');
    expect(scan.run).toContain("base64");
    expect(scan.run).toMatch(/xai-/);
    expect(scan.run).toMatch(/gh\[pousr\]_/);
  });

  it("removes PR-supplied agent config before the agent starts", () => {
    const names = review.steps.map((s) => s.name);
    const stripAt = names.indexOf("Remove PR-supplied agent config");
    expect(stripAt).toBeGreaterThan(names.indexOf("Write the PR diff"));
    expect(stripAt).toBeLessThan(names.indexOf("Review the diff (read-only)"));
    const strip = review.steps[stripAt].run!;
    for (const path of [
      ".grok",
      ".claude",
      ".mcp.json",
      ".agents",
      ".cursor",
      ".codex",
      ".gemini",
    ]) {
      expect(strip).toContain(`"$GITHUB_WORKSPACE/${path}"`);
    }
    expect(review.env?.GROK_HOME).toBe("${{ runner.temp }}/grok-home");
  });

  it("disables subagents, writes and web fetch through documented env switches", () => {
    const env = review.env ?? {};
    expect(env.GROK_SUBAGENTS).toBe("0");
    expect(env.GROK_WRITE_FILE).toBe("0");
    expect(env.GROK_WEB_FETCH).toBe("0");
    expect(env.GROK_MEMORY).toBe("0");
    const run = runOf(review, "Review the diff (read-only)").run!;
    expect(run).toContain('--tools "read_file,grep,list_dir"');
  });

  it("posts only when the agent actually ran", () => {
    expect(post.if).toBe("needs.review.outputs.ran == 'true'");
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
    // Any bracketed review-protocol tag, in any case, is defanged.
    expect(header).toMatch(/\/gI'/);
    expect(header).toContain("YES-RECORDED");
  });

  it("defangs every review-protocol marker in any case, and leaves ordinary brackets alone", () => {
    const script = runOf(post, "Build comment body").run!;
    const dir = mkdtempSync(join(tmpdir(), "grok-post-"));
    try {
      const markers = [
        "VERDICT",
        "ROUTE",
        "ACK",
        "CLAIM",
        "FIX REQUEST",
        "YES-RECORDED",
        "APPROVE",
        "APPROVED",
        "APPROVES",
        "PASS",
        "FAIL",
      ];
      const lines = markers.flatMap((m) => [`[${m}] x`, `[${m.toLowerCase()} abc] y`]);
      lines.push("array[0] and [link](https://example.com) stay", "ping @someone");
      mkdirSync(join(dir, "grok"));
      writeFileSync(join(dir, "grok", "review.md"), lines.join("\n") + "\n");
      execFileSync("bash", ["-e", "-c", script], {
        cwd: dir,
        env: { ...process.env, HEAD_SHA: "abc" },
      });
      const out = readFileSync(join(dir, "comment.md"), "utf8");
      for (const m of markers) {
        expect(out).not.toContain(`[${m}]`);
        expect(out).not.toContain(`[${m.toLowerCase()} abc]`);
        expect(out).toContain(`(model note: ${m})`);
      }
      expect(out).toContain("array[0] and [link](https://example.com) stay");
      expect(out).not.toMatch(/@someone/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never interpolates PR-controlled text into a shell script", () => {
    for (const s of allSteps) {
      expect(s.run ?? "").not.toMatch(
        /\$\{\{\s*github\.event\.pull_request\.(title|body|head\.ref)/,
      );
    }
  });
});
