import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  CHECK,
  repoSlugFromUrl,
  checkGitAvailable,
  checkGhAuth,
  checkRepoIdentity,
  checkSourceWorktree,
  checkCleanDestination,
  checkBranchAvailability,
  checkBaseRemoteSha,
  runPreflight,
  createDefaultEnv,
} from "../../scripts/p3-preservation/preflight.mjs";

// ---- helpers ---------------------------------------------------------------

function fileFor(path: string, buf: Buffer) {
  return { path, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

function makeContract(files: Array<{ path: string; bytes: number; sha256: string }>) {
  return {
    baseBranch: "main",
    targetBranch: "feat/pheno-candidate-number-foundation",
    toolingBranch: "codex/p3-preservation-workflow",
    eol: "lf" as const,
    files,
  };
}

const SRC_A = Buffer.from("alpha\n");
const SRC_B = Buffer.from("beta beta\n");
const CONTRACT = makeContract([
  fileFor("supabase/migrations/a.sql", SRC_A),
  fileFor("scripts/b.ts", SRC_B),
]);
const SOURCE_BYTES: Record<string, Buffer> = {
  "supabase/migrations/a.sql": SRC_A,
  "scripts/b.ts": SRC_B,
};
const BASE_SHA = "a".repeat(40);

/** A fully-passing fake env; override individual methods per test. */
function passingEnv(overrides: Record<string, unknown> = {}) {
  return {
    gitVersion: () => ({ ok: true, version: "git version 2.99.0" }),
    ghAuthStatus: () => ({ present: true, authed: true }),
    originUrl: () => "https://github.com/Verdant-OS/verdant-grow-diary.git",
    pathIsDir: () => true,
    readWorkingBytes: (_root: string, p: string) => SOURCE_BYTES[p] ?? null,
    porcelain: () => [] as string[],
    localBranchExists: () => false,
    remoteRef: (_repo: string, _remote: string, ref: string) =>
      ref === `refs/heads/${CONTRACT.baseBranch}` ? BASE_SHA : null,
    ...overrides,
  };
}

// ---- repoSlugFromUrl -------------------------------------------------------

describe("repoSlugFromUrl", () => {
  it("parses https, https+.git, ssh, and trailing slash forms", () => {
    expect(repoSlugFromUrl("https://github.com/Verdant-OS/verdant-grow-diary.git")).toBe(
      "verdant-os/verdant-grow-diary",
    );
    expect(repoSlugFromUrl("https://github.com/Verdant-OS/verdant-grow-diary")).toBe(
      "verdant-os/verdant-grow-diary",
    );
    expect(repoSlugFromUrl("git@github.com:Verdant-OS/verdant-grow-diary.git")).toBe(
      "verdant-os/verdant-grow-diary",
    );
    expect(repoSlugFromUrl("https://github.com/Verdant-OS/verdant-grow-diary/")).toBe(
      "verdant-os/verdant-grow-diary",
    );
  });

  it("returns null for junk", () => {
    expect(repoSlugFromUrl("")).toBeNull();
    expect(repoSlugFromUrl(undefined as never)).toBeNull();
  });
});

// ---- individual checks -----------------------------------------------------

describe("preflight checks", () => {
  it("GIT_AVAILABLE passes and fails", () => {
    expect(checkGitAvailable(passingEnv()).ok).toBe(true);
    expect(checkGitAvailable(passingEnv({ gitVersion: () => ({ ok: false }) })).ok).toBe(false);
  });

  it("GH_AUTH is advisory by default but an error when required", () => {
    const unauth = passingEnv({ ghAuthStatus: () => ({ present: true, authed: false }) });
    const warn = checkGhAuth(unauth, { requireGh: false });
    expect(warn.ok).toBe(false);
    expect(warn.severity).toBe("warn");

    const err = checkGhAuth(unauth, { requireGh: true });
    expect(err.severity).toBe("error");

    const missing = checkGhAuth(
      passingEnv({ ghAuthStatus: () => ({ present: false, authed: false }) }),
      {},
    );
    expect(missing.ok).toBe(false);
    expect(missing.severity).toBe("warn");

    expect(checkGhAuth(passingEnv(), {}).ok).toBe(true);
  });

  it("REPO_IDENTITY matches the expected slug and rejects a wrong origin", () => {
    expect(checkRepoIdentity(passingEnv(), { destRepo: "/d" }).ok).toBe(true);
    const wrong = passingEnv({ originUrl: () => "https://github.com/someone/other.git" });
    expect(checkRepoIdentity(wrong, { destRepo: "/d" }).ok).toBe(false);
  });

  it("CLEAN_DESTINATION passes when clean and fails when dirty", () => {
    expect(checkCleanDestination(passingEnv(), { destRepo: "/d" }).ok).toBe(true);
    const dirty = passingEnv({ porcelain: () => [" M src/x.ts", "?? junk"] });
    const r = checkCleanDestination(dirty, { destRepo: "/d" });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/not clean/);
  });

  it("BRANCH_AVAILABILITY fails if the target exists locally or on origin", () => {
    expect(
      checkBranchAvailability(passingEnv(), { destRepo: "/d", targetBranch: "feat/x" }).ok,
    ).toBe(true);

    const local = passingEnv({ localBranchExists: () => true });
    expect(checkBranchAvailability(local, { destRepo: "/d", targetBranch: "feat/x" }).ok).toBe(
      false,
    );

    const remote = passingEnv({ remoteRef: () => "deadbeef" + "0".repeat(32) });
    expect(checkBranchAvailability(remote, { destRepo: "/d", targetBranch: "feat/x" }).ok).toBe(
      false,
    );
  });

  it("BASE_REMOTE_SHA surfaces the sha, and fails when missing or moved", () => {
    const ok = checkBaseRemoteSha(passingEnv(), { destRepo: "/d", baseBranch: "main" });
    expect(ok.ok).toBe(true);
    expect(ok.sha).toBe(BASE_SHA);

    const missing = checkBaseRemoteSha(passingEnv({ remoteRef: () => null }), {
      destRepo: "/d",
      baseBranch: "main",
    });
    expect(missing.ok).toBe(false);

    const moved = checkBaseRemoteSha(passingEnv(), {
      destRepo: "/d",
      baseBranch: "main",
      expectedBaseSha: "b".repeat(40),
    });
    expect(moved.ok).toBe(false);
    expect(moved.detail).toMatch(/moved/);
  });
});

// ---- checkSourceWorktree against a real directory --------------------------

describe("checkSourceWorktree (real fs)", () => {
  it("passes when every contract file matches the source bytes", () => {
    const src = mkdtempSync(join(tmpdir(), "p3-src-"));
    try {
      for (const f of CONTRACT.files) {
        const full = join(src, f.path);
        mkdirSync(dirname(full), { recursive: true });
        writeFileSync(full, SOURCE_BYTES[f.path]);
      }
      const r = checkSourceWorktree(createDefaultEnv(), {
        sourceWorktree: src,
        contract: CONTRACT,
      });
      expect(r.ok).toBe(true);
    } finally {
      rmSync(src, { recursive: true, force: true });
    }
  });

  it("fails on a byte mismatch and reports the offending path", () => {
    const src = mkdtempSync(join(tmpdir(), "p3-src-"));
    try {
      for (const f of CONTRACT.files) {
        const full = join(src, f.path);
        mkdirSync(dirname(full), { recursive: true });
        // Tamper one file so its bytes no longer match the contract.
        writeFileSync(
          full,
          f.path === "scripts/b.ts" ? Buffer.from("TAMPERED\n") : SOURCE_BYTES[f.path],
        );
      }
      const r = checkSourceWorktree(createDefaultEnv(), {
        sourceWorktree: src,
        contract: CONTRACT,
      });
      expect(r.ok).toBe(false);
      expect(r.detail).toMatch(/scripts\/b\.ts/);
    } finally {
      rmSync(src, { recursive: true, force: true });
    }
  });

  it("fails when the source worktree is absent", () => {
    const r = checkSourceWorktree(createDefaultEnv(), {
      sourceWorktree: join(tmpdir(), "definitely-not-here-p3"),
      contract: CONTRACT,
    });
    expect(r.ok).toBe(false);
    expect(r.detail).toMatch(/not found/);
  });
});

// ---- aggregation -----------------------------------------------------------

describe("runPreflight", () => {
  it("passes with everything green and surfaces the base sha", () => {
    const res = runPreflight({
      destRepo: "/d",
      sourceWorktree: "/s",
      contract: CONTRACT,
      env: passingEnv(),
    });
    expect(res.ok).toBe(true);
    expect(res.baseSha).toBe(BASE_SHA);
    expect(res.warnings).toHaveLength(0);
  });

  it("stays green but records a warning when gh is unauthenticated (no PR)", () => {
    const env = passingEnv({ ghAuthStatus: () => ({ present: false, authed: false }) });
    const res = runPreflight({ destRepo: "/d", sourceWorktree: "/s", contract: CONTRACT, env });
    expect(res.ok).toBe(true);
    expect(res.warnings.map((w: { id: string }) => w.id)).toContain(CHECK.GH_AUTH);
  });

  it("blocks when gh auth is required but missing", () => {
    const env = passingEnv({ ghAuthStatus: () => ({ present: false, authed: false }) });
    const res = runPreflight({
      destRepo: "/d",
      sourceWorktree: "/s",
      contract: CONTRACT,
      env,
      requireGh: true,
    });
    expect(res.ok).toBe(false);
    expect(res.errors.map((e: { id: string }) => e.id)).toContain(CHECK.GH_AUTH);
  });

  it("blocks on any single failing error check (dirty destination)", () => {
    const env = passingEnv({ porcelain: () => [" M supabase/migrations/a.sql"] });
    const res = runPreflight({ destRepo: "/d", sourceWorktree: "/s", contract: CONTRACT, env });
    expect(res.ok).toBe(false);
    expect(res.errors.map((e: { id: string }) => e.id)).toContain(CHECK.CLEAN_DESTINATION);
  });

  it("throws on a structurally invalid contract", () => {
    const dup = fileFor("dup.sql", Buffer.from("x"));
    expect(() =>
      runPreflight({
        destRepo: "/d",
        sourceWorktree: "/s",
        contract: makeContract([dup, dup]),
        env: passingEnv(),
      }),
    ).toThrow(/duplicate path/);
  });
});
