#!/usr/bin/env node
/**
 * stamp-version.mjs
 *
 * Runs before every production build and stamps a single deterministic
 * version record derived from git + package.json + build-time inputs.
 * Writes to two locations so both server-side (build artifacts, CI
 * summary) and client-side (in-app diagnostics, /version.json probe)
 * consumers see the identical value:
 *
 *   1. public/version.json      — served verbatim as /version.json at
 *                                 runtime; safe for humans and uptime
 *                                 checks to pin against.
 *   2. src/generated/buildInfo.ts — typed export imported by any UI
 *                                 that shows "Version: X" (footer,
 *                                 About page, error boundaries).
 *
 * Version string format:
 *   <pkg.version>+<yyyymmdd>.<shortSha>[-dirty]     (git identity known)
 *   <pkg.version>+<yyyymmdd>.t<treeHashShort>       (git identity absent)
 * Examples: `0.0.0+20260722.c76e2cd37929`, `0.0.0+20260805.t8c1a3e0c53b9`
 *
 * Provenance resilience: the production publisher (Lovable) sometimes
 * builds from a history-less snapshot — a freshly `git init`-ed directory
 * with zero commits and no GITHUB_* env (observed 2026-08-05, when
 * production served `commit: "unknown"`). Identity therefore never relies
 * on git alone:
 *
 *   - `treeHash` (scripts/lib/tree-hash.mjs) is a deterministic SHA-256
 *     over the build-defining source roots, computable in any snapshot.
 *     CI records treeHash → commit in each release tag's annotation
 *     (auto-tag-release), and scripts/resolve-release-provenance.mjs maps
 *     a production treeHash back to the exact commit(s).
 *   - `commitSource` says where the commit identity came from
 *     ("github-env" | "git" | "none"). Nothing is ever fabricated: when
 *     git identity is unavailable, `commit` stays "unknown".
 *   - `inherited` carries the last stamp committed to the repo (the
 *     tracked public/version.json read before this run overwrites it),
 *     explicitly labeled untrusted — lineage context, not identity.
 *
 * This script must NEVER exit non-zero for provenance reasons: it runs in
 * `prebuild`, so a throw here fails every build. Degrade, don't die.
 *
 * No secrets, env dumps, or PII. Everything written here is safe to
 * ship in the client bundle.
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { computeTreeHash } from "./lib/tree-hash.mjs";

function safe(fn, fallback = "unknown") {
  try {
    const v = fn();
    return v == null || v === "" ? fallback : v;
  } catch {
    return fallback;
  }
}

/** execSync with stderr silenced: expected git failures in history-less
 * snapshots must not spray `fatal:` noise into every build log. */
function run(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] });
}

const pkg = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
const pkgVersion = String(pkg.version ?? "0.0.0");

// A set-but-empty (or malformed) GITHUB_SHA must count as absent: `??`
// alone lets "" through, which would stamp commit:"" with a lying
// commitSource and an identity-free version string.
const envShaRaw = process.env.GITHUB_SHA ?? "";
const envSha = /^[0-9a-f]{40}$/.test(envShaRaw) ? envShaRaw : undefined;
const gitSha = safe(() => run("git rev-parse HEAD").toString().trim());
const sha = envSha ?? gitSha;
const shortSha = sha === "unknown" ? "unknown" : sha.slice(0, 12);
const commitSource = envSha ? "github-env" : gitSha !== "unknown" ? "git" : "none";
const ref =
  process.env.GITHUB_REF_NAME ??
  safe(() => run("git rev-parse --abbrev-ref HEAD").toString().trim());
const commitTime = safe(() =>
  run(`git show -s --format=%cI ${sha === "unknown" ? "HEAD" : sha}`)
    .toString()
    .trim(),
);

// Dirty flag: unstaged/uncommitted changes at build time. Never
// suppress — a dirty CI build is always a bug worth surfacing. (In a
// history-less snapshot everything is "untracked", so dirty:true plus
// commitSource:"none" together read as "identity from treeHash".)
const dirty = safe(() => run("git status --porcelain").toString().trim(), "") !== "";

