#!/usr/bin/env node
/**
 * tree-hash.mjs — deterministic app-content identity that needs no git.
 *
 * Production publishes through Lovable, whose build sandbox sometimes has no
 * usable git context (observed 2026-08-05: an unborn-HEAD `git init` snapshot
 * produced a `commit: "unknown"` release stamp). Any identity that survives
 * such a build must be derivable from file content alone. This module hashes
 * a fixed allowlist of build-defining roots into a single SHA-256 so that:
 *
 *   - the stamper (scripts/stamp-version.mjs) can always embed `treeHash`,
 *     with or without git;
 *   - CI (auto-tag-release) computes the same hash from a real checkout and
 *     records the treeHash → commit mapping in the release tag annotation;
 *   - scripts/resolve-release-provenance.mjs maps a production treeHash back
 *     to the commit(s) carrying identical app content.
 *
 * Properties:
 *   - Deterministic across OSes: every file is CRLF→LF normalized (on raw
 *     bytes) before hashing, so Windows checkouts hash identically to Linux
 *     checkouts of the same content.
 *   - Test-only / docs-only changes outside the roots do not move the hash,
 *     so one hash may map to several commits with identical app content;
 *     the resolver reports every match rather than guessing.
 *   - The generated stamp files are excluded, so stamping never perturbs
 *     the identity it reports.
 *
 * No secrets, no env reads, no network. Node builtins only. Reads are
 * async with bounded concurrency purely for speed; the resulting hash is
 * order-independent because the manifest is sorted before hashing.
 */
import { createHash } from "node:crypto";
import { promises as fsp } from "node:fs";
import { readdirSync, lstatSync, existsSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/** Build-defining roots, relative to the repo root. Order irrelevant. */
export const TREE_HASH_ROOTS = [
  "src",
  "public",
  "supabase",
  "scripts",
  "config",
  "index.html",
  "package.json",
  "bun.lock",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "tailwind.config.ts",
  "postcss.config.js",
  "components.json",
  "eslint.config.js",
];

/**
 * Paths (relative, forward-slash) excluded even inside the roots:
 * the generated stamps must not feed the identity they report, and
 * transient noise must not move it.
 */
export const TREE_HASH_EXCLUDES = new Set(["public/version.json", "src/generated/buildInfo.ts"]);

const EXCLUDED_BASENAMES = new Set([".DS_Store", "Thumbs.db"]);
const EXCLUDED_SUFFIXES = [".log"];
/** Transient tool state that may appear inside the roots on dev machines. */
const EXCLUDED_PREFIXES = ["supabase/.temp/", "supabase/.branches/", "src/generated/"];

function excluded(relPath, baseName) {
  if (TREE_HASH_EXCLUDES.has(relPath)) return true;
  if (EXCLUDED_BASENAMES.has(baseName)) return true;
  if (EXCLUDED_PREFIXES.some((p) => relPath.startsWith(p))) return true;
  return EXCLUDED_SUFFIXES.some((s) => baseName.endsWith(s));
}

function* walk(rootAbs, rootRel) {
  // lstat: a root that is itself a symlink/junction must be skipped, or the
  // hash would silently cover content outside the repository and become
  // environment-dependent.
  const st = lstatSync(rootAbs);
  if (st.isSymbolicLink()) return;
  if (st.isFile()) {
    yield { abs: rootAbs, rel: rootRel };
    return;
  }
  if (!st.isDirectory()) return;
  for (const entry of readdirSync(rootAbs, { withFileTypes: true })) {
    const abs = join(rootAbs, entry.name);
    const rel = `${rootRel}/${entry.name}`;
    if (entry.isDirectory()) {
      yield* walk(abs, rel);
    } else if (entry.isFile()) {
      yield { abs, rel };
    }
    // symlinks and other specials are ignored: none are expected inside the
    // roots, and following links would make the hash environment-dependent.
  }
}

/**
 * CRLF→LF on raw bytes. Identical input bytes always produce identical
 * output bytes, which is all determinism requires — and text files checked
 * out with CRLF on Windows normalize to their LF (Linux) representation.
 */
export function normalizeCrlf(buf) {
  if (!buf.includes(0x0d)) return buf;
  const out = Buffer.allocUnsafe(buf.length);
  let w = 0;
  for (let r = 0; r < buf.length; r += 1) {
    if (buf[r] === 0x0d && r + 1 < buf.length && buf[r + 1] === 0x0a) continue;
    out[w] = buf[r];
    w += 1;
  }
  return out.subarray(0, w);
}

const READ_CONCURRENCY = 32;

/**
 * Compute the tree hash for a repo root.
 * Returns { treeHash, treeHashShort, fileCount, manifest } where manifest is
 * the exact hashed line list (for tests and debugging).
 */
export async function computeTreeHash(repoRoot = process.cwd()) {
  const root = resolve(repoRoot);
  const files = [];
  for (const entry of TREE_HASH_ROOTS) {
    const abs = resolve(root, entry);
    if (!existsSync(abs)) continue; // partial exports still hash deterministically
    const rel = entry.replaceAll(sep, "/");
    for (const f of walk(abs, rel)) {
      const baseName = f.rel.split("/").at(-1) ?? "";
      if (excluded(f.rel, baseName)) continue;
      files.push(f);
    }
  }
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const digests = new Array(files.length);
  let next = 0;
  async function worker() {
    while (next < files.length) {
      const i = next;
      next += 1;
      const buf = await fsp.readFile(files[i].abs);
      digests[i] = createHash("sha256").update(normalizeCrlf(buf)).digest("hex");
    }
  }
  await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, files.length) }, worker));

  const manifest = files.map((f, i) => `${digests[i]}  ${f.rel}`);
  const treeHash = createHash("sha256")
    .update(manifest.join("\n") + "\n", "utf8")
    .digest("hex");
  return { treeHash, treeHashShort: treeHash.slice(0, 12), fileCount: files.length, manifest };
}

async function main() {
  const args = process.argv.slice(2);
  const rootArg = args.find((a) => a.startsWith("--root="));
  const root = rootArg ? rootArg.slice(7) : process.cwd();
  const { treeHash, treeHashShort, fileCount } = await computeTreeHash(root);
  if (args.includes("--json")) {
    console.log(JSON.stringify({ treeHash, treeHashShort, fileCount }));
  } else {
    console.log(treeHash);
  }
}

if (
  process.argv[1] &&
  process.argv[1].replaceAll("\\", "/").endsWith("scripts/lib/tree-hash.mjs")
) {
  await main();
}
