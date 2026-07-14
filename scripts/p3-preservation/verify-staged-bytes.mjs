#!/usr/bin/env node
/**
 * verify-staged-bytes - for each file in the P.3 contract, compare:
 *   (a) working-tree raw bytes   vs  contract (size + SHA-256)
 *   (b) staged index-blob bytes  vs  contract (size + SHA-256)
 *   (c) working-tree bytes       vs  staged index-blob bytes   (equality)
 *
 * (c) is the guard against EOL/autocrlf normalization silently changing the
 * committed blob (see contract.mjs). All comparisons are over RAW bytes; SHA-256
 * is of raw content, NOT a git blob hash.
 *
 * Scope: this verifies the three contract paths only. Asserting that ONLY those
 * paths are staged (no extras swept in) belongs in preflight / the orchestrator.
 *
 * Usage: node scripts/p3-preservation/verify-staged-bytes.mjs [--repo <path>]
 * Exit 0 = every file verified; exit 1 = any failure or bad contract.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

import { P3_CONTRACT, assertContractIntegrity } from "./contract.mjs";

export const FAILURE = Object.freeze({
  WORKING_FILE_MISSING: "WORKING_FILE_MISSING",
  WORKING_SIZE_MISMATCH: "WORKING_SIZE_MISMATCH",
  WORKING_SHA_MISMATCH: "WORKING_SHA_MISMATCH",
  NOT_STAGED: "NOT_STAGED",
  STAGED_SIZE_MISMATCH: "STAGED_SIZE_MISMATCH",
  STAGED_SHA_MISMATCH: "STAGED_SHA_MISMATCH",
  WORKING_INDEX_BYTES_DIFFER: "WORKING_INDEX_BYTES_DIFFER",
});

export function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * Pure per-file check. `workingBytes` / `stagedBytes` are Buffer | null
 * (null = absent from the working tree / index respectively).
 * Returns { path, ok, failures: [{ code, expected, actual }] }.
 */
export function checkFileBytes({ file, workingBytes, stagedBytes }) {
  const failures = [];
  const expectedSha = file.sha256.toLowerCase();

  if (workingBytes == null) {
    failures.push({ code: FAILURE.WORKING_FILE_MISSING, expected: file.path, actual: null });
  } else {
    if (workingBytes.length !== file.bytes) {
      failures.push({
        code: FAILURE.WORKING_SIZE_MISMATCH,
        expected: file.bytes,
        actual: workingBytes.length,
      });
    }
    const wSha = sha256(workingBytes);
    if (wSha !== expectedSha) {
      failures.push({ code: FAILURE.WORKING_SHA_MISMATCH, expected: expectedSha, actual: wSha });
    }
  }

  if (stagedBytes == null) {
    failures.push({ code: FAILURE.NOT_STAGED, expected: file.path, actual: null });
  } else {
    if (stagedBytes.length !== file.bytes) {
      failures.push({
        code: FAILURE.STAGED_SIZE_MISMATCH,
        expected: file.bytes,
        actual: stagedBytes.length,
      });
    }
    const sSha = sha256(stagedBytes);
    if (sSha !== expectedSha) {
      failures.push({ code: FAILURE.STAGED_SHA_MISMATCH, expected: expectedSha, actual: sSha });
    }
  }

  // Normalization guard: what is on disk must equal what git will commit.
  if (workingBytes != null && stagedBytes != null && !workingBytes.equals(stagedBytes)) {
    failures.push({
      code: FAILURE.WORKING_INDEX_BYTES_DIFFER,
      expected: "working bytes === staged blob bytes",
      actual: `working ${workingBytes.length}B vs staged ${stagedBytes.length}B differ`,
    });
  }

  return { path: file.path, ok: failures.length === 0, failures };
}

// ---- default readers (real fs + git) --------------------------------------

/** Read a working-tree file as raw bytes, or null if it does not exist. */
export function defaultReadWorkingBytes(repoRoot, relPath) {
  try {
    return readFileSync(join(repoRoot, relPath)); // Buffer
  } catch (err) {
    if (err && err.code === "ENOENT") return null;
    throw err;
  }
}

/**
 * Read the staged (index) blob for a path as raw bytes, or null if the path is
 * not staged. `:path` reads from the index; forward slashes are correct even on
 * Windows.
 */
export function defaultReadStagedBytes(repoRoot, relPath) {
  const res = spawnSync("git", ["-C", repoRoot, "cat-file", "blob", `:${relPath}`], {
    encoding: "buffer",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.error) throw res.error;
  if (res.status !== 0) return null; // not staged (or not a git repo)
  return res.stdout;
}

/**
 * Verify all contract files. Readers are injectable so the aggregation logic can
 * be unit-tested without touching git or the filesystem.
 * Returns { ok, files: [checkFileBytes results...] }.
 */
export function verifyStagedBytes({
  repoRoot = process.cwd(),
  contract = P3_CONTRACT,
  readWorkingBytes = defaultReadWorkingBytes,
  readStagedBytes = defaultReadStagedBytes,
} = {}) {
  assertContractIntegrity(contract);
  const files = contract.files.map((file) =>
    checkFileBytes({
      file,
      workingBytes: readWorkingBytes(repoRoot, file.path),
      stagedBytes: readStagedBytes(repoRoot, file.path),
    }),
  );
  return { ok: files.every((f) => f.ok), files };
}

export function formatReport(result) {
  const lines = [];
  for (const f of result.files) {
    if (f.ok) {
      lines.push(`  OK    ${f.path}`);
    } else {
      lines.push(`  FAIL  ${f.path}`);
      for (const x of f.failures) {
        lines.push(
          `          ${x.code}: expected ${JSON.stringify(x.expected)}, got ${JSON.stringify(x.actual)}`,
        );
      }
    }
  }
  lines.push(result.ok ? "verify-staged-bytes: PASS" : "verify-staged-bytes: FAIL");
  return lines.join("\n");
}

// ---- CLI ------------------------------------------------------------------

function parseArgs(argv) {
  let repo = process.cwd();
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--repo") {
      repo = argv[++i];
    } else if (argv[i].startsWith("--repo=")) {
      repo = argv[i].slice("--repo=".length);
    }
  }
  return { repo };
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const { repo } = parseArgs(process.argv.slice(2));
  const result = verifyStagedBytes({ repoRoot: repo });
  process.stdout.write(formatReport(result) + "\n");
  process.exit(result.ok ? 0 : 1);
}
