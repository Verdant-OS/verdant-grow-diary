// Workspace + configuration + assignment + composite-shard fingerprints
// for the controlled Vitest runner.
//
// Design intent (v4 identity model):
//   * `computeWorkspaceFingerprint`   — repository content identity (v2)
//   * `computeCommonConfigFingerprint` — identical across every shard in
//     one run (no shard index, no assigned paths). This is what aggregate
//     validation requires to be one-per-run.
//   * `computeAssignmentFingerprint`   — deterministic identity of the
//     files this specific shard was assigned. Distinct per shard.
//   * `computeShardFingerprint`        — composite resume/aggregate id
//     that binds common+assignment+shard-index.
//
// Contract:
//   * File contents, secrets, and absolute user paths are NEVER persisted.
//     The stored workspace artifact contains only: digest, algorithm/version,
//     file count, clean/dirty classification, and coarse category counts.
//   * Hashing is streaming and deterministic: POSIX-normalized paths,
//     stable lexical order, explicit MISSING and SYMLINK markers.
//
// Schema history:
//   Workspace v1 — legacy dirty-tree hash (replaced).
//   Workspace v2 — current git-aware workspace fingerprint.
//   Config    v1..v2 — early ad-hoc fingerprints (replaced).
//   Config    v3 — folded toolchain identity into a single ambiguous
//                  "sourceFingerprint" that included shardIndex — the
//                  cause of the 16-distinct-fingerprint aggregate defect.
//   Config    v4 — split into commonConfig / assignment / composite; the
//                  common config is what aggregate requires identical.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const FINGERPRINT_SCHEMA_VERSION = 2;
export const CONFIG_FINGERPRINT_SCHEMA_VERSION = 4;
export const FINGERPRINT_ALGORITHM = "sha256";

