#!/usr/bin/env node
/**
 * check-bun-lockfile-policy — enforce Bun text-lockfile discipline and
 * exact pinning for security-critical packages.
 *
 * Assertions:
 *  - bun.lock exists (text lockfile).
 *  - bun.lockb does NOT exist.
 *  - package-lock.json, yarn.lock, pnpm-lock.yaml do NOT exist.
 *  - @lovable.dev/mcp-js exists in package.json.
 *  - @lovable.dev/mcp-js is pinned to an exact semver (no ^ / ~ / * / latest).
 *  - bun.lock resolves @lovable.dev/mcp-js to the same version.
 *
 * Safety posture:
 *  - Read-only. Never modifies package.json or lockfiles.
 *  - Exit 0 on pass, 1 on policy failure, 2 on tooling error.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CRITICAL_PACKAGE = "@lovable.dev/mcp-js";
const FORBIDDEN_LOCKFILES = ["bun.lockb", "package-lock.json", "yarn.lock", "pnpm-lock.yaml"];

/**
 * Return true iff `spec` is an exact semver (e.g. "1.2.3", "1.2.3-rc.1").
 * Disallows: ^, ~, *, latest, workspace:, file:, git+, http(s):, tags.
 */
export function isExactSemver(spec) {
  if (typeof spec !== "string") return false;
  const s = spec.trim();
  if (s === "" || s === "*" || s.toLowerCase() === "latest") return false;
  if (/[\^~><=|\s]/.test(s)) return false;
  if (/^(workspace|file|link|git\+|https?):/i.test(s)) return false;
  // Basic semver: MAJOR.MINOR.PATCH with optional -prerelease and +build
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(s);
}

/** Extract the resolved version of a package from a bun.lock text body. */
export function resolvedVersionInBunLock(lockText, pkgName) {
  if (typeof lockText !== "string") return null;
  // Text bun.lock stores resolutions as e.g.
  //   "@lovable.dev/mcp-js": ["@lovable.dev/mcp-js@0.20.0", "...
  const re = new RegExp(
    `"${pkgName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}":\\s*\\["${pkgName.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}@(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)`,
    "g",
  );
  const versions = new Set();
  let m;
  while ((m = re.exec(lockText)) !== null) versions.add(m[1]);
  if (versions.size === 0) return null;
  // If multiple versions are pinned via transitive resolution, return all.
  return [...versions];
}

export function evaluatePolicy({ cwd, readFile = readFileSync, exists = existsSync } = {}) {
  const root = cwd ?? process.cwd();
  const errors = [];

  const bunLockPath = resolve(root, "bun.lock");
  if (!exists(bunLockPath)) {
    errors.push("bun.lock (text lockfile) is missing — run `bun install --save-text-lockfile`.");
  }

  for (const forbidden of FORBIDDEN_LOCKFILES) {
    const p = resolve(root, forbidden);
    if (exists(p)) {
      errors.push(
        `Forbidden lockfile present: ${forbidden}. This repo standardizes on text bun.lock only.`,
      );
    }
  }

  let pkgJson;
  try {
    pkgJson = JSON.parse(readFile(resolve(root, "package.json"), "utf8"));
  } catch (e) {
    return { ok: false, errors: [`Failed to read package.json: ${String(e?.message ?? e)}`] };
  }

  const declared =
    pkgJson.dependencies?.[CRITICAL_PACKAGE] ??
    pkgJson.devDependencies?.[CRITICAL_PACKAGE] ??
    null;
  if (!declared) {
    errors.push(`${CRITICAL_PACKAGE} is not present in package.json dependencies.`);
  } else if (!isExactSemver(declared)) {
    errors.push(
      `${CRITICAL_PACKAGE} must be pinned to an exact semver (got "${declared}"). ` +
        `Remove any ^ / ~ / * / "latest" prefix and set an exact version like "0.20.0".`,
    );
  } else if (exists(bunLockPath)) {
    let lockText = "";
    try {
      lockText = readFile(bunLockPath, "utf8");
    } catch (e) {
      errors.push(`Failed to read bun.lock: ${String(e?.message ?? e)}`);
    }
    const resolved = resolvedVersionInBunLock(lockText, CRITICAL_PACKAGE);
    if (!resolved || resolved.length === 0) {
      errors.push(`bun.lock does not contain a resolved entry for ${CRITICAL_PACKAGE}.`);
    } else if (!resolved.includes(declared)) {
      errors.push(
        `bun.lock resolves ${CRITICAL_PACKAGE} to ${resolved.join(", ")} ` +
          `but package.json pins ${declared}. Reinstall to sync the lockfile.`,
      );
    }
  }

  return { ok: errors.length === 0, errors };
}

function main() {
  const { ok, errors } = evaluatePolicy();
  if (ok) {
    process.stdout.write("check-bun-lockfile-policy: OK\n");
    process.exit(0);
  }
  process.stderr.write("check-bun-lockfile-policy: FAIL\n");
  for (const e of errors) process.stderr.write(`  - ${e}\n`);
  process.exit(1);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
