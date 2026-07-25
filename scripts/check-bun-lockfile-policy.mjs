#!/usr/bin/env node
/**
 * Enforce Verdant's transitional lockfile policy.
 *
 * Bun and bun.lock are canonical. package-lock.json remains a synchronized
 * compatibility lock only while the explicitly documented npm consumers in
 * config/dependency-lockfile-transition.json still exist.
 *
 * Safety posture:
 *  - Read-only. Never modifies package.json or either lockfile.
 *  - Fails closed on malformed policy files, stale locks, undeclared npm
 *    entrypoints, or an overdue transition review.
 *  - Exit 0 on pass, 1 on policy failure, 2 on tooling error.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CRITICAL_PACKAGE = "@lovable.dev/mcp-js";
const TRANSITION_CONFIG = "config/dependency-lockfile-transition.json";
const REQUIRED_LOCKFILES = Object.freeze(["bun.lock", "package-lock.json"]);
export const PACKAGE_LOCK_SECURITY_FLOORS = Object.freeze({
  vite: "6.4.3",
  postcss: "8.5.18",
  "brace-expansion": "1.1.16",
  "fast-uri": "3.1.4",
  "form-data": "4.0.6",
  "js-yaml": "4.3.0",
  ajv: "6.15.0",
  picomatch: "2.3.2",
  rollup: "4.59.0",
  vitest: "3.2.6",
});
export const FORBIDDEN_LOCKFILES = Object.freeze(["bun.lockb", "yarn.lock", "pnpm-lock.yaml"]);
const NPM_COMMAND = String.raw`npm(?:\.cmd|\.exe)?`;
const NPM_CONSUMER_PATTERN = new RegExp(
  String.raw`\b${NPM_COMMAND}\s+(?:ci\b|install\b(?!\s+(?:-g|--global)\b)|run\s+(?:build|dev)\b)`,
  "i",
);
const NPM_INSTALL_PATTERN = new RegExp(
  String.raw`\b${NPM_COMMAND}\s+(?:ci\b|install\b(?!\s+(?:-g|--global)\b))`,
  "i",
);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedRelative(root, absolutePath) {
  return relative(root, absolutePath).replaceAll("\\", "/");
}

function listPolicyFiles(root) {
  const result = spawnSync("git", ["-C", root, "ls-files", "-z"], {
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `git ls-files failed: ${result.error?.message ?? `exit ${result.status ?? "unknown"}`}`,
    );
  }
  // These policy implementation/fixture files necessarily contain npm command
  // literals. Keep the exclusion exact so other tracked scripts remain scanned.
  const excludedFiles = new Set([
    "bun.lock",
    "package-lock.json",
    "config/dependency-lockfile-transition.json",
    "scripts/check-bun-lockfile-policy.mjs",
    "scripts/check-npm-lock-semantic.mjs",
    "src/test/check-bun-lockfile-policy.test.ts",
  ]);
  const binaryExtensions = new Set([
    ".avif",
    ".bin",
    ".docx",
    ".gif",
    ".ico",
    ".jpeg",
    ".jpg",
    ".lockb",
    ".mp3",
    ".mp4",
    ".pdf",
    ".png",
    ".webm",
    ".webp",
    ".woff",
    ".woff2",
    ".xlsx",
    ".zip",
  ]);
  return result.stdout
    .split("\0")
    .filter(Boolean)
    .map((path) => path.replaceAll("\\", "/"))
    .filter((path) => {
      if (excludedFiles.has(path)) return false;
      const dotIndex = path.lastIndexOf(".");
      const extension = dotIndex >= 0 ? path.slice(dotIndex).toLowerCase() : "";
      return !binaryExtensions.has(extension);
    })
    .map((path) => resolve(root, path));
}

function parseJson(readFile, path, label) {
  try {
    return JSON.parse(readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`Failed to read ${label}: ${String(error?.message ?? error)}`);
  }
}

function requireNonEmptyString(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireIsoDate(value, label) {
  requireNonEmptyString(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} is not a valid calendar date.`);
  }
  return value;
}

function normalizeToday(value) {
  if (value === undefined) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("today must be a valid date.");
    return value.toISOString().slice(0, 10);
  }
  return requireIsoDate(value, "today");
}

function parseTransitionConfig(document) {
  if (!isObject(document) || document.schemaVersion !== 1) {
    throw new Error("Lockfile transition config must use schemaVersion 1.");
  }
  if (
    document.canonicalPackageManager !== "bun" ||
    document.canonicalLockfile !== "bun.lock" ||
    document.compatibilityLockfile !== "package-lock.json"
  ) {
    throw new Error(
      "Lockfile transition config must keep Bun/bun.lock canonical and package-lock.json compatible.",
    );
  }

  const normalized = {
    owner: requireNonEmptyString(document.owner, "transition.owner"),
    reason: requireNonEmptyString(document.reason, "transition.reason"),
    reviewBy: requireIsoDate(document.reviewBy, "transition.reviewBy"),
    consumerContracts: [],
  };
  if (!Array.isArray(document.consumerContracts) || document.consumerContracts.length === 0) {
    throw new Error("transition.consumerContracts must be a non-empty array.");
  }

  const paths = new Set();
  normalized.consumerContracts = document.consumerContracts.map((consumer, index) => {
    if (!isObject(consumer)) {
      throw new Error(`transition.consumerContracts[${index}] must be an object.`);
    }
    const path = requireNonEmptyString(
      consumer.path,
      `transition.consumerContracts[${index}].path`,
    ).replaceAll("\\", "/");
    if (
      isAbsolute(path) ||
      /^[A-Za-z]:\//.test(path) ||
      path.startsWith("/") ||
      path.includes("../") ||
      path === ".."
    ) {
      throw new Error(`transition.consumerContracts[${index}].path must stay inside the repo.`);
    }
    if (paths.has(path)) {
      throw new Error(`Duplicate transition consumer path "${path}".`);
    }
    paths.add(path);
    if (!Array.isArray(consumer.markers) || consumer.markers.length === 0) {
      throw new Error(`transition.consumerContracts[${index}].markers must be non-empty.`);
    }
    const markerSet = new Set();
    const markers = consumer.markers.map((marker, markerIndex) => {
      const value = requireNonEmptyString(
        marker,
        `transition.consumerContracts[${index}].markers[${markerIndex}]`,
      );
      if (!NPM_CONSUMER_PATTERN.test(value)) {
        throw new Error(
          `transition consumer marker "${value}" does not identify an npm install/build/dev command.`,
        );
      }
      if (markerSet.has(value)) {
        throw new Error(`Duplicate transition marker "${value}" for "${path}".`);
      }
      markerSet.add(value);
      return value;
    });
    return { path, markers };
  });
  return normalized;
}

function stableObject(value) {
  if (!isObject(value)) return {};
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function packageLockVersions(packageLock, packageName) {
  if (!isObject(packageLock.packages)) return [];
  const suffix = `/node_modules/${packageName}`;
  const versions = new Set();
  for (const [key, entry] of Object.entries(packageLock.packages)) {
    if (
      (key === `node_modules/${packageName}` || key.endsWith(suffix)) &&
      isObject(entry) &&
      typeof entry.version === "string"
    ) {
      versions.add(entry.version);
    }
  }
  return [...versions].sort();
}

function versionAtLeast(actual, minimum) {
  const parse = (value) => {
    const match = value.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[^ ]+)?$/);
    return match
      ? {
          core: match.slice(1, 4).map(Number),
          prerelease: match[4] ?? null,
        }
      : null;
  };
  const actualVersion = parse(actual);
  const minimumVersion = parse(minimum);
  if (!actualVersion || !minimumVersion) return false;
  for (let index = 0; index < actualVersion.core.length; index += 1) {
    if (actualVersion.core[index] !== minimumVersion.core[index]) {
      return actualVersion.core[index] > minimumVersion.core[index];
    }
  }
  if (actualVersion.prerelease === null) return true;
  if (minimumVersion.prerelease === null) return false;
  return actualVersion.prerelease >= minimumVersion.prerelease;
}

function parseBunLock(lockText) {
  if (typeof lockText !== "string" || lockText.trim() === "") {
    throw new Error("bun.lock is empty.");
  }
  try {
    return JSON.parse(lockText.replace(/,\s*([}\]])/g, "$1"));
  } catch (error) {
    throw new Error(`Failed to parse bun.lock: ${String(error?.message ?? error)}`);
  }
}

function rootVersionInBunLock(document, packageName) {
  const resolution = document.packages?.[packageName]?.[0];
  const prefix = `${packageName}@`;
  return typeof resolution === "string" && resolution.startsWith(prefix)
    ? resolution.slice(prefix.length)
    : null;
}

/**
 * Return true iff `spec` is an exact semver (e.g. "1.2.3", "1.2.3-rc.1").
 */