/** Normalize any repo-relative path to POSIX form for stable hashing. */
export function toPosixRel(rel) {
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
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

export function listWorkspaceFiles(repoRoot) {
  const tracked = runGit(repoRoot, ["ls-files", "-z", "--cached"]);
  const untracked = runGit(repoRoot, ["ls-files", "-z", "--others", "--exclude-standard"]);
  const set = new Set();
  for (const p of splitNul(tracked)) set.add(toPosixRel(p));
  for (const p of splitNul(untracked)) set.add(toPosixRel(p));
  return [...set].sort();
}

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
  if (sizeHint !== undefined && sizeHint < 1024 * 128) {
    h.update(fs.readFileSync(absPath));
    return h.digest("hex");
  }
  const fd = fs.openSync(absPath, "r");
  try {
    const buf = Buffer.allocUnsafe(64 * 1024);
    let bytes = fs.readSync(fd, buf, 0, buf.length, null);
    while (bytes > 0) {
      h.update(buf.subarray(0, bytes));
      bytes = fs.readSync(fd, buf, 0, buf.length, null);
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest("hex");
}

export function computeWorkspaceFingerprint(repoRoot) {
  const files = listWorkspaceFiles(repoRoot);
  const outer = crypto.createHash(FINGERPRINT_ALGORITHM);
  outer.update(`workspace:v${FINGERPRINT_SCHEMA_VERSION}:${FINGERPRINT_ALGORITHM}\n`);
  const categories = Object.create(null);
  let counted = 0;
  for (const rel of files) {
    if (rel.startsWith("/") || rel.includes("..")) {
      throw new Error(`unsafe path from git ls-files: ${rel}`);
    }
    const abs = path.resolve(repoRoot, rel);
    let entry;
    try {
      const st = fs.lstatSync(abs);
      if (st.isSymbolicLink()) {
        const target = fs.readlinkSync(abs);
        entry = `S\0${toPosixRel(target)}`;
      } else if (st.isFile()) {
        const digest = hashFileStreaming(abs, st.size);
        entry = `F\0${digest}`;
      } else if (st.isDirectory()) {
        entry = `D`;
      } else {
        entry = `O`;
      }
    } catch (err) {
      if (err && err.code === "ENOENT") entry = `M`;
      else throw err;
    }
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

function requireToolVersions(tv, fn) {
  if (!tv || !tv.node || !tv.bun || !tv.vitest) {
    throw Object.assign(
      new Error(
        `${fn} requires toolVersions {node,bun,vitest} — refusing to hash a null toolchain identity`,
      ),
      { code: "TOOLCHAIN_UNKNOWN" },
    );
  }
}

/**
 * v4 common-configuration fingerprint. Identical across every shard in
 * one run. Aggregate validation REQUIRES this to be one-per-run.
 *
 * Includes only run-wide identity: manifest hash, shard total, batch
 * size, pool, worker limits, all schema versions, and toolchain. Never
 * includes shard index, assigned paths, timestamps, absolute paths, or
 * run IDs.
 */
export function computeCommonConfigFingerprint({
  manifestHash,
  shardTotal,
  batchSize,
  pool,
  minWorkers,
  maxWorkers,
  runSchema,
  reporterSchema,
  manifestSchema,
  workspaceFingerprintSchema,
  configFingerprintSchema,
  toolVersions,
}) {
  requireToolVersions(toolVersions, "computeCommonConfigFingerprint");
  const h = crypto.createHash(FINGERPRINT_ALGORITHM);
  h.update(`common-config:v${CONFIG_FINGERPRINT_SCHEMA_VERSION}\n`);
  h.update(`manifest:${manifestHash}\n`);
  h.update(`shardTotal:${shardTotal}\n`);
  h.update(`batch:${batchSize}\n`);
  h.update(`workers:${minWorkers}-${maxWorkers}\n`);
  h.update(`pool:${pool}\n`);
  h.update(
    `schemas:run=${runSchema};reporter=${reporterSchema};manifest=${manifestSchema};workspace=${workspaceFingerprintSchema};config=${configFingerprintSchema}\n`,
  );
  h.update(`node:${toolVersions.node}\n`);
  h.update(`bun:${toolVersions.bun}\n`);
  h.update(`vitest:${toolVersions.vitest}\n`);
  return h.digest("hex");
}

/**
 * v4 assignment fingerprint. Deterministic identity of the exact set of
 * files this shard was assigned. Distinct per shard by design. The same
 * assignment must hash identically on Windows and Linux — inputs are
 * POSIX-normalized before hashing.
 */
export function computeAssignmentFingerprint({ shardIndex, shardTotal, assignedFiles }) {
  if (!Number.isInteger(shardIndex) || !Number.isInteger(shardTotal)) {
    throw new Error("computeAssignmentFingerprint: shardIndex/shardTotal must be integers");
  }
  if (!Array.isArray(assignedFiles)) {
    throw new Error("computeAssignmentFingerprint: assignedFiles must be an array");
  }
  const normalized = assignedFiles.map((f) => toPosixRel(String(f)));
  const sorted = [...normalized].sort();
  const h = crypto.createHash(FINGERPRINT_ALGORITHM);
  h.update(`assignment:v${CONFIG_FINGERPRINT_SCHEMA_VERSION}\n`);
  h.update(`shard:${shardIndex}/${shardTotal}\n`);
  h.update(`count:${sorted.length}\n`);
  for (const p of sorted) {
    h.update(p);
    h.update("\n");
  }
  return h.digest("hex");
}

/**
 * v4 composite shard fingerprint. Binds common-config + assignment +
 * shard index/total into a single opaque identity used for resume and
 * per-shard uniqueness checks.
 */
export function computeShardFingerprint({
  commonConfigFingerprint,
  assignmentFingerprint,
  shardIndex,
  shardTotal,
}) {
  if (!commonConfigFingerprint || !assignmentFingerprint) {
    throw new Error(
      "computeShardFingerprint requires commonConfigFingerprint and assignmentFingerprint",
    );
  }
  const h = crypto.createHash(FINGERPRINT_ALGORITHM);
  h.update(`shard-composite:v${CONFIG_FINGERPRINT_SCHEMA_VERSION}\n`);
  h.update(`common:${commonConfigFingerprint}\n`);
  h.update(`assignment:${assignmentFingerprint}\n`);
  h.update(`shard:${shardIndex}/${shardTotal}\n`);
  return h.digest("hex");
}

/**
 * LEGACY (v3) — kept only so any external caller still importing this
 * symbol fails loudly by producing a hash that v4 aggregate/resume will
 * refuse. Do not use in new code paths.
 * @deprecated superseded by computeCommonConfigFingerprint + computeAssignmentFingerprint + computeShardFingerprint
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
    toolVersions,
  } = params;
  requireToolVersions(toolVersions, "computeSourceFingerprint");
  const h = crypto.createHash(FINGERPRINT_ALGORITHM);
  h.update(`config:v3-legacy\n`);
  h.update(`manifest:${manifestHash}\n`);
  h.update(`shard:${shardIndex}/${shardTotal}\n`);
  h.update(`batch:${batchSize}\n`);
  h.update(`workers:${minWorkers}-${maxWorkers}\n`);
  h.update(`pool:${pool}\n`);
  h.update(`reporterSchema:${reporterSchemaVersion}\n`);
  h.update(`node:${toolVersions.node}\n`);
  h.update(`bun:${toolVersions.bun}\n`);
  h.update(`vitest:${toolVersions.vitest}\n`);
  return h.digest("hex");
}

/** Human-readable diff summary (digest-only; never exposes paths/contents). */
export function fingerprintMismatch(previous, current) {
  if (previous === current) return null;
  const prev = typeof previous === "string" ? previous : "<absent>";
  const cur = typeof current === "string" ? current : "<absent>";
  return `fingerprint drift: previous=${prev.slice(0, 12)}… current=${cur.slice(0, 12)}…`;
}
