import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

type Step = {
  name?: string;
  id?: string;
  if?: string;
  run?: string;
  env?: Record<string, string>;
  uses?: string;
  with?: Record<string, unknown>;
};
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
  it("passes --diff-merges=remerge and --text so merge resolutions and -diff files are scanned", () => {
    expect(step("Scan commits").run).toMatch(
      /--log-opts="--diff-merges=remerge --text \$\{RANGE\}"/,
    );
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
    const quoted = /--log-opts="([^"]+)"/.exec(step("Scan commits").run)?.[1] ?? "";
    const optArgs = quoted.replaceAll("${RANGE}", "").trim().split(/\s+/).filter(Boolean);
    const withOpts = git(dir, "log", "-p", "-U0", ...optArgs, `${base}..HEAD`);
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

  it("checks out with persist-credentials false (Reviewer B P2-1 at 1d7c91eb)", () => {
    const checkout = steps.find((s) => s.name === "Checkout");
    expect(checkout?.uses).toContain("actions/checkout@");
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
    expect(checkout?.with?.["fetch-depth"]).toBe(0);
  });

  it("scans a secret hidden by a checkout -diff attribute (Reviewer B P1-2 at 1d7c91eb)", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    // Built at runtime so this file never contains a live-looking key.
    const fakeKey = ["AKIA", "IOSFODNN7", "EXAMPLE"].join("");
    writeFileSync(join(dir, "creds.txt"), `aws_key=${fakeKey}\n`);
    writeFileSync(join(dir, ".gitattributes"), "creds.txt -diff\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "hidden");
    expect(git(dir, "log", "-p", "-U0", "--format=", `${base}..HEAD`)).not.toContain(fakeKey);

    const patchOut = join(dir, "scanner-patch.txt");
    const attrOut = join(dir, "attr-state.txt");
    const bin = mkdtempSync(join(tmpdir(), "stub-gitleaks-diff-"));
    dirs.push(bin);
    writeFileSync(
      join(bin, "gitleaks"),
      [
        "#!/bin/sh",
        "logopts=",
        'for a in "$@"; do',
        '  case "$a" in',
        '    --log-opts=*) logopts="${a#--log-opts=}" ;;',
        "  esac",
        "done",
        "# shellcheck disable=SC2086",
        `git log -p -U0 --no-color --format= $logopts > '${patchOut}'`,
        `if [ -e .gitattributes ]; then echo present > '${attrOut}'; else echo absent > '${attrOut}'; fi`,
        "n=$(git rev-list --count $RANGE)",
        'echo "$n commits scanned."',
        "exit 0",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    execFileSync("bash", ["-c", step("Scan commits").run], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        RANGE: `${base}..HEAD`,
        POLICY_DIR: bin,
      },
    });
    expect(readFileSync(attrOut, "utf8").trim()).toBe("absent");
    expect(readFileSync(patchOut, "utf8")).toContain(fakeKey);
    expect(step("Scan commits").run).toContain("git log -p --text ");
  });

  it("removes a symlinked .gitattributes so the scan can see the secret (Reviewer B P1-1 at e17a3f23)", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    const fakeKey = ["AKIA", "0TESTKEY01234567"].join("");
    writeFileSync(join(dir, "creds.txt"), `aws_key=${fakeKey}\n`);
    writeFileSync(join(dir, "attrs"), "creds.txt -diff\n");
    symlinkSync("attrs", join(dir, ".gitattributes"));
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "hidden");
    const hazard = spawnSync("git", ["log", "-p", "--text", "--format=", `${base}..HEAD`], {
      cwd: dir,
      encoding: "utf8",
    });
    expect(hazard.status).toBe(0);
    expect(hazard.stderr).toContain("unable to access '.gitattributes'");
    expect(step("Scan commits").run).not.toContain("-name .gitattributes -type f");

    const patchOut = join(dir, "scanner-patch.txt");
    const attrOut = join(dir, "attr-state.txt");
    const bin = mkdtempSync(join(tmpdir(), "stub-gitleaks-link-"));
    dirs.push(bin);
    writeFileSync(
      join(bin, "gitleaks"),
      [
        "#!/bin/sh",
        "logopts=",
        'for a in "$@"; do',
        '  case "$a" in',
        '    --log-opts=*) logopts="${a#--log-opts=}" ;;',
        "  esac",
        "done",
        "# shellcheck disable=SC2086",
        `git log -p -U0 --no-color --format= $logopts > '${patchOut}'`,
        `if [ -e .gitattributes ] || [ -L .gitattributes ]; then echo present > '${attrOut}'; else echo absent > '${attrOut}'; fi`,
        "n=$(git rev-list --count $RANGE)",
        'echo "$n commits scanned."',
        "exit 0",
        "",
      ].join("\n"),
      { mode: 0o755 },
    );
    execFileSync("bash", ["-c", step("Scan commits").run], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        RANGE: `${base}..HEAD`,
        POLICY_DIR: bin,
      },
    });
    expect(readFileSync(attrOut, "utf8").trim()).toBe("absent");
    expect(readFileSync(patchOut, "utf8")).toContain(fakeKey);
  });

  it("fails closed when git log writes to stderr (Reviewer B P1-1 at e17a3f23)", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, "note.txt"), "hello\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "note");
    // A self-symlink attributes file makes git log warn and still exit 0.
    // gitleaks v8.30.1 then scans 0 commits and exits 0. The name is not
    // .gitattributes, so the cleanup above does not remove it.
    const loop = join(dir, "loop-attrs");
    symlinkSync("loop-attrs", loop);
    git(dir, "config", "core.attributesFile", loop);
    const bin = mkdtempSync(join(tmpdir(), "stub-gitleaks-stderr-"));
    dirs.push(bin);
    writeFileSync(join(bin, "gitleaks"), "#!/bin/sh\necho '1 commits scanned.'\nexit 0\n", {
      mode: 0o755,
    });
    expect(step("Scan commits").run).toContain("git log wrote to stderr");
    expect(() =>
      execFileSync("bash", ["-c", step("Scan commits").run], {
        cwd: dir,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          RANGE: `${base}..HEAD`,
          POLICY_DIR: bin,
        },
      }),
    ).toThrow();
  });

  it("fails closed when gitleaks reports 0 commits for a non-empty range (Reviewer B P1-1 at e17a3f23)", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, "note.txt"), "hello\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "note");
    const bin = mkdtempSync(join(tmpdir(), "stub-gitleaks-zero-"));
    dirs.push(bin);
    writeFileSync(join(bin, "gitleaks"), "#!/bin/sh\necho '0 commits scanned.'\nexit 0\n", {
      mode: 0o755,
    });
    expect(step("Scan commits").run).toContain("commits are in range");
    expect(() =>
      execFileSync("bash", ["-c", step("Scan commits").run], {
        cwd: dir,
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ""}`,
          RANGE: `${base}..HEAD`,
          POLICY_DIR: bin,
        },
      }),
    ).toThrow();
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
      writeFileSync(
        join(bin, "gitleaks"),
        '#!/bin/sh\nn=$(git rev-list --count $RANGE)\necho "$n commits scanned."\nexit 0\n',
        { mode: 0o755 },
      );
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