export function isExactSemver(spec) {
  if (typeof spec !== "string") return false;
  const value = spec.trim();
  if (value === "" || value === "*" || value.toLowerCase() === "latest") return false;
  if (/[\^~><=|\s]/.test(value)) return false;
  if (/^(workspace|file|link|git\+|https?):/i.test(value)) return false;
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(value);
}

/** Extract all resolved versions of a package from a bun.lock text body. */
export function resolvedVersionInBunLock(lockText, packageName) {
  if (typeof lockText !== "string") return null;
  const escaped = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `"${escaped}":\\s*\\["${escaped}@(\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?)`,
    "g",
  );
  const versions = new Set();
  let match;
  while ((match = pattern.exec(lockText)) !== null) versions.add(match[1]);
  return versions.size === 0 ? null : [...versions].sort();
}

export function evaluatePolicy({
  cwd,
  readFile = readFileSync,
  exists = existsSync,
  listFiles = listPolicyFiles,
  today,
} = {}) {
  const root = cwd ?? process.cwd();
  const errors = [];

  for (const lockfile of REQUIRED_LOCKFILES) {
    if (!exists(resolve(root, lockfile))) {
      errors.push(`Required lockfile is missing: ${lockfile}.`);
    }
  }
  for (const forbidden of FORBIDDEN_LOCKFILES) {
    if (exists(resolve(root, forbidden))) {
      errors.push(
        `Forbidden lockfile present: ${forbidden}. Bun is canonical and only the reviewed npm compatibility lock is allowed.`,
      );
    }
  }

  const packageJson = parseJson(readFile, resolve(root, "package.json"), "package.json");
  const transition = parseTransitionConfig(
    parseJson(readFile, resolve(root, TRANSITION_CONFIG), TRANSITION_CONFIG),
  );
  const currentDate = normalizeToday(today);
  if (currentDate > transition.reviewBy) {
    errors.push(
      `Lockfile transition review is overdue (owner=${transition.owner}, reviewBy=${transition.reviewBy}).`,
    );
  }

  const declaredConsumers = new Set(transition.consumerContracts.map(({ path }) => path));
  for (const consumer of transition.consumerContracts) {
    const consumerPath = resolve(root, consumer.path);
    const relativeConsumerPath = relative(root, consumerPath);
    if (
      relativeConsumerPath.startsWith("..") ||
      isAbsolute(relativeConsumerPath) ||
      normalizedRelative(root, consumerPath) !== consumer.path
    ) {
      errors.push(`Declared npm consumer escapes the repository: ${consumer.path}.`);
      continue;
    }
    if (!exists(consumerPath)) {
      errors.push(`Declared npm consumer is missing: ${consumer.path}.`);
      continue;
    }
    let contents;
    try {
      contents = readFile(consumerPath, "utf8");
    } catch (error) {
      errors.push(
        `Failed to read npm consumer ${consumer.path}: ${String(error?.message ?? error)}`,
      );
      continue;
    }
    const commandLines = contents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => NPM_CONSUMER_PATTERN.test(line));
    for (const marker of consumer.markers) {
      if (!commandLines.includes(marker)) {
        errors.push(`npm consumer ${consumer.path} is missing reviewed marker "${marker}".`);
      }
    }
    for (const commandLine of commandLines) {
      if (!consumer.markers.includes(commandLine)) {
        errors.push(`npm consumer ${consumer.path} contains unreviewed command "${commandLine}".`);
      }
    }
  }

  let policyFiles = [];
  try {
    policyFiles = listFiles(root);
  } catch (error) {
    errors.push(`Failed to enumerate npm consumer entrypoints: ${String(error?.message ?? error)}`);
  }
  for (const path of policyFiles) {
    const relativePath = normalizedRelative(root, path);
    if (relativePath === TRANSITION_CONFIG || relativePath === "package-lock.json") continue;
    let contents;
    try {
      contents = readFile(path, "utf8");
    } catch (error) {
      errors.push(`Failed to scan ${relativePath}: ${String(error?.message ?? error)}`);
      continue;
    }
    if (NPM_INSTALL_PATTERN.test(contents) && !declaredConsumers.has(relativePath)) {
      errors.push(
        `Undeclared npm install/ci consumer found at ${relativePath}; update ${TRANSITION_CONFIG}.`,
      );
    }
  }

  const declared =
    packageJson.dependencies?.[CRITICAL_PACKAGE] ??
    packageJson.devDependencies?.[CRITICAL_PACKAGE] ??
    null;
  if (!declared) {
    errors.push(`${CRITICAL_PACKAGE} is not present in package.json dependencies.`);
  } else if (!isExactSemver(declared)) {
    errors.push(`${CRITICAL_PACKAGE} must be pinned to an exact semver (got "${declared}").`);
  }

  const bunLockPath = resolve(root, "bun.lock");
  if (exists(bunLockPath)) {
    try {
      const bunLockText = readFile(bunLockPath, "utf8");
      const bunDocument = parseBunLock(bunLockText);
      const workspace = bunDocument.workspaces?.[""];
      if (!isObject(workspace) || !isObject(bunDocument.packages)) {
        throw new Error("bun.lock is missing the root workspace or packages map.");
      }
      for (const group of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ]) {
        if (
          JSON.stringify(stableObject(packageJson[group])) !==
          JSON.stringify(stableObject(workspace[group]))
        ) {
          errors.push(`bun.lock root workspace ${group} is not synchronized with package.json.`);
        }
      }
      if (
        JSON.stringify(stableObject(packageJson.overrides)) !==
        JSON.stringify(stableObject(bunDocument.overrides))
      ) {
        errors.push("bun.lock overrides are not synchronized with package.json.");
      }

      for (const group of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ]) {
        for (const [packageName, spec] of Object.entries(packageJson[group] ?? {})) {
          if (!isExactSemver(spec)) continue;
          const resolvedVersion = rootVersionInBunLock(bunDocument, packageName);
          if (resolvedVersion !== spec) {
            errors.push(
              `bun.lock root resolution for exact ${group} ${packageName}@${spec} ` +
                `is ${resolvedVersion ?? "missing"}.`,
            );
          }
        }
      }

      const versions = resolvedVersionInBunLock(bunLockText, CRITICAL_PACKAGE);
      if (declared && (!versions || !versions.includes(declared))) {
        errors.push(
          `bun.lock resolves ${CRITICAL_PACKAGE} to ${versions?.join(", ") || "none"} ` +
            `but package.json pins ${declared}.`,
        );
      }
    } catch (error) {
      errors.push(`Failed to read bun.lock: ${String(error?.message ?? error)}`);
    }
  }

  const packageLockPath = resolve(root, "package-lock.json");
  if (exists(packageLockPath)) {
    const packageLock = parseJson(readFile, packageLockPath, "package-lock.json");
    if (packageLock.lockfileVersion !== 3 || !isObject(packageLock.packages?.[""])) {
      errors.push("package-lock.json must be lockfileVersion 3 with a root packages entry.");
    } else {
      const rootEntry = packageLock.packages[""];
      for (const group of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ]) {
        const manifestGroup = stableObject(packageJson[group]);
        const lockGroup = stableObject(rootEntry[group]);
        if (JSON.stringify(manifestGroup) !== JSON.stringify(lockGroup)) {
          errors.push(`package-lock.json root ${group} is not synchronized with package.json.`);
        }
      }

      for (const group of [
        "dependencies",
        "devDependencies",
        "optionalDependencies",
        "peerDependencies",
      ]) {
        for (const [packageName, spec] of Object.entries(packageJson[group] ?? {})) {
          if (!isExactSemver(spec)) continue;
          const resolvedVersion = packageLock.packages[`node_modules/${packageName}`]?.version;
          if (resolvedVersion !== spec) {
            errors.push(
              `package-lock.json root resolution for exact ${group} ${packageName}@${spec} ` +
                `is ${resolvedVersion ?? "missing"}.`,
            );
          }
        }
      }

      if (declared) {
        const versions = packageLockVersions(packageLock, CRITICAL_PACKAGE);
        if (!versions.includes(declared)) {
          errors.push(
            `package-lock.json resolves ${CRITICAL_PACKAGE} to ${versions.join(", ") || "none"} but package.json pins ${declared}.`,
          );
        }
      }

      if (isObject(packageJson.overrides)) {
        for (const [packageName, version] of Object.entries(packageJson.overrides)) {
          if (typeof version !== "string" || !isExactSemver(version)) continue;
          const versions = packageLockVersions(packageLock, packageName);
          if (
            versions.length === 0 ||
            versions.some((resolvedVersion) => resolvedVersion !== version)
          ) {
            errors.push(
              `package-lock.json override for ${packageName}@${version} is not synchronized ` +
                `(found ${versions.join(", ") || "none"}).`,
            );
          }
        }
      }

      for (const [packageName, minimum] of Object.entries(PACKAGE_LOCK_SECURITY_FLOORS)) {
        const versions = packageLockVersions(packageLock, packageName);
        if (
          versions.length === 0 ||
          versions.some((resolvedVersion) => !versionAtLeast(resolvedVersion, minimum))
        ) {
          errors.push(
            `package-lock.json security floor for ${packageName} is ${minimum}; ` +
              `found ${versions.join(", ") || "none"}.`,
          );
        }
      }
      const minimatchVersions = packageLockVersions(packageLock, "minimatch");
      for (const version of minimatchVersions) {
        if (
          (version.startsWith("3.") && !versionAtLeast(version, "3.1.5")) ||
          (version.startsWith("9.") && !versionAtLeast(version, "9.0.9"))
        ) {
          errors.push(
            `package-lock.json minimatch security floor drifted at ${version} ` +
              "(required 3.1.5+ within major 3 and 9.0.9+ within major 9).",
          );
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    transition: {
      owner: transition.owner,
      reviewBy: transition.reviewBy,
      consumers: transition.consumerContracts.map(({ path }) => path),
    },
  };
}

function main() {
  try {
    const result = evaluatePolicy();
    if (result.ok) {
      process.stdout.write(
        `check-bun-lockfile-policy: OK (bun.lock canonical; package-lock.json synchronized ` +
          `for ${result.transition.consumers.length} npm consumers; owner=${result.transition.owner}; ` +
          `reviewBy=${result.transition.reviewBy})\n`,
      );
      return;
    }
    process.stderr.write("check-bun-lockfile-policy: FAIL\n");
    for (const error of result.errors) process.stderr.write(`  - ${error}\n`);
    process.exitCode = 1;
  } catch (error) {
    process.stderr.write(
      `check-bun-lockfile-policy: TOOLING ERROR: ${String(error?.message ?? error)}\n`,
    );
    process.exitCode = 2;
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
