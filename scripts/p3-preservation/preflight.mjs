#!/usr/bin/env node
/**
 * preflight - fail-fast checks that must all pass BEFORE the P.3 preservation
 * mutation (copy -> stage -> commit -> push) runs. Pure check functions take an
 * injectable `env` (git / fs / network access) so every branch is unit-testable
 * without touching a real remote; `createDefaultEnv()` supplies the real ones.
 *
 * Checks (per the design):
 *   GIT_AVAILABLE       git is on PATH
 *   GH_AUTH             gh authenticated - ADVISORY by default (the push uses the
 *                       git credential manager; gh is only required to open a PR,
 *                       so this is `error` only when { requireGh: true })
 *   REPO_IDENTITY       destination origin points at the expected repo
 *   SOURCE_WORKTREE     frozen source exists and every contract file matches it
 *                       by raw size + SHA-256 (verify the source BEFORE copying)
 *   CLEAN_DESTINATION   destination working tree is clean (nothing to sweep in)
 *   BRANCH_AVAILABILITY target branch does not already exist locally or on origin
 *   BASE_REMOTE_SHA     base branch exists on origin; its SHA is surfaced for the
 *                       orchestrator's pre-push TOCTOU recheck (and matched if an
 *                       expectedBaseSha is supplied)
 *
 * Usage:
 *   node scripts/p3-preservation/preflight.mjs --dest <repo> --source <worktree>
 *        [--require-gh] [--expected-base-sha <sha>] [--repo-slug <owner/repo>]
 * Exit 0 = all error-severity checks passed (warnings allowed); exit 1 = blocked.
 */
import { statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { P3_CONTRACT, assertContractIntegrity } from "./contract.mjs";
import { sha256, defaultReadWorkingBytes } from "./verify-staged-bytes.mjs";

export const CHECK = Object.freeze({
  GIT_AVAILABLE: "GIT_AVAILABLE",
  GH_AUTH: "GH_AUTH",
  REPO_IDENTITY: "REPO_IDENTITY",
  SOURCE_WORKTREE: "SOURCE_WORKTREE",
  CLEAN_DESTINATION: "CLEAN_DESTINATION",
  BRANCH_AVAILABILITY: "BRANCH_AVAILABILITY",
  BASE_REMOTE_SHA: "BASE_REMOTE_SHA",
});

const DEFAULT_REPO_SLUG = "verdant-os/verdant-grow-diary";

/** Extract a lowercase `owner/repo` slug from an https or ssh git URL, or null. */
export function repoSlugFromUrl(url) {
  if (typeof url !== "string") return null;
  const m = url.trim().match(/[/:]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/);
  return m ? `${m[1]}/${m[2]}`.toLowerCase() : null;
}

// ---- individual checks (pure; take injected env) ---------------------------

export function checkGitAvailable(env) {
  const r = env.gitVersion();
  return {
    id: CHECK.GIT_AVAILABLE,
    ok: Boolean(r && r.ok),
    severity: "error",
    detail: r && r.ok ? r.version : "git not found on PATH",
  };
}

export function checkGhAuth(env, { requireGh = false } = {}) {
  const r = env.ghAuthStatus();
  const ok = Boolean(r && r.present && r.authed);
  let detail;
  if (ok) detail = "gh authenticated";
  else if (!r || !r.present)
    detail = "gh not installed (push uses the git credential manager; gh only needed to open a PR)";
  else detail = "gh not authenticated (run `gh auth login`; only required to open a PR)";
  return { id: CHECK.GH_AUTH, ok, severity: requireGh ? "error" : "warn", detail };
}

export function checkRepoIdentity(env, { destRepo, expectedRepoSlug = DEFAULT_REPO_SLUG }) {
  const url = env.originUrl(destRepo);
  const slug = repoSlugFromUrl(url);
  const ok = slug === expectedRepoSlug.toLowerCase();
  return {
    id: CHECK.REPO_IDENTITY,
    ok,
    severity: "error",
    detail: ok ? `origin = ${slug}` : `origin ${slug ?? "(none)"} != expected ${expectedRepoSlug}`,
  };
}

export function checkSourceWorktree(env, { sourceWorktree, contract }) {
  if (!env.pathIsDir(sourceWorktree)) {
    return {
      id: CHECK.SOURCE_WORKTREE,
      ok: false,
      severity: "error",
      detail: `source worktree not found: ${sourceWorktree}`,
    };
  }
  const problems = [];
  for (const file of contract.files) {
    const bytes = env.readWorkingBytes(sourceWorktree, file.path);
    if (bytes == null) {
      problems.push(`${file.path}: missing in source`);
      continue;
    }
    if (bytes.length !== file.bytes) {
      problems.push(`${file.path}: size ${bytes.length} != ${file.bytes}`);
      continue;
    }
    const actual = sha256(bytes);
    if (actual !== file.sha256.toLowerCase()) {
      problems.push(`${file.path}: sha ${actual} != ${file.sha256}`);
    }
  }
  return {
    id: CHECK.SOURCE_WORKTREE,
    ok: problems.length === 0,
    severity: "error",
    detail: problems.length ? problems.join("; ") : "all source files match the contract",
  };
}

export function checkCleanDestination(env, { destRepo }) {
  const lines = env.porcelain(destRepo);
  const ok = lines.length === 0;
  return {
    id: CHECK.CLEAN_DESTINATION,
    ok,
    severity: "error",
    detail: ok
      ? "destination working tree is clean"
      : `destination not clean (${lines.length} entr${lines.length === 1 ? "y" : "ies"}): ${lines.slice(0, 5).join(", ")}`,
  };
}

export function checkBranchAvailability(env, { destRepo, targetBranch }) {
  const localExists = env.localBranchExists(destRepo, targetBranch);
  const remoteSha = env.remoteRef(destRepo, "origin", `refs/heads/${targetBranch}`);
  const problems = [];
  if (localExists) problems.push("exists locally");
  if (remoteSha) problems.push(`exists on origin (${remoteSha.slice(0, 12)})`);
  return {
    id: CHECK.BRANCH_AVAILABILITY,
    ok: problems.length === 0,
    severity: "error",
    detail: problems.length
      ? `target branch ${targetBranch} ${problems.join(" and ")}`
      : `target branch ${targetBranch} is available`,
  };
}

export function checkBaseRemoteSha(env, { destRepo, baseBranch, expectedBaseSha = null }) {
  const sha = env.remoteRef(destRepo, "origin", `refs/heads/${baseBranch}`);
  if (!sha) {
    return {
      id: CHECK.BASE_REMOTE_SHA,
      ok: false,
      severity: "error",
      sha: null,
      detail: `base branch ${baseBranch} not found on origin`,
    };
  }
  if (expectedBaseSha && sha !== expectedBaseSha) {
    return {
      id: CHECK.BASE_REMOTE_SHA,
      ok: false,
      severity: "error",
      sha,
      detail: `base ${baseBranch} moved: origin ${sha.slice(0, 12)} != expected ${expectedBaseSha.slice(0, 12)}`,
    };
  }
  return {
    id: CHECK.BASE_REMOTE_SHA,
    ok: true,
    severity: "error",
    sha,
    detail: `base ${baseBranch} @ ${sha.slice(0, 12)}`,
  };
}

// ---- aggregate -------------------------------------------------------------

export function runPreflight({
  destRepo,
  sourceWorktree,
  contract = P3_CONTRACT,
  expectedRepoSlug = DEFAULT_REPO_SLUG,
  expectedBaseSha = null,
  requireGh = false,
  env = createDefaultEnv(),
}) {
  assertContractIntegrity(contract);
  const baseCheck = checkBaseRemoteSha(env, {
    destRepo,
    baseBranch: contract.baseBranch,
    expectedBaseSha,
  });
  const checks = [
    checkGitAvailable(env),
    checkGhAuth(env, { requireGh }),
    checkRepoIdentity(env, { destRepo, expectedRepoSlug }),
    checkSourceWorktree(env, { sourceWorktree, contract }),
    checkCleanDestination(env, { destRepo }),
    checkBranchAvailability(env, { destRepo, targetBranch: contract.targetBranch }),
    baseCheck,
  ];
  const errors = checks.filter((c) => !c.ok && c.severity === "error");
  const warnings = checks.filter((c) => !c.ok && c.severity === "warn");
  return { ok: errors.length === 0, baseSha: baseCheck.sha ?? null, errors, warnings, checks };
}

export function formatPreflight(result) {
  const lines = result.checks.map((c) => {
    const tag = c.ok ? "OK  " : c.severity === "warn" ? "WARN" : "FAIL";
    return `  ${tag}  ${c.id}: ${c.detail}`;
  });
  lines.push(result.ok ? "preflight: PASS" : "preflight: BLOCKED");
  return lines.join("\n");
}

// ---- default env (real git / fs / network) ---------------------------------

export function createDefaultEnv() {
  const run = (args, opts = {}) => spawnSync(args[0], args.slice(1), { encoding: "utf8", ...opts });
  return {
    gitVersion() {
      const r = run(["git", "--version"]);
      return { ok: !r.error && r.status === 0, version: (r.stdout || "").trim() };
    },
    ghAuthStatus() {
      const r = run(["gh", "auth", "status"]);
      if (r.error) return { present: false, authed: false }; // ENOENT etc.
      return { present: true, authed: r.status === 0 };
    },
    originUrl(repo) {
      const r = run(["git", "-C", repo, "config", "--get", "remote.origin.url"]);
      return r.status === 0 ? (r.stdout || "").trim() : null;
    },
    pathIsDir(p) {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    },
    readWorkingBytes: defaultReadWorkingBytes,
    porcelain(repo) {
      const r = run(["git", "-C", repo, "status", "--porcelain"]);
      return (r.stdout || "")
        .split("\n")
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0);
    },
    localBranchExists(repo, name) {
      const r = run(["git", "-C", repo, "show-ref", "--verify", "--quiet", `refs/heads/${name}`]);
      return r.status === 0;
    },
    remoteRef(repo, remote, ref) {
      const r = run(["git", "-C", repo, "ls-remote", remote, ref]);
      if (r.status !== 0) return null;
      const line = (r.stdout || "").split("\n").find((l) => l.trim().length > 0);
      return line ? line.split("\t")[0].trim() : null;
    },
  };
}

// ---- CLI -------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    dest: process.cwd(),
    source: null,
    requireGh: false,
    expectedBaseSha: null,
    repoSlug: DEFAULT_REPO_SLUG,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dest") out.dest = argv[++i];
    else if (a === "--source") out.source = argv[++i];
    else if (a === "--require-gh") out.requireGh = true;
    else if (a === "--expected-base-sha") out.expectedBaseSha = argv[++i];
    else if (a === "--repo-slug") out.repoSlug = argv[++i];
  }
  return out;
}

function isMain() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source) {
    process.stderr.write("preflight: --source <frozen worktree> is required\n");
    process.exit(2);
  }
  const result = runPreflight({
    destRepo: args.dest,
    sourceWorktree: args.source,
    expectedRepoSlug: args.repoSlug,
    expectedBaseSha: args.expectedBaseSha,
    requireGh: args.requireGh,
  });
  process.stdout.write(formatPreflight(result) + "\n");
  process.exit(result.ok ? 0 : 1);
}
