#!/usr/bin/env node
/**
 * resolve-release-provenance.mjs — map a treeHash back to commit(s).
 *
 * Production builds published from history-less snapshots stamp
 * `commit: "unknown"` but always carry a `treeHash` (see
 * scripts/stamp-version.mjs). This resolver answers "which commit(s)
 * does that hash correspond to?" using two sources, in order:
 *
 *   1. Release tag annotations: auto-tag-release records
 *      `Tree-Hash: <hex>` in every tag it creates (fast path, no
 *      recomputation).
 *   2. Recomputation over recent deploy-branch commits: `git archive`
 *      each candidate into a scratch directory and recompute the hash
 *      with the same module the stamper uses.
 *
 * One treeHash may map to several commits: changes outside the hashed
 * roots (tests, docs, workflows) do not move it. Every match is
 * reported — identical app content is identical app content.
 *
 * Usage:
 *   node scripts/resolve-release-provenance.mjs --hash <64-hex> [--scan N] [--ref origin/verdant-grow-diary]
 *
 * Read-only; no network. Run it from a checkout with real history.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { computeTreeHash } from "./lib/tree-hash.mjs";

function git(args, opts = {}) {
  return execFileSync("git", args, { encoding: "utf8", ...opts }).trim();
}

function parseArgs(argv) {
  const args = { hash: null, scan: 30, ref: "origin/verdant-grow-diary" };
  for (const a of argv.slice(2)) {
    if (a.startsWith("--hash=")) args.hash = a.slice(7).toLowerCase();
    else if (a.startsWith("--scan=")) args.scan = Number(a.slice(7));
    else if (a.startsWith("--ref=")) args.ref = a.slice(6);
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function tagMatches(hash) {
  // NUL separates name from contents, SOH terminates each tag record —
  // splitting on message text (which may contain lines starting with "v",
  // Tree-Hash-like strings, etc.) is never safe.
  const out = git(["for-each-ref", "refs/tags/v*", "--format=%(refname:short)%00%(contents)%01"]);
  const matches = [];
  for (const block of out.split("\x01")) {
    const sep = block.indexOf("\x00");
    if (sep === -1) continue;
    const tag = block.slice(0, sep).trim();
    if (!tag) continue;
    const m = block.slice(sep + 1).match(/Tree-Hash:\s*([0-9a-f]{64})/);
    if (m && m[1] === hash) {
      try {
        matches.push({ tag, commit: git(["rev-list", "-n", "1", tag]) });
      } catch {
        // A tag we cannot resolve must not abort the remaining lookups.
      }
    }
  }
  return matches;
}

async function scanMatches(hash, ref, count) {
  const shas = git(["rev-list", "-n", String(count), ref])
    .split("\n")
    .filter(Boolean);
  const matches = [];
  for (const sha of shas) {
    const scratch = mkdtempSync(join(tmpdir(), "vgd-provenance-"));
    try {
      // Materialize the commit's tracked content exactly as committed,
      // git-natively (no shell, no tar — portable across Windows/Linux):
      // read the commit into an isolated index, then check that index out
      // under a scratch prefix. The real repo index is never touched.
      const env = { ...process.env, GIT_INDEX_FILE: join(scratch, ".provenance-index") };
      const extract = join(scratch, "extract");
      execFileSync("git", ["read-tree", sha], { env, stdio: ["ignore", "ignore", "pipe"] });
      execFileSync("git", ["checkout-index", "-a", `--prefix=${extract.replaceAll("\\", "/")}/`], {
        env,
        stdio: ["ignore", "ignore", "pipe"],
      });
      const { treeHash } = await computeTreeHash(resolve(extract));
      if (treeHash === hash) matches.push({ commit: sha });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  return matches;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.hash) {
    console.log(
      "Usage: node scripts/resolve-release-provenance.mjs --hash=<64-hex> [--scan=N] [--ref=origin/verdant-grow-diary]",
    );
    process.exitCode = args.help ? 0 : 2;
    return;
  }
  if (!/^[0-9a-f]{64}$/.test(args.hash)) {
    console.error("BLOCKED: --hash must be a 64-char lowercase hex SHA-256.");
    process.exitCode = 2;
    return;
  }

  const viaTags = tagMatches(args.hash);
  if (viaTags.length > 0) {
    console.log(`MATCH via release-tag annotation (${viaTags.length}):`);
    for (const m of viaTags) console.log(`  ${m.commit}  (${m.tag})`);
    return;
  }

  console.log(
    `No tag annotation carries this hash; recomputing over last ${args.scan} commits of ${args.ref}…`,
  );
  const viaScan = await scanMatches(args.hash, args.ref, args.scan);
  if (viaScan.length > 0) {
    console.log(`MATCH via recomputation (${viaScan.length}):`);
    for (const m of viaScan) console.log(`  ${m.commit}`);
  } else {
    console.log(
      "NO_MATCH: no scanned commit reproduces this treeHash. The build may predate the scan window, or its content never matched any commit (editor-modified snapshot, or a publish pipeline that mutates hashed files such as bun.lock before prebuild).",
    );
    console.log(
      "Canary: resolve a HEALTHY production stamp (commitSource git/github-env) against its own commit — if that also NO_MATCHes, the publish pipeline mutates hashed inputs and the hash roots need revisiting.",
    );
    process.exitCode = 1;
  }
}

await main();
