#!/usr/bin/env node
/**
 * Ask npm itself to validate package.json/package-lock.json semantics in an
 * isolated temporary directory.
 *
 * `npm ci --dry-run --ignore-scripts` catches range/root-resolution drift that
 * static lock inspection cannot fully model. Only the two manifest files are
 * copied; the repository's node_modules and lockfiles are never mutated.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");

export function npmCiDryRunInvocation(platform = process.platform, environment = process.env) {
  const commandText = "npm ci --dry-run --ignore-scripts --no-audit --no-fund --cache .npm-cache";
  if (platform === "win32") {
    return {
      command: environment.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", commandText],
    };
  }
  return {
    command: "npm",
    args: [
      "ci",
      "--dry-run",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--cache",
      ".npm-cache",
    ],
  };
}

export function runNpmLockSemanticCheck({
  repoRoot = REPO_ROOT,
  platform = process.platform,
  environment = process.env,
  spawn = spawnSync,
} = {}) {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "verdant-npm-lock-semantic-"));
  try {
    const sourceManifest = resolve(repoRoot, "package.json");
    const sourceLock = resolve(repoRoot, "package-lock.json");
    const temporaryManifest = resolve(temporaryRoot, "package.json");
    const temporaryLock = resolve(temporaryRoot, "package-lock.json");
    copyFileSync(sourceManifest, temporaryManifest);
    copyFileSync(sourceLock, temporaryLock);
    const lockBefore = readFileSync(temporaryLock, "utf8");
    const invocation = npmCiDryRunInvocation(platform, environment);
    const result = spawn(invocation.command, invocation.args, {
      cwd: temporaryRoot,
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...environment,
        npm_config_ignore_scripts: "true",
      },
    });
    if (result.error) {
      throw new Error(`Unable to run isolated npm ci dry-run: ${result.error.message}`);
    }
    if (result.status !== 0) {
      return {
        ok: false,
        error:
          `isolated npm ci dry-run exited ${result.status ?? "unknown"}; ` +
          "package.json/package-lock.json are not semantically synchronized",
      };
    }
    if (readFileSync(temporaryLock, "utf8") !== lockBefore) {
      return {
        ok: false,
        error: "isolated npm ci dry-run unexpectedly rewrote package-lock.json",
      };
    }
    return { ok: true, error: null };
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function main() {
  try {
    const result = runNpmLockSemanticCheck();
    if (!result.ok) {
      process.stderr.write(`check-npm-lock-semantic: FAIL: ${result.error}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      "check-npm-lock-semantic: OK (isolated npm ci --dry-run --ignore-scripts)\n",
    );
  } catch (error) {
    process.stderr.write(
      `check-npm-lock-semantic: TOOLING ERROR: ${String(error?.message ?? error)}\n`,
    );
    process.exitCode = 2;
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
