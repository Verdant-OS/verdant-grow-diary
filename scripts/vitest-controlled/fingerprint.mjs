// Workspace fingerprint for resume safety.
//
// Contract:
//   * The fingerprint changes whenever ANY tracked file or non-ignored
//     untracked file in the repository changes (path, contents, symlink
//     target, or presence).
//   * Ignored files (node_modules, .vitest-runs, build outputs, etc.) are
//     excluded via `git ls-files --exclude-standard` so runner artifacts
//     never cause self-invalidation.
//   * File contents, secrets, and absolute user paths are NEVER persisted.
//     The stored artifact contains only: digest, algorithm/version, file
//     count, clean/dirty classification, and coarse category counts.
//   * Hashing is streaming and deterministic: POSIX-normalized paths,
//     stable lexical order, explicit MISSING and SYMLINK markers, no
//     timestamps, no enumeration-order dependence.
//
// Schema history:
//   v1 — legacy: test-source-only "dirty-tree hash" (replaced).
//   v2 — current: git-aware workspace fingerprint over tracked +
//        non-ignored untracked files.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const FINGERPRINT_SCHEMA_VERSION = 2;
export const FINGERPRINT_ALGORITHM = "sha256";

/** Normalize any repo-relative path to POSIX form for stable hashing. */
export function toPosixRel(rel) {
  // Always convert backslashes so Windows and POSIX runs agree regardless
  // of the current platform's path.sep.
  return rel.split(/[\\/]/).join("/");
}

function runGit(repoRoot, args) {
  const res = spawnSync("git", ["-C", repoRoot, ...args], {
    maxBuffer: 512 * 1024 * 1024,
  });
  if (res.status !== 0) {
    const stderr = res.stderr ? res.stderr.toString("utf8") : "";
    const err = new Error(`git ${args.join(" ")} failed (${res.status}): ${stderr.trim()}`);
    err.code = "GIT_FAILED";
    throw err;
  }
  return res.stdout;
}

