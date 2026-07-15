import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  P3_CONTRACT,
  assertContractIntegrity,
  getContractFile,
} from "../../scripts/p3-preservation/contract.mjs";
import {
  FAILURE,
  sha256,
  checkFileBytes,
  verifyStagedBytes,
} from "../../scripts/p3-preservation/verify-staged-bytes.mjs";

// ---- helpers ---------------------------------------------------------------

function fileFor(path: string, buf: Buffer) {
  return { path, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") };
}

function makeContract(files: Array<{ path: string; bytes: number; sha256: string }>) {
  return {
    baseBranch: "main",
    targetBranch: "feat/x",
    toolingBranch: "codex/x",
    eol: "lf" as const,
    files,
  };
}

function initRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "p3-verify-"));
  const g = (args: string[]) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  g(["init", "-q"]);
  g(["config", "user.email", "t@t"]);
  g(["config", "user.name", "t"]);
  g(["config", "commit.gpgsign", "false"]);
  return repo;
}

function writeFileAt(repo: string, rel: string, buf: Buffer) {
  const full = join(repo, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, buf);
}

function git(repo: string, args: string[]) {
  return spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
}

// ---- contract integrity ----------------------------------------------------

describe("P3 contract", () => {
  it("the shipped contract is well-formed", () => {
    expect(assertContractIntegrity(P3_CONTRACT)).toBe(true);
    expect(P3_CONTRACT.files).toHaveLength(3);
    for (const f of P3_CONTRACT.files) {
      expect(f.path).not.toContain("\\");
      expect(f.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(Number.isInteger(f.bytes) && f.bytes > 0).toBe(true);
    }
  });

  it("getContractFile resolves known and unknown paths", () => {
    expect(getContractFile("scripts/run-pheno-candidate-number-rls-harness.ts")).not.toBeNull();
    expect(getContractFile("nope.txt")).toBeNull();
  });

  it("rejects a duplicate path", () => {
    const dup = fileFor("a/x.sql", Buffer.from("x"));
    expect(() => assertContractIntegrity(makeContract([dup, dup]))).toThrow(/duplicate path/);
  });

  it("rejects a backslash path", () => {
    const f = { path: "a\\x.sql", bytes: 1, sha256: sha256(Buffer.from("x")) };
    expect(() => assertContractIntegrity(makeContract([f]))).toThrow(/forward slashes/);
  });

  it("rejects a bad sha256 and non-positive bytes", () => {
    expect(() =>
      assertContractIntegrity(makeContract([{ path: "a.sql", bytes: 1, sha256: "nothex" }])),
    ).toThrow(/sha256/);
    expect(() =>
      assertContractIntegrity(
        makeContract([{ path: "a.sql", bytes: 0, sha256: sha256(Buffer.from("x")) }]),
      ),
    ).toThrow(/positive integer/);
  });

  it("rejects an empty file list and a bad eol", () => {
    expect(() => assertContractIntegrity(makeContract([]))).toThrow(/non-empty array/);
    const bad = { ...makeContract([fileFor("a.sql", Buffer.from("x"))]), eol: "mac" };
    expect(() => assertContractIntegrity(bad as never)).toThrow(/eol/);
  });
});

// ---- checkFileBytes: every fail-fast condition (pure) -----------------------

describe("checkFileBytes", () => {
  const buf = Buffer.from("frozen-content\n", "utf8");
  const file = fileFor("a/x.sql", buf);

  it("passes when working and staged both match the contract", () => {
    const r = checkFileBytes({ file, workingBytes: buf, stagedBytes: buf });
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it("flags a missing working file", () => {
    const r = checkFileBytes({ file, workingBytes: null, stagedBytes: buf });
    expect(codes(r)).toContain(FAILURE.WORKING_FILE_MISSING);
  });

  it("flags a working size mismatch", () => {
    const r = checkFileBytes({ file, workingBytes: Buffer.from("short"), stagedBytes: buf });
    expect(codes(r)).toContain(FAILURE.WORKING_SIZE_MISMATCH);
  });

  it("flags a working sha mismatch at the right size", () => {
    const tampered = Buffer.alloc(buf.length, 0x41); // same length, different content
    const r = checkFileBytes({ file, workingBytes: tampered, stagedBytes: buf });
    expect(codes(r)).toContain(FAILURE.WORKING_SHA_MISMATCH);
    expect(codes(r)).not.toContain(FAILURE.WORKING_SIZE_MISMATCH);
  });

  it("flags a not-staged path", () => {
    const r = checkFileBytes({ file, workingBytes: buf, stagedBytes: null });
    expect(codes(r)).toContain(FAILURE.NOT_STAGED);
  });

  it("flags staged size and sha mismatches", () => {
    const r = checkFileBytes({ file, workingBytes: buf, stagedBytes: Buffer.from("different") });
    expect(codes(r)).toContain(FAILURE.STAGED_SIZE_MISMATCH);
    expect(codes(r)).toContain(FAILURE.STAGED_SHA_MISMATCH);
  });

  it("flags working-vs-index divergence (the normalization guard)", () => {
    const staged = Buffer.from(buf);
    staged[0] ^= 0xff; // same length, one byte different -> not equal, staged sha differs
    const r = checkFileBytes({ file, workingBytes: buf, stagedBytes: staged });
    expect(codes(r)).toContain(FAILURE.WORKING_INDEX_BYTES_DIFFER);
    expect(codes(r)).not.toContain(FAILURE.WORKING_SHA_MISMATCH); // working still matches contract
  });

  function codes(r: { failures: Array<{ code: string }> }) {
    return r.failures.map((x) => x.code);
  }
});

// ---- verifyStagedBytes aggregation (injected readers, no git) ---------------

describe("verifyStagedBytes (injected readers)", () => {
  const a = fileFor("dir/a.sql", Buffer.from("aaa\n"));
  const b = fileFor("dir/b.ts", Buffer.from("bbbb\n"));
  const contract = makeContract([a, b]);
  const bytesByPath: Record<string, Buffer> = {
    "dir/a.sql": Buffer.from("aaa\n"),
    "dir/b.ts": Buffer.from("bbbb\n"),
  };

  it("passes when every file matches on both sides", () => {
    const read = (_repo: string, p: string) => bytesByPath[p];
    const res = verifyStagedBytes({
      repoRoot: "/fake",
      contract,
      readWorkingBytes: read,
      readStagedBytes: read,
    });
    expect(res.ok).toBe(true);
    expect(res.files.map((f: { ok: boolean }) => f.ok)).toEqual([true, true]);
  });

  it("fails the whole run if one file is unstaged, isolating the failure", () => {
    const read = (_repo: string, p: string) => bytesByPath[p];
    const stagedMissingB = (_repo: string, p: string) => (p === "dir/b.ts" ? null : bytesByPath[p]);
    const res = verifyStagedBytes({
      repoRoot: "/fake",
      contract,
      readWorkingBytes: read,
      readStagedBytes: stagedMissingB,
    });
    expect(res.ok).toBe(false);
    expect(res.files[0].ok).toBe(true);
    expect(res.files[1].ok).toBe(false);
    expect(res.files[1].failures.map((x: { code: string }) => x.code)).toContain(
      FAILURE.NOT_STAGED,
    );
  });
});

// ---- integration: real git index vs working tree ---------------------------

describe("verifyStagedBytes (real git)", () => {
  it("passes when exact bytes are staged with normalization disabled", () => {
    const repo = initRepo();
    try {
      writeFileSync(join(repo, ".gitattributes"), "* -text\n"); // store exact bytes
      const rel = "supabase/migrations/x.sql";
      const buf = Buffer.from("create table x();\n-- lf body\n", "utf8");
      writeFileAt(repo, rel, buf);
      git(repo, ["add", "--", ".gitattributes", rel]);

      const res = verifyStagedBytes({
        repoRoot: repo,
        contract: makeContract([fileFor(rel, buf)]),
      });
      expect(res.ok).toBe(true);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("catches autocrlf/EOL normalization: working matches contract but the staged blob was rewritten", () => {
    const repo = initRepo();
    try {
      // Force text normalization to LF in the index, regardless of global config.
      writeFileSync(join(repo, ".gitattributes"), "*.sql text eol=lf\n");
      git(repo, ["add", "--", ".gitattributes"]);

      const rel = "supabase/migrations/x.sql";
      const crlf = Buffer.from("create table x();\r\n-- crlf body\r\n", "utf8"); // working = CRLF
      writeFileAt(repo, rel, crlf);
      git(repo, ["add", "--", rel]); // index blob normalized to LF

      // Contract expects the CRLF bytes (as frozen); working matches, index does not.
      const res = verifyStagedBytes({
        repoRoot: repo,
        contract: makeContract([fileFor(rel, crlf)]),
      });
      expect(res.ok).toBe(false);

      const codes = res.files[0].failures.map((x: { code: string }) => x.code);
      expect(codes).toContain(FAILURE.WORKING_INDEX_BYTES_DIFFER);
      expect(codes).toContain(FAILURE.STAGED_SIZE_MISMATCH);
      expect(codes).toContain(FAILURE.STAGED_SHA_MISMATCH);
      // The divergence is specifically the staged blob - the working file is intact.
      expect(codes).not.toContain(FAILURE.WORKING_SIZE_MISMATCH);
      expect(codes).not.toContain(FAILURE.WORKING_SHA_MISMATCH);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
