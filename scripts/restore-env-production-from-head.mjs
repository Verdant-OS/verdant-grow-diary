#!/usr/bin/env node
/**
 * restore-env-production-from-head.mjs
 *
 * Production prebuild step 1: restore the single tracked file `.env.production`
 * from `HEAD` before assert-paddle / stamp-version run.
 *
 * Why: Lovable Payments Live injects a `live_` `VITE_PAYMENTS_CLIENT_TOKEN` into
 * the tracked working-tree file at publish. `.env.production` is in
 * TREE_HASH_ROOTS, so stamp-version marks dirty. Restoring from HEAD makes the
 * inject a no-op for treeHash/dirty; Vite then bundles the committed class.
 *
 * Scope: ONLY `.env.production`. No other paths. Stamper stays fail-open.
 * Does not teach stamp-version to ignore this file. Does not by itself authorize
 * live checkout: whether a committed `live_` token may open checkout is decided
 * by the client host rule in src/lib/paddleEnvironment.ts (production
 * hostnames only).
 *
 * Fail closed when HEAD has no `.env.production`, when git is unavailable, or
 * when `git show` fails for any other reason (reported as head_git_show_failed
 * with git's exit status and sanitized stderr). Never invents a file. Stdout reports token CLASS only (never token bytes).
 */
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const ENV_PRODUCTION_REL_PATH = ".env.production";
export const TOKEN_NAME = "VITE_PAYMENTS_CLIENT_TOKEN";

const TOKEN_CLASS = Object.freeze({
  test_: "test_",
  live_: "live_",
  missing: "missing",
  malformed: "malformed",
});

const MAX_ENV_BYTES = 64 * 1024;

/**
 * Classify the payments client token in dotenv text. Returns a fixed class
 * label only — never the token bytes.
 *
 * @param {unknown} envText
 * @returns {"test_" | "live_" | "missing" | "malformed"}
 */
export function classifyPaymentsClientTokenClass(envText) {
  if (typeof envText !== "string") return TOKEN_CLASS.malformed;

  const assignments = envText
    .split(/\r?\n/u)
    .filter((line) => /^VITE_PAYMENTS_CLIENT_TOKEN\s*=/u.test(line));

  if (assignments.length === 0) return TOKEN_CLASS.missing;
  if (assignments.length !== 1) return TOKEN_CLASS.malformed;

  let token = assignments[0].slice(assignments[0].indexOf("=") + 1).trim();
  const first = token[0];
  if (first === '"' || first === "'") {
    if (token.length < 2 || token.at(-1) !== first) return TOKEN_CLASS.malformed;
    token = token.slice(1, -1);
  }
  if (token.length === 0) return TOKEN_CLASS.missing;
  if (/^test_[A-Za-z0-9_-]+$/u.test(token)) return TOKEN_CLASS.test_;
  if (/^live_[A-Za-z0-9_-]+$/u.test(token)) return TOKEN_CLASS.live_;
  return TOKEN_CLASS.malformed;
}

const MAX_GIT_STDERR_CHARS = 300;
const NO_GIT_STDERR = "(no stderr)";

