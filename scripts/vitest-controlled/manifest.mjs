// Deterministic test manifest for Verdant's Vitest include contract:
//   src/**/*.{test,spec}.{ts,tsx}
//
// Pure helpers only. No process side effects at import time.
// Produces normalized POSIX-style repo-relative paths, sorted
// lexicographically, deduplicated, plus a stable content-independent
// hash of the manifest (paths only — no file contents).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export const MANIFEST_SCHEMA_VERSION = 1;
export const INCLUDE_ROOT = "src";
const TEST_SUFFIX_RE = /\.(test|spec)\.(ts|tsx)$/i;

/** Normalize any absolute or mixed-separator path to POSIX repo-relative. */
export function normalizeRelative(repoRoot, filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(repoRoot, filePath);
  const rel = path.relative(repoRoot, abs);
  if (!rel || rel.startsWith("..")) {
    throw new Error(`Path escapes repo root: ${filePath}`);
  }
  return rel.split(path.sep).join("/");
}

/** Recursively walk INCLUDE_ROOT, returning normalized matches. */
export function discoverTestFiles(repoRoot, { fs: fsImpl = fs } = {}) {
  const root = path.resolve(repoRoot, INCLUDE_ROOT);
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fsImpl.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (err && err.code === "ENOENT") continue;
      throw err;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        stack.push(full);
      } else if (entry.isFile() && TEST_SUFFIX_RE.test(entry.name)) {
        out.push(normalizeRelative(repoRoot, full));
      }
    }
  }
  return dedupeAndSort(out);
}

/** Reject duplicates and sort lexicographically. */
export function dedupeAndSort(paths) {
  const seen = new Set();
  const dupes = [];
  for (const p of paths) {
    if (seen.has(p)) dupes.push(p);
    seen.add(p);
  }
  if (dupes.length) {
    throw new Error(`Duplicate manifest paths: ${dupes.join(", ")}`);
  }
  return [...seen].sort();
}

/** Deterministic hash over the sorted file list (paths only). */
export function hashManifest(paths) {
  const h = crypto.createHash("sha256");
  h.update(`v${MANIFEST_SCHEMA_VERSION}\n`);
  for (const p of paths) h.update(`${p}\n`);
  return h.digest("hex");
}

/** Build a canonical manifest record. */
export function buildManifest(repoRoot, opts = {}) {
  const files = opts.files ?? discoverTestFiles(repoRoot, opts);
  const sorted = dedupeAndSort(files.map((f) => normalizeRelative(repoRoot, f)));
  return {
    schema: MANIFEST_SCHEMA_VERSION,
    include: `${INCLUDE_ROOT}/**/*.{test,spec}.{ts,tsx}`,
    count: sorted.length,
    hash: hashManifest(sorted),
    files: sorted,
  };
}

/** Validate that every entry matches the include pattern. */
export function assertManifestIncludeParity(manifest) {
  for (const f of manifest.files) {
    if (!f.startsWith(`${INCLUDE_ROOT}/`)) {
      throw new Error(`Manifest entry outside include root: ${f}`);
    }
    if (!TEST_SUFFIX_RE.test(f)) {
      throw new Error(`Manifest entry does not match include suffix: ${f}`);
    }
  }
  return true;
}
