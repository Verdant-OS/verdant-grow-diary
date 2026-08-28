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
 * Does not teach stamp-version to ignore this file. Does not authorize live
 * checkout — client sandbox gate is unchanged.
 *
 * Fail closed when HEAD has no `.env.production`, or when git is unavailable.
 * Never invents a file. Stdout reports token CLASS only (never token bytes).
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
    const errText = Buffer.isBuffer(shown.stderr) ? shown.stderr.toString("utf8") : "";
    if (
      /does not exist|exists on disk|pathspec|fatal: path ['"]/iu.test(errText) ||
      shown.status === 128
    ) {
      return { ok: false, reason: "head_env_production_missing" };
    }
    return { ok: false, reason: "git_unavailable" };
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
    console.error(`[restore-env-production] ${result.reason}`);
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
