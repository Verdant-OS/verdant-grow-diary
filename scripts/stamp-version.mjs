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

const GENERATED_STAMP_OUTPUTS = ["public/version.json", "src/generated/buildInfo.ts"];

/** Vercel sets VERCEL=1 and/or VERCEL_ENV on every build/preview. */
function isVercelBuildEnvironment(env = process.env) {
  return env.VERCEL === "1" || Boolean(env.VERCEL_ENV && String(env.VERCEL_ENV).trim());
}

/**
 * Detached/headless publishers can legitimately build the exact commit that
 * origin/HEAD names. Surface that canonical branch only when both the local
 * checkout and selected stamp SHA agree with origin's advertised default.
 * Otherwise preserve the raw ref: provenance must not paper over a checkout
 * whose source differs from the stamp identity.
 */
function canonicalOriginDefaultRef(rawRef, stampSha, currentGitSha) {
  if (rawRef !== "HEAD" && rawRef !== "__orphan__") return rawRef;
  if (stampSha === "unknown" || currentGitSha !== stampSha) return rawRef;

  const originHeadSha = safe(() => run("git rev-parse refs/remotes/origin/HEAD").toString().trim());
  if (originHeadSha !== stampSha) return rawRef;

  const originHeadRef = safe(() =>
    run("git symbolic-ref --quiet --short refs/remotes/origin/HEAD").toString().trim(),
  );
  return originHeadRef.startsWith("origin/") && originHeadRef.length > "origin/".length
    ? originHeadRef.slice("origin/".length)
    : rawRef;
}

/**
 * Generated stamp outputs are build residue, not a source mutation. Exclude
 * only those two exact tracked paths by default. On Vercel, also exclude the
 * Build Output API tree under `.vercel/` — Nitro writes it mid-build and a
 * detached checkout would otherwise stamp dirty:true for publisher residue.
 * Untracked and changed source/config/Edge files must remain visible as dirty.
 *
 * Returns the exact `git status --porcelain` text after those excludes (may be
 * empty). Callers decide dirty from non-empty text; Vercel builds also print
 * the lines so the host log names the real paths when dirty:true.
 */
function collectMeaningfulPorcelain() {
  const excludes = [...GENERATED_STAMP_OUTPUTS];
  if (isVercelBuildEnvironment()) {
    excludes.push(".vercel", ".vercel/**");
  }
  const excludedOutputs = excludes.map((path) => `":(exclude)${path}"`).join(" ");
  return safe(
    () =>
      run(`git status --porcelain --untracked-files=all -- . ${excludedOutputs}`).toString().trim(),
    "",
  );
}

function hasMeaningfulWorktreeChanges() {
  return collectMeaningfulPorcelain() !== "";
}

/**
 * Prefer CI / platform refs over a detached-HEAD abbrev. Never invent a ref:
 * empty platform values fall through to the git-derived canonicalization.
 */
function resolveStampRef(rawRef, stampSha, currentGitSha, env = process.env) {
  const githubRef = typeof env.GITHUB_REF_NAME === "string" ? env.GITHUB_REF_NAME.trim() : "";
  if (githubRef) return githubRef;

  const vercelRef =
    typeof env.VERCEL_GIT_COMMIT_REF === "string" ? env.VERCEL_GIT_COMMIT_REF.trim() : "";
  if (vercelRef) return vercelRef;

  return canonicalOriginDefaultRef(rawRef, stampSha, currentGitSha);
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
const rawRef = safe(() => run("git rev-parse --abbrev-ref HEAD").toString().trim());
const ref = resolveStampRef(rawRef, sha, gitSha);
const commitTime = safe(() =>
  run(`git show -s --format=%cI ${sha === "unknown" ? "HEAD" : sha}`)
    .toString()
    .trim(),
);

// Dirty flag: meaningful unstaged/uncommitted changes at build time. Prior
// stamp outputs are ignored so a persistent publisher does not taint its next
// build solely by retaining them. Everything else remains surfaced. (In a
// history-less snapshot everything besides those outputs is "untracked", so
// dirty:true plus commitSource:"none" together read as "identity from
// treeHash".)
const meaningfulPorcelain = collectMeaningfulPorcelain();
const dirty = meaningfulPorcelain !== "";
if (dirty && isVercelBuildEnvironment()) {
  // Diagnostic only — never flip dirty:false. Next Preview log must name the
  // exact paths so excludes are not guessed.
  console.error(
    "stamp-version: Vercel worktree dirty — git status --porcelain (after stamp excludes):",
  );
  for (const line of meaningfulPorcelain.split(/\r?\n/)) {
    console.error(line);
  }
}

// Content identity that needs no git. Guarded: stamping must never fail
// a build over a hashing error — degrade to null instead.
let treeHash = null;
let treeHashShort = null;
let treeHashError = null;
try {
  const th = await computeTreeHash(process.cwd());
  treeHash = th.treeHash;
  treeHashShort = th.treeHashShort;
} catch (error) {
  // Degrade but never silently: an operator staring at a treeHash-less
  // stamp needs to know why the content identity disappeared. Message is
  // sanitized to printable chars and capped; no paths beyond what the
  // error itself carries, no env, no secrets.
  treeHashError = String(error?.message ?? error)
    .replace(/[^\x20-\x7e]/g, " ")
    .slice(0, 200);
  console.warn(`stamp-version: treeHash unavailable — ${treeHashError}`);
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
      // Shape AND explicit calendar validity. Date.parse is NOT sufficient:
      // V8 rolls day-overflow over (2026-02-31 parses as March 3, non-leap
      // 02-29 as March 1), so the day is checked via UTC round-trip and the
      // time/offset components via numeric ranges.
      const iso = (v) => {
        if (typeof v !== "string") return "unknown";
        const m = v.match(
          /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/,
        );
        if (!m) return "unknown";
        const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
        // Reject Date.UTC's legacy 0–99 → 1900s years before the round
        // trip; precise domain bounds are applied on the INSTANT below.
        if (y < 100) return "unknown";
        if (h > 23 || mi > 59 || s > 59) return "unknown";
        const off = m[7];
        if (off !== "Z") {
          const oh = Number(off.slice(1, 3));
          const om = Number(off.slice(4, 6));
          // Real-world UTC offsets end at exactly ±14:00 — nonzero minutes
          // at the ±14 boundary are out of range.
          if (oh > 14 || om > 59 || (oh === 14 && om > 0)) return "unknown";
        }
        const utc = new Date(Date.UTC(y, mo - 1, d));
        if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== mo - 1 || utc.getUTCDate() !== d) {
          return "unknown";
        }
        // Domain bound on the represented INSTANT (offset included): build
        // timestamps cannot predate the epoch nor reach the year 3000 —
        // textual-year bounds would wrongly admit e.g.
        // 1970-01-01T00:00:00+14:00, a pre-epoch instant.
        const instant = Date.parse(v);
        return instant >= 0 && instant < Date.UTC(3000, 0, 1) ? v : "unknown";
      };
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
  treeHashError,
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
  readonly treeHashError: string | null;
  readonly inherited: InheritedBuildInfo | null;
}

export const buildInfo: BuildInfo = ${JSON.stringify(record, null, 2)} as const;

export const APP_VERSION = buildInfo.version;
`;
writeFileSync(tsPath, tsBody);

console.log(`Stamped version ${version} → public/version.json, src/generated/buildInfo.ts`);
