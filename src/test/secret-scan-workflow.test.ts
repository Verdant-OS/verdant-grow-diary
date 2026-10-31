import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

type Step = { name?: string; id?: string; if?: string; run?: string; env?: Record<string, string> };
const wf = load(
  readFileSync(resolve(__dirname, "../../.github/workflows/secret-scan.yml"), "utf8"),
) as { jobs: { "secret-scan": { steps: Step[] } } };
const steps = wf.jobs["secret-scan"].steps;
const step = (name: string) => {
  const s = steps.find((x) => x.name === name);
  if (!s?.run) throw new Error(`missing step ${name}`);
  return s as Step & { run: string };
};

const dirs: string[] = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "secret-scan-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "verdant-grow-diary");
  writeFileSync(join(dir, "a.txt"), "base\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "base");
  git(dir, "remote", "add", "origin", dir);
  return dir;
}

function runRange(cwd: string, env: Record<string, string>) {
  const out = join(cwd, ".gh-output");
  writeFileSync(out, "");
  execFileSync("bash", ["-c", step("Resolve scan range").run], {
    cwd,
    env: { ...process.env, GITHUB_OUTPUT: out, ...env },
  });
  const text = readFileSync(out, "utf8");
  return {
    skip: /^skip=(.*)$/m.exec(text)?.[1],
    policy_ref: /^policy_ref=(.*)$/m.exec(text)?.[1],
    range: /range<<EOF\n(.*)\nEOF/.exec(text)?.[1],
  };
}

describe("secret-scan workflow", () => {
  it("passes remerge-diff so merge resolutions are scanned without parent trees", () => {
    expect(step("Scan commits").run).toMatch(/--log-opts="--remerge-diff \$\{RANGE\}"/);
    expect(step("Scan commits").run).not.toMatch(/--log-opts="-m /);
  });

  it("a secret added only in a merge resolution shows up with the workflow's log opts", () => {
    const dir = fixture();
    git(dir, "checkout", "-qb", "feature");
    writeFileSync(join(dir, "f.txt"), "feature\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "feature");
    git(dir, "checkout", "-q", "verdant-grow-diary");
    writeFileSync(join(dir, "b.txt"), "BASE_ONLY_MARKER\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "base2");
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-q", "feature");
    git(dir, "merge", "-q", "--no-commit", "verdant-grow-diary");
    writeFileSync(join(dir, "merge-only.txt"), "MERGE_ONLY_MARKER\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "merge");
    const range = `${base}..HEAD`;
    expect(git(dir, "log", "-p", "-U0", range)).not.toContain("MERGE_ONLY_MARKER");
    const shown = git(dir, "log", "-p", "-U0", "--remerge-diff", range);
    expect(shown).toContain("MERGE_ONLY_MARKER");
    expect(shown).not.toContain("BASE_ONLY_MARKER");
    expect(git(dir, "log", "-p", "-U0", "-m", range)).toContain("BASE_ONLY_MARKER");
  });

  it("loads config, baseline and ignore list from the base ref, not the PR tree", () => {
    const policy = step("Load scan policy from base").run;
    expect(policy).toContain('git show "${POLICY_REF}:.gitleaks.toml"');
    expect(policy).toContain('git show "${POLICY_REF}:.gitleaks-baseline.json"');
    expect(policy).toContain('git show "${POLICY_REF}:.gitleaksignore"');
    const scan = step("Scan commits").run;
    expect(scan).toContain('--config "$POLICY_DIR/gitleaks.toml"');
    expect(scan).toContain('--baseline-path "$POLICY_DIR/baseline.json"');
    expect(scan).toContain('--gitleaks-ignore-path "$POLICY_DIR/.gitleaksignore"');
    expect(scan).not.toMatch(/--config \.gitleaks\.toml|--baseline-path \.gitleaks-baseline/);
  });

  it("uses the PR base sha as policy ref", () => {
    const dir = fixture();
    const sha = git(dir, "rev-parse", "HEAD");
    expect(runRange(dir, { EVENT_NAME: "pull_request", PR_BASE: sha, PR_HEAD: sha })).toEqual({
      skip: "false",
      policy_ref: sha,
      range: `${sha}..${sha}`,
    });
  });

  it("treats branch or tag deletion as a no-op", () => {
    const dir = fixture();
    const sha = git(dir, "rev-parse", "HEAD");
    const zero = "0".repeat(40);
    expect(
      runRange(dir, {
        EVENT_NAME: "push",
        PUSH_BEFORE: sha,
        PUSH_AFTER: zero,
        PUSH_DELETED: "true",
      }).skip,
    ).toBe("true");
    expect(
      runRange(dir, { EVENT_NAME: "push", PUSH_BEFORE: sha, PUSH_AFTER: zero, PUSH_DELETED: "" })
        .skip,
    ).toBe("true");
    expect(steps.filter((s) => s.if?.includes("skip != 'true'")).map((s) => s.name)).toEqual([
      "Load scan policy from base",
      "Scan commits",
    ]);
  });

  it("falls back to merge-base when a force-push leaves the old tip unreachable", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "checkout", "-qb", "feature");
    writeFileSync(join(dir, "f.txt"), "x\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "f");
    const after = git(dir, "rev-parse", "HEAD");
    const gone = "1234567890abcdef1234567890abcdef12345678";
    expect(
      runRange(dir, {
        EVENT_NAME: "push",
        PUSH_BEFORE: gone,
        PUSH_AFTER: after,
        PUSH_DELETED: "false",
      }),
    ).toEqual({
      skip: "false",
      policy_ref: base,
      range: `${base}..${after}`,
    });
  });

  it("loads push policy from the previous default-branch tip", () => {
    const dir = fixture();
    const before = git(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, ".gitleaksignore"), "allow\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "allowlist");
    const after = git(dir, "rev-parse", "HEAD");
    expect(
      runRange(dir, {
        EVENT_NAME: "push",
        PUSH_BEFORE: before,
        PUSH_AFTER: after,
        PUSH_DELETED: "false",
        PUSH_REF: "refs/heads/verdant-grow-diary",
      }),
    ).toEqual({
      skip: "false",
      policy_ref: before,
      range: `${before}..${after}`,
    });
  });

  it("scans only the pushed tip when a default-branch force-push drops the old tip", () => {
    const dir = fixture();
    writeFileSync(join(dir, "c.txt"), "second\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "second");
    const after = git(dir, "rev-parse", "HEAD");
    const gone = "1234567890abcdef1234567890abcdef12345678";
    const emptyTree = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
    const result = runRange(dir, {
      EVENT_NAME: "push",
      PUSH_BEFORE: gone,
      PUSH_AFTER: after,
      PUSH_DELETED: "false",
      PUSH_REF: "refs/heads/verdant-grow-diary",
    });
    expect(result).toEqual({
      skip: "false",
      policy_ref: emptyTree,
      range: `-1 ${after}`,
    });
    expect(git(dir, "rev-list", "--count", after)).not.toBe("1");
    expect(git(dir, "rev-list", "--count", "-1", after)).toBe("1");
  });

  it("still rejects a malformed push sha (detection not weakened)", () => {
    const dir = fixture();
    expect(() =>
      runRange(dir, {
        EVENT_NAME: "push",
        PUSH_BEFORE: "",
        PUSH_AFTER: "nope",
        PUSH_DELETED: "false",
      }),
    ).toThrow();
  });
});
