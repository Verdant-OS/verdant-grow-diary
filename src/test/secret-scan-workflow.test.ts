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
    range: /range<<EOF\n(.*)\nEOF/.exec(text)?.[1],
    policyRef: /^policy_ref=(.*)$/m.exec(text)?.[1],
  };
}

describe("secret-scan workflow", () => {
  it("passes --diff-merges=remerge so merge resolutions are scanned", () => {
    expect(step("Scan commits").run).toMatch(/--log-opts="--diff-merges=remerge \$\{RANGE\}"/);
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
    const opts = /--log-opts="([^ ]+) \$\{RANGE\}"/.exec(step("Scan commits").run)?.[1] ?? "";
    const withOpts = git(dir, "log", "-p", "-U0", opts, `${base}..HEAD`);
    expect(withOpts).toContain("MERGE_ONLY_MARKER");
    // Lines merged in from base are not re-reported as new in the merge commit.
    expect(withOpts).not.toContain("BASE_ONLY_MARKER");
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
      range: `${sha}..${sha}`,
      policyRef: sha,
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
      range: `${base}..${after}`,
      policyRef: base,
    });
  });

  it("normal push takes policy from the pre-push tip, not the pushed commits", () => {
    const dir = fixture();
    const before = git(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, "n.txt"), "n\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "n");
    const after = git(dir, "rev-parse", "HEAD");
    expect(
      runRange(dir, {
        EVENT_NAME: "push",
        PUSH_BEFORE: before,
        PUSH_AFTER: after,
        PUSH_DELETED: "false",
      }),
    ).toEqual({
      skip: "false",
      range: `${before}..${after}`,
      policyRef: before,
    });
  });

  it("fetches a missing before sha and still scans before..after", () => {
    const origin = fixture();
    git(origin, "checkout", "-qb", "side");
    writeFileSync(join(origin, "old.txt"), "OLD_TIP_MARKER\n");
    git(origin, "add", ".");
    git(origin, "commit", "-qm", "old");
    const before = git(origin, "rev-parse", "HEAD");
    git(origin, "checkout", "-q", "verdant-grow-diary");
    writeFileSync(join(origin, "new.txt"), "NEW_TIP_MARKER\n");
    git(origin, "add", ".");
    git(origin, "commit", "-qm", "new");
    const after = git(origin, "rev-parse", "HEAD");
    const runner = mkdtempSync(join(tmpdir(), "secret-scan-runner-"));
    dirs.push(runner);
    execFileSync(
      "git",
      [
        "clone",
        "-q",
        "--no-local",
        "--single-branch",
        "--branch",
        "verdant-grow-diary",
        origin,
        runner,
      ],
      { encoding: "utf8" },
    );
    expect(() => git(runner, "cat-file", "-e", `${before}^{commit}`)).toThrow();
    const result = runRange(runner, {
      EVENT_NAME: "push",
      PUSH_BEFORE: before,
      PUSH_AFTER: after,
      PUSH_DELETED: "false",
      PUSH_REF: "refs/heads/verdant-grow-diary",
    });
    expect(result).toEqual({ skip: "false", range: `${before}..${after}`, policyRef: before });
    const patch = git(runner, "log", "-p", "-U0", "--diff-merges=remerge", result.range ?? "");
    expect(patch).toContain("NEW_TIP_MARKER");
    expect(patch).not.toContain("OLD_TIP_MARKER");
  });

  it("scans the new deploy tip when a rewrite leaves no reachable before", () => {
    const dir = fixture();
    writeFileSync(join(dir, "leak.txt"), "REWRITTEN_DEPLOY_MARKER\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "rewrite");
    const after = git(dir, "rev-parse", "HEAD");
    const gone = "1234567890abcdef1234567890abcdef12345678";
    const result = runRange(dir, {
      EVENT_NAME: "push",
      PUSH_BEFORE: gone,
      PUSH_AFTER: after,
      PUSH_DELETED: "false",
      PUSH_REF: "refs/heads/verdant-grow-diary",
    });
    // No trusted pre-push ref: default policy, no baseline (fails closed).
    expect(result).toEqual({ skip: "false", range: after, policyRef: "" });
    expect(git(dir, "log", "-p", "-U0", "--diff-merges=remerge", result.range ?? "")).toContain(
      "REWRITTEN_DEPLOY_MARKER",
    );
    expect(
      git(dir, "log", "-p", "-U0", "--diff-merges=remerge", `${after}..${after}`),
    ).not.toContain("REWRITTEN_DEPLOY_MARKER");
  });

  it("does not rescan deploy history when another ref already matches that tip", () => {
    const dir = fixture();
    const after = git(dir, "rev-parse", "HEAD");
    const gone = "abcdef1234567890abcdef1234567890abcdef12";
    expect(
      runRange(dir, {
        EVENT_NAME: "push",
        PUSH_BEFORE: gone,
        PUSH_AFTER: after,
        PUSH_DELETED: "false",
        PUSH_REF: "refs/heads/feature",
      }),
    ).toEqual({ skip: "false", range: `${after}..${after}`, policyRef: after });
  });

  it("empty policy ref falls back to defaults, not the working tree or index", () => {
    const policy = step("Load scan policy from base").run;
    expect(policy).toContain('has() { [ -n "$POLICY_REF" ] &&');
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

  describe("inline allow marker guard (Reviewer D P2 at 289819fb)", () => {
    // Built at runtime so this file never carries the literal marker.
    const MARKER = ["gitleaks", "allow"].join(":");
    const scan = () => step("Scan commits");
    // Runs the real Scan commits step with a stub gitleaks that always passes,
    // so only the marker guard can fail it.
    const runGuard = (cwd: string, range: string) => {
      const bin = mkdtempSync(join(tmpdir(), "stub-gitleaks-"));
      dirs.push(bin);
      writeFileSync(join(bin, "gitleaks"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      return execFileSync("bash", ["-c", scan().run], {
        cwd,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          RANGE: range,
          POLICY_DIR: bin,
        },
        stdio: "pipe",
      });
    };
    const commit = (dir: string, file: string, body: string) => {
      writeFileSync(join(dir, file), body);
      git(dir, "add", ".");
      git(dir, "commit", "-qm", file);
    };

    it("guards inside Scan commits, before gitleaks runs, without the literal marker", () => {
      const run = scan().run;
      expect(run.indexOf("gitleaks[:]allow")).toBeGreaterThan(-1);
      expect(run.indexOf("gitleaks[:]allow")).toBeLessThan(run.indexOf("gitleaks git "));
      expect(run).toContain("--diff-merges=remerge --format= ${RANGE}");
      expect(run).not.toContain(MARKER);
    });

    it("the stubbed scan passes a clean range (the stub is not hiding failures)", () => {
      const dir = fixture();
      const base = git(dir, "rev-parse", "HEAD");
      commit(dir, "ok.txt", "fine\n");
      expect(() => runGuard(dir, `${base}..HEAD`)).not.toThrow();
    });

    it("fails when an added line carries the marker", () => {
      const dir = fixture();
      const base = git(dir, "rev-parse", "HEAD");
      commit(dir, "leak.txt", `token = "not-a-real-value" # ${MARKER}\n`);
      expect(() => runGuard(dir, `${base}..HEAD`)).toThrow();
    });

    it("passes a clean range and a marker that only exists before the range", () => {
      const dir = fixture();
      commit(dir, "old.txt", `legacy # ${MARKER}\n`);
      const base = git(dir, "rev-parse", "HEAD");
      commit(dir, "clean.txt", "nothing to see\n");
      expect(() => runGuard(dir, `${base}..HEAD`)).not.toThrow();
    });

    it("fails when the marker is added only while resolving a merge", () => {
      const dir = fixture();
      git(dir, "checkout", "-qb", "feature");
      commit(dir, "f.txt", "feature\n");
      git(dir, "checkout", "-q", "verdant-grow-diary");
      commit(dir, "b.txt", "base2\n");
      const base = git(dir, "rev-parse", "HEAD");
      git(dir, "checkout", "-q", "feature");
      git(dir, "merge", "-q", "--no-commit", "verdant-grow-diary");
      writeFileSync(join(dir, "merge-only.txt"), `x # ${MARKER}\n`);
      git(dir, "add", ".");
      git(dir, "commit", "-qm", "merge");
      expect(() => runGuard(dir, `${base}..HEAD`)).toThrow();
    });

    it("a marker present in base is not re-reported by a later merge", () => {
      const dir = fixture();
      git(dir, "checkout", "-qb", "feature");
      commit(dir, "f.txt", "feature\n");
      git(dir, "checkout", "-q", "verdant-grow-diary");
      const base = git(dir, "rev-parse", "HEAD");
      commit(dir, "b.txt", `base-owned # ${MARKER}\n`);
      const baseTip = git(dir, "rev-parse", "HEAD");
      git(dir, "checkout", "-q", "feature");
      git(dir, "merge", "-q", "--no-edit", "verdant-grow-diary");
      // Feature-side range: base's own commit is excluded, the clean merge adds nothing.
      expect(() => runGuard(dir, `${baseTip}..HEAD`)).not.toThrow();
      expect(base).not.toBe(baseTip);
    });
  });
});