function splitNul(buf) {
  if (!buf || !buf.length) return [];
  const s = buf.toString("utf8");
  const parts = s.split("\0");
  // trailing empty after final NUL
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/**
 * Enumerate every file that must participate in the workspace fingerprint:
 *   * tracked files (`git ls-files --cached`)
 *   * non-ignored untracked files (`git ls-files --others --exclude-standard`)
 * Excludes anything the repository's .gitignore chain excludes, which is
 * how .vitest-runs, node_modules, dist, artifacts, etc. are kept out.
 * Returns POSIX-normalized, deduplicated, lexically sorted paths.
 */
export function listWorkspaceFiles(repoRoot) {
  const tracked = runGit(repoRoot, ["ls-files", "-z", "--cached"]);
  const untracked = runGit(repoRoot, [
    "ls-files",
    "-z",
    "--others",
    "--exclude-standard",
  ]);
  const set = new Set();
  for (const p of splitNul(tracked)) set.add(toPosixRel(p));
  for (const p of splitNul(untracked)) set.add(toPosixRel(p));
  return [...set].sort();
}

/**
 * Detect whether the working tree matches HEAD exactly (no modified,
 * staged, deleted, renamed, or untracked non-ignored files).
 */
export function isWorktreeClean(repoRoot) {
  const status = runGit(repoRoot, ["status", "--porcelain=v1", "-z"]);
  return splitNul(status).length === 0;
}

function classifyPath(rel) {
  if (rel.startsWith("src/")) return "src";
  if (rel.startsWith("scripts/")) return "scripts";
  if (rel.startsWith("supabase/")) return "supabase";
  if (rel.startsWith("docs/")) return "docs";
  if (rel.startsWith(".github/")) return "workflows";
  if (rel.startsWith("e2e/")) return "e2e";
  if (rel.startsWith("public/")) return "public";
  if (!rel.includes("/")) return "root";
  return "other";
}

function hashFileStreaming(absPath, sizeHint) {
  const h = crypto.createHash(FINGERPRINT_ALGORITHM);
  // Small files: single read. Large files: streaming read.
  if (sizeHint !== undefined && sizeHint < 1024 * 128) {
    h.update(fs.readFileSync(absPath));
    return h.digest("hex");
  }
  const fd = fs.openSync(absPath, "r");
  try {
    const buf = Buffer.allocUnsafe(64 * 1024);
    let bytes;
    // eslint-disable-next-line no-constant-condition
    while ((bytes = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      h.update(buf.subarray(0, bytes));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

/**
 * Compute the deterministic workspace fingerprint. Streaming, path-sorted,
 * cross-platform stable. Never writes file contents anywhere.
 *
 * Returns:
 *   {
 *     digest: string,                // hex sha256 of the whole workspace
 *     algorithm: "sha256",
 *     schema: 2,
 *     fileCount: number,
 *     mode: "clean" | "dirty",       // whether worktree matches HEAD
 *     categories: { [area]: number } // coarse counts (paths NOT stored)
 *   }
 */
export function computeWorkspaceFingerprint(repoRoot) {
  const files = listWorkspaceFiles(repoRoot);
  const outer = crypto.createHash(FINGERPRINT_ALGORITHM);
  outer.update(`workspace:v${FINGERPRINT_SCHEMA_VERSION}:${FINGERPRINT_ALGORITHM}\n`);
  const categories = Object.create(null);
  let counted = 0;
  for (const rel of files) {
    // Refuse absolute or escaping paths defensively.
    if (rel.startsWith("/") || rel.includes("..")) {
      throw new Error(`unsafe path from git ls-files: ${rel}`);
    }
    const abs = path.resolve(repoRoot, rel);
    let entry;
    try {
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) {
        const target = fs.readlinkSync(abs);
        // Normalize symlink target to POSIX so Windows/Linux match.
        entry = `S\0${toPosixRel(target)}`;
      } else if (st.isFile()) {
        const digest = hashFileStreaming(abs, st.size);
        entry = `F\0${digest}`;
      } else if (st.isDirectory()) {
        // A tracked submodule/dir entry: mark deterministically.
        entry = `D`;
      } else {
        entry = `O`;
      }
    } catch (err) {
      if (err && err.code === "ENOENT") {
        entry = `M`; // tracked but missing
      } else {
        throw err;
      }
    }
    // NUL-separated record: `<rel>\0<entry>\n` — path and entry cannot
    // straddle each other because both are NUL-framed.
    outer.update(rel);
    outer.update("\0");
    outer.update(entry);
    outer.update("\n");
    const cat = classifyPath(rel);
    categories[cat] = (categories[cat] || 0) + 1;
    counted++;
  }
  const clean = isWorktreeClean(repoRoot);
  return {
    digest: outer.digest("hex"),
    algorithm: FINGERPRINT_ALGORITHM,
    schema: FINGERPRINT_SCHEMA_VERSION,
    fileCount: counted,
    mode: clean ? "clean" : "dirty",
    categories,
  };
}

/**
 * Compute a run configuration fingerprint (shard / worker / pool /
 * reporter / manifest identity). Kept separate from the workspace
 * fingerprint so operators can see which piece drifted.
 */
export function computeSourceFingerprint(repoRoot, params) {
  const {
    manifestHash,
    shardIndex,
    shardTotal,
    batchSize,
    maxWorkers,
    minWorkers,
    pool,
    reporterSchemaVersion,
  } = params;
  const h = crypto.createHash(FINGERPRINT_ALGORITHM);
  h.update(`config:v${FINGERPRINT_SCHEMA_VERSION}\n`);
  h.update(`manifest:${manifestHash}\n`);
  h.update(`shard:${shardIndex}/${shardTotal}\n`);
  h.update(`batch:${batchSize}\n`);
  h.update(`workers:${minWorkers}-${maxWorkers}\n`);
  h.update(`pool:${pool}\n`);
  h.update(`reporterSchema:${reporterSchemaVersion}\n`);
  return h.digest("hex");
}

/** Human-readable diff summary (digest-only; never exposes paths/contents). */
export function fingerprintMismatch(previous, current) {
  if (previous === current) return null;
  const prev = typeof previous === "string" ? previous : "<absent>";
  const cur = typeof current === "string" ? current : "<absent>";
  return `fingerprint drift: previous=${prev.slice(0, 12)}… current=${cur.slice(0, 12)}…`;
}