// Content identity that needs no git. Guarded: stamping must never fail
// a build over a hashing error — degrade to null instead.
let treeHash = null;
let treeHashShort = null;
try {
  const th = await computeTreeHash(process.cwd());
  treeHash = th.treeHash;
  treeHashShort = th.treeHashShort;
} catch {
  // leave null; commit/env identity may still be present
}

// Lineage context for history-less builds: the stamp that was committed
// to the repo before this run overwrites it. Explicitly untrusted — it
// describes an earlier build, possibly of different content.
const publicPath = resolve("public/version.json");
let inherited = null;
if (commitSource === "none") {
  try {
    const prior = JSON.parse(readFileSync(publicPath, "utf8"));
    if (typeof prior?.commit === "string" && /^[0-9a-f]{40}$/.test(prior.commit)) {
      // Sanitize every carried field: the tracked stamp is attacker-
      // influenceable content shipping into the client bundle. Formats are
      // enforced, free-text is length-capped and stripped of control chars.
      const iso = (v) =>
        typeof v === "string" && /^\d{4}-\d{2}-\d{2}T[0-9:.]+(Z|[+-]\d{2}:\d{2})$/.test(v)
          ? v
          : "unknown";
      const refText =
        typeof prior.ref === "string"
          ? prior.ref.replace(/[^\x20-\x7e]/g, "").slice(0, 120) || "unknown"
          : "unknown";
      inherited = {
        source: "tracked-stamp",
        trusted: false,
        commit: prior.commit,
        shortCommit: prior.commit.slice(0, 12),
        ref: refText,
        commitTime: iso(prior.commitTime),
        buildTime: iso(prior.buildTime),
      };
    }
  } catch {
    // no tracked stamp available — inherited stays null
  }
}

const buildTime = new Date().toISOString();
const yyyymmdd = buildTime.slice(0, 10).replace(/-/g, "");
const tag = process.env.GITHUB_REF_TYPE === "tag" ? process.env.GITHUB_REF_NAME : null;

const identity =
  shortSha !== "unknown"
    ? `${shortSha}${dirty ? "-dirty" : ""}`
    : treeHashShort
      ? `t${treeHashShort}`
      : "unknown";
const version = `${pkgVersion}+${yyyymmdd}.${identity}`;

const record = {
  version,
  packageVersion: pkgVersion,
  commit: sha,
  shortCommit: shortSha,
  ref,
  tag,
  commitTime,
  buildTime,
  dirty,
  ciRunId: process.env.GITHUB_RUN_ID ?? null,
  ciRunUrl:
    process.env.GITHUB_RUN_ID && process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
  commitSource,
  treeHash,
  treeHashShort,
  inherited,
};

// 1. public/version.json — served at /version.json
mkdirSync(dirname(publicPath), { recursive: true });
writeFileSync(publicPath, JSON.stringify(record, null, 2) + "\n");

// 2. src/generated/buildInfo.ts — typed import for UI diagnostics
const tsPath = resolve("src/generated/buildInfo.ts");
mkdirSync(dirname(tsPath), { recursive: true });
const tsBody = `// AUTO-GENERATED by scripts/stamp-version.mjs — do not edit by hand.
// Regenerated on every \`bun run build\` (via the \`prebuild\` script).
// Safe to import from client code; contains no secrets.

export interface InheritedBuildInfo {
  readonly source: "tracked-stamp";
  readonly trusted: false;
  readonly commit: string;
  readonly shortCommit: string;
  readonly ref: string;
  readonly commitTime: string;
  readonly buildTime: string;
}

export interface BuildInfo {
  readonly version: string;
  readonly packageVersion: string;
  readonly commit: string;
  readonly shortCommit: string;
  readonly ref: string;
  readonly tag: string | null;
  readonly commitTime: string;
  readonly buildTime: string;
  readonly dirty: boolean;
  readonly ciRunId: string | null;
  readonly ciRunUrl: string | null;
  readonly commitSource: "github-env" | "git" | "none";
  readonly treeHash: string | null;
  readonly treeHashShort: string | null;
  readonly inherited: InheritedBuildInfo | null;
}

export const buildInfo: BuildInfo = ${JSON.stringify(record, null, 2)} as const;

export const APP_VERSION = buildInfo.version;
`;
writeFileSync(tsPath, tsBody);

console.log(`Stamped version ${version} → public/version.json, src/generated/buildInfo.ts`);
