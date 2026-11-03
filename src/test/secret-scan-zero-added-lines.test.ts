import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { load } from "js-yaml";
import { afterAll, describe, expect, it } from "vitest";

type Step = { name?: string; run?: string };
const wf = load(
  readFileSync(resolve(__dirname, "../../.github/workflows/secret-scan.yml"), "utf8"),
) as { jobs: { "secret-scan": { steps: Step[] } } };
function scanRun(): string {
  const found = wf.jobs["secret-scan"].steps.find((step) => step.name === "Scan commits");
  if (!found?.run) throw new Error("missing Scan commits step");
  return (found as Step & { run: string }).run;
}

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "secret-scan-zero-"));
  dirs.push(dir);
  git(dir, "init", "-q", "-b", "verdant-grow-diary");
  writeFileSync(join(dir, "a.txt"), "base\n");
  git(dir, "add", ".");
  git(dir, "commit", "-qm", "base");
  return dir;
}

function runScan(cwd: string, range: string, stub: string) {
  const bin = mkdtempSync(join(tmpdir(), "stub-gitleaks-zero-lines-"));
  dirs.push(bin);
  writeFileSync(join(bin, "gitleaks"), stub, { mode: 0o755 });
  return execFileSync("bash", ["-c", scanRun()], {
    cwd,
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      RANGE: range,
      POLICY_DIR: bin,
    },
    stdio: "pipe",
  });
}

const zeroScanned = "#!/bin/sh\necho '0 commits scanned.'\nexit 0\n";

describe("secret-scan 0-commit guard", () => {
  it("passes a deletion-only commit when gitleaks scans 0 commits", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "rm", "-q", "a.txt");
    git(dir, "commit", "-qm", "drop");
    expect(() => runScan(dir, `${base}..HEAD`, zeroScanned)).not.toThrow();
  });

  it("passes an empty commit when gitleaks scans 0 commits", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "commit", "-q", "--allow-empty", "-m", "empty");
    expect(() => runScan(dir, `${base}..HEAD`, zeroScanned)).not.toThrow();
  });

  it("passes a range of only deletions and empty commits when gitleaks scans 0", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "commit", "-q", "--allow-empty", "-m", "empty");
    git(dir, "rm", "-q", "a.txt");
    git(dir, "commit", "-qm", "drop");
    expect(() => runScan(dir, `${base}..HEAD`, zeroScanned)).not.toThrow();
  });

  it("fails when the range adds lines and gitleaks scans 0 commits", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, "note.txt"), "hello\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "note");
    expect(() => runScan(dir, `${base}..HEAD`, zeroScanned)).toThrow();
  });

  it("fails when a deletion shares the range with a commit that adds lines", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "rm", "-q", "a.txt");
    git(dir, "commit", "-qm", "drop");
    writeFileSync(join(dir, "note.txt"), "hello\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "note");
    expect(() => runScan(dir, `${base}..HEAD`, zeroScanned)).toThrow();
  });

  it("fails a deletion-only range when the scanned count is missing", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    git(dir, "rm", "-q", "a.txt");
    git(dir, "commit", "-qm", "drop");
    expect(() => runScan(dir, `${base}..HEAD`, "#!/bin/sh\nexit 0\n")).toThrow();
  });

  it("passes a commit that adds lines when gitleaks reports that commit", () => {
    const dir = fixture();
    const base = git(dir, "rev-parse", "HEAD");
    writeFileSync(join(dir, "note.txt"), "hello\n");
    git(dir, "add", ".");
    git(dir, "commit", "-qm", "note");
    expect(() =>
      runScan(dir, `${base}..HEAD`, "#!/bin/sh\necho '1 commits scanned.'\nexit 0\n"),
    ).not.toThrow();
  });
});