// Only these git messages mean "the file is not in HEAD". Exit status 128 alone
// does not: git also uses it for "not a git repository", an unborn or missing
// HEAD, "dubious ownership" (safe.directory) and an unreachable directory.
const HEAD_PATH_MISSING_PATTERNS = Object.freeze([
  /fatal: path ['"][^'"]*['"] does not exist in ['"]?HEAD['"]?/iu,
  /fatal: path ['"][^'"]*['"] exists on disk, but not in ['"]?HEAD['"]?/iu,
  /pathspec ['"]\.env\.production['"] did not match/iu,
]);

/**
 * Make git's stderr safe to print in a build log: one line, length-capped, and
 * with any dotenv-style assignment value or payments token redacted. git writes
 * blob bytes to stdout, not stderr, so this is defense in depth.
 *
 * @param {unknown} stderr
 * @returns {string}
 */
export function sanitizeGitStderr(stderr) {
  let text = "";
  if (Buffer.isBuffer(stderr)) text = stderr.toString("utf8");
  else if (typeof stderr === "string") text = stderr;

  text = text
    .replace(
      /[A-Z][A-Z0-9_]{2,}\s*=\s*\S+/gu,
      (match) => `${match.split("=")[0].trim()}=[redacted]`,
    )
    .replace(/\b(?:live|test)_[A-Za-z0-9_-]+/gu, "[redacted]")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (text.length === 0) return NO_GIT_STDERR;
  if (text.length > MAX_GIT_STDERR_CHARS) {
    return `${text.slice(0, MAX_GIT_STDERR_CHARS)}…[truncated]`;
  }
  return text;
}

/**
 * Classify a non-zero `git show HEAD:.env.production` exit. A path git says is
 * absent from HEAD is `head_env_production_missing`; every other failure is
 * `head_git_show_failed` with git's exit status and sanitized stderr. Both fail
 * closed.
 *
 * @param {{ status: number | null, stderr: unknown }} failure
 * @returns {{ ok: false, reason: "head_env_production_missing" } |
 *   { ok: false, reason: "head_git_show_failed", gitStatus: number | null, gitStderr: string }}
 */
export function classifyGitShowFailure({ status, stderr }) {
  let raw = "";
  if (Buffer.isBuffer(stderr)) raw = stderr.toString("utf8");
  else if (typeof stderr === "string") raw = stderr;

  if (HEAD_PATH_MISSING_PATTERNS.some((pattern) => pattern.test(raw))) {
    return { ok: false, reason: "head_env_production_missing" };
  }
  return {
    ok: false,
    reason: "head_git_show_failed",
    gitStatus: typeof status === "number" ? status : null,
    gitStderr: sanitizeGitStderr(raw),
  };
}

/**
 * One log line for a failed restore. The reason token always comes first.
 *
 * @param {{ reason: string, gitStatus?: number | null, gitStderr?: string }} result
 * @returns {string}
 */
export function formatRestoreFailure(result) {
  if (result.reason === "head_git_show_failed") {
    const status = typeof result.gitStatus === "number" ? result.gitStatus : "unknown";
    const detail = result.gitStderr ?? NO_GIT_STDERR;
    return `[restore-env-production] ${result.reason} (git exit ${status}): ${detail}`;
  }
  return `[restore-env-production] ${result.reason}`;
}

/**
 * Read `HEAD:.env.production` via `git show`. Does not touch the index.
 * Safer for a single-path restore than a broad checkout: only this blob is read.
 *
 * @param {string} rootDir
 * @param {string} [relPath]
 * @returns {{ ok: true, content: string } | { ok: false, reason: string }}
 */
export function gitShowHeadEnvProduction(rootDir, relPath = ENV_PRODUCTION_REL_PATH) {
  if (typeof rootDir !== "string" || rootDir.length === 0) {
    return { ok: false, reason: "git_unavailable" };
  }
  if (relPath !== ENV_PRODUCTION_REL_PATH) {
    return { ok: false, reason: "unsupported_restore_path" };
  }

  const version = spawnSync("git", ["--version"], {
    cwd: rootDir,
    encoding: "utf8",
    env: process.env,
  });
  if (version.error || version.status !== 0) {
    return { ok: false, reason: "git_unavailable" };
  }

  const shown = spawnSync("git", ["-C", rootDir, "show", `HEAD:${relPath}`], {
    encoding: "buffer",
    maxBuffer: MAX_ENV_BYTES + 1024,
    env: process.env,
  });

  if (shown.error) {
    return { ok: false, reason: "git_unavailable" };
  }
  if (shown.status !== 0) {
    return classifyGitShowFailure({ status: shown.status, stderr: shown.stderr });
  }

  const bytes = shown.stdout;
  if (!Buffer.isBuffer(bytes)) {
    return { ok: false, reason: "git_unavailable" };
  }
  if (bytes.byteLength > MAX_ENV_BYTES) {
    return { ok: false, reason: "head_env_production_too_large" };
  }

  try {
    return { ok: true, content: new TextDecoder("utf-8", { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, reason: "head_env_production_malformed" };
  }
}

/**
 * Restore `.env.production` from HEAD into the working tree, then report class.
 *
 * @param {{
 *   rootDir?: string,
 *   gitShow?: typeof gitShowHeadEnvProduction,
 *   writeFile?: (absolutePath: string, content: string) => void,
 * }} [options]
 * @returns {{ ok: true, tokenClass: string } | { ok: false, reason: string }}
 */
export function restoreEnvProductionFromHead({
  rootDir = process.cwd(),
  gitShow = gitShowHeadEnvProduction,
  writeFile = (absolutePath, content) => {
    writeFileSync(absolutePath, content, "utf8");
  },
} = {}) {
  const shown = gitShow(rootDir, ENV_PRODUCTION_REL_PATH);
  if (!shown.ok) return shown;

  try {
    writeFile(resolve(rootDir, ENV_PRODUCTION_REL_PATH), shown.content);
  } catch {
    return { ok: false, reason: "env_production_write_failed" };
  }

  const tokenClass = classifyPaymentsClientTokenClass(shown.content);
  return { ok: true, tokenClass };
}

function main() {
  const result = restoreEnvProductionFromHead();
  if (!result.ok) {
    console.error(formatRestoreFailure(result));
    process.exitCode = 1;
    return;
  }
  console.log(
    `[restore-env-production] restored .env.production from HEAD; token class=${result.tokenClass}`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main();
}
