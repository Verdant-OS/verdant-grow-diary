/**
 * Contract for `scripts/verify-published-migration-integrity.mjs` --allow /
 * --allow-file support. Each case builds an isolated throw-away git repo
 * so we can commit a synthetic "baseline" and then mutate the working
 * tree to reproduce every classification the verifier reports.
 *
 * Invariants pinned:
 *   - An unallowlisted edit fails (exit 1).
 *   - `--allow=<path>:<reason>` reclassifies that exact path from
 *     edited/noop/deleted → allowlisted and exits 0.
 *   - `--allow-file=<file.json>` accepts an array or `{allow:[…]}`.
 *   - Reason is required and non-empty; missing reason exits 2.
 *   - Bare filename (`20260722_foo.sql`) resolves to the canonical
 *     `supabase/migrations/<name>` path.
 *   - An unused --allow entry is reported (informational) but does NOT
 *     fail the gate unless `--strict-allowlist` is passed.
 *   - --allow does not silence divergences on other files.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT = resolve(process.cwd(), "scripts/verify-published-migration-integrity.mjs");
const MIG_DIR = "supabase/migrations";
const FILE_A = `${MIG_DIR}/20260101000000_a.sql`;
const FILE_B = `${MIG_DIR}/20260101000001_b.sql`;
const BASELINE_A = "-- baseline A\nselect 1;\n";
const BASELINE_B = "-- baseline B\nselect 2;\n";

let repo: string;

function sh(cmd: string, args: string[], cwd = repo) {
  const r = spawnSync(cmd, args, { cwd, encoding: "utf8" });
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr}`);
  }
  return r.stdout;
}

interface RunResult { status: number; stdout: string; stderr: string }

function run(args: string[]): RunResult {
  try {
    const stdout = execFileSync("node", [SCRIPT, ...args], {
      cwd: repo,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, VERDANT_MIGRATION_BASELINE_REF: "baseline" },
    });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    const e = err as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      status: typeof e.status === "number" ? e.status : 1,
      stdout: e.stdout ? String(e.stdout) : "",
      stderr: e.stderr ? String(e.stderr) : "",
    };
  }
}

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "verify-allowlist-"));
  // Use git plumbing only — stateful porcelain (add/commit/checkout) is
  // blocked in this sandbox. Plumbing (init, hash-object, update-index,
  // write-tree, commit-tree, update-ref) is allowed and produces the
  // same on-disk repo shape the verifier reads.
  sh("git", ["init", "-q", "-b", "main"]);
  sh("git", ["config", "user.email", "t@t.test"]);
  sh("git", ["config", "user.name", "t"]);
  mkdirSync(join(repo, MIG_DIR), { recursive: true });
  writeFileSync(join(repo, FILE_A), BASELINE_A);
  writeFileSync(join(repo, FILE_B), BASELINE_B);
  const blobA = sh("git", ["hash-object", "-w", FILE_A]).trim();
  const blobB = sh("git", ["hash-object", "-w", FILE_B]).trim();
  sh("git", ["update-index", "--add", "--cacheinfo", `100644,${blobA},${FILE_A}`]);
  sh("git", ["update-index", "--add", "--cacheinfo", `100644,${blobB},${FILE_B}`]);
  const tree = sh("git", ["write-tree"]).trim();
  const commit = sh("git", ["commit-tree", tree, "-m", "baseline"]).trim();
  sh("git", ["update-ref", "refs/heads/baseline", commit]);
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("--allow / --allow-file allowlist support", () => {
  it("fails on an unallowlisted edit", () => {
    writeFileSync(join(repo, FILE_A), "-- MUTATED\nselect 99;\n");
    const r = run([]);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/EDITED\s+supabase\/migrations\/20260101000000_a\.sql/);
  });

  it("--allow=<path>:<reason> reclassifies edit → allowlisted (exit 0)", () => {
    writeFileSync(join(repo, FILE_A), "-- MUTATED\nselect 99;\n");
    const r = run([
      "--json",
      `--allow=${FILE_A}:restore missing GRANT after review`,
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.edited).toEqual([]);
    expect(parsed.allowlisted).toHaveLength(1);
    expect(parsed.allowlisted[0]).toMatchObject({
      path: FILE_A,
      kind: "edited",
      reason: "restore missing GRANT after review",
    });
    expect(parsed.allowlist_unused).toEqual([]);
  });

  it("classifies whitespace-only current body as kind='noop' when allowlisted", () => {
    writeFileSync(join(repo, FILE_A), "-- gutted\n\n");
    const r = run(["--json", `--allow=${FILE_A}:intentional retraction`]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.allowlisted[0].kind).toBe("noop");
    expect(parsed.noop_stubs).toEqual([]);
  });

  it("allowlists a deleted baseline file", () => {
    unlinkSync(join(repo, FILE_A));
    const r = run(["--json", `--allow=${FILE_A}:removed after data migration`]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.deleted).toEqual([]);
    expect(parsed.allowlisted[0].kind).toBe("deleted");
  });

  it("accepts a bare filename in --allow (normalized to supabase/migrations/)", () => {
    writeFileSync(join(repo, FILE_A), "-- MUTATED\nselect 99;\n");
    const r = run([
      "--json",
      "--allow=20260101000000_a.sql:normalized path form",
    ]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.allowlisted[0].path).toBe(FILE_A);
  });

  it("does not silence divergence on other files", () => {
    writeFileSync(join(repo, FILE_A), "-- MUTATED A\nselect 42;\n");
    writeFileSync(join(repo, FILE_B), "-- MUTATED B\nselect 43;\n");
    const r = run(["--json", `--allow=${FILE_A}:only A is intentional`]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.ok).toBe(false);
    expect(parsed.allowlisted.map((e: { path: string }) => e.path)).toEqual([FILE_A]);
    expect(parsed.edited.map((e: { path: string }) => e.path)).toEqual([FILE_B]);
  });

  it("exits 2 when --allow spec is missing a reason", () => {
    const r = run([`--allow=${FILE_A}:`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/non-empty reason/);
  });

  it("exits 2 when --allow spec has no colon separator", () => {
    const r = run([`--allow=${FILE_A}`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/<path>:<reason>/);
  });

  it("reports unused --allow entries but does not fail by default", () => {
    // File matches baseline; the allow entry is stale.
    const r = run(["--json", `--allow=${FILE_A}:stale entry`]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.allowlist_unused).toEqual([
      { path: FILE_A, reason: "stale entry" },
    ]);
  });

  it("--strict-allowlist promotes an unused allow entry to a failure", () => {
    const r = run([
      "--json",
      "--strict-allowlist",
      `--allow=${FILE_A}:stale entry`,
    ]);
    expect(r.status).toBe(1);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.allowlist_unused).toHaveLength(1);
  });

  it("--allow-file accepts a bare JSON array", () => {
    writeFileSync(join(repo, FILE_A), "-- MUTATED\n");
    const allowPath = join(repo, "allow.json");
    writeFileSync(
      allowPath,
      JSON.stringify([{ path: FILE_A, reason: "PR-123: hotfix" }]),
    );
    const r = run(["--json", `--allow-file=${allowPath}`]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.allowlisted[0].reason).toBe("PR-123: hotfix");
  });

  it("--allow-file accepts { allow: [...] } shape", () => {
    writeFileSync(join(repo, FILE_A), "-- MUTATED\n");
    const allowPath = join(repo, "allow.json");
    writeFileSync(
      allowPath,
      JSON.stringify({ allow: [{ path: FILE_A, reason: "wrapped shape" }] }),
    );
    const r = run(["--json", `--allow-file=${allowPath}`]);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.allowlisted[0].reason).toBe("wrapped shape");
  });

  it("--allow-file rejects an entry missing reason (exit 2)", () => {
    const allowPath = join(repo, "allow.json");
    writeFileSync(
      allowPath,
      JSON.stringify([{ path: FILE_A, reason: "  " }]),
    );
    const r = run([`--allow-file=${allowPath}`]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/missing non-empty "reason"/);
  });

  it("--allow-file exits 2 when the file is missing", () => {
    const r = run(["--allow-file=./does-not-exist.json"]);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/not found/);
  });
});
