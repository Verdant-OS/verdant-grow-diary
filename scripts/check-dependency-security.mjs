#!/usr/bin/env node
/**
 * Parse `bun audit --json` and enforce Verdant's dependency policy.
 *
 * Safety posture:
 *  - Read-only. Never mutates package.json, bun.lock, or node_modules.
 *  - Never auto-fixes or silently accepts an unknown audit shape.
 *  - Allows only exact, reviewed package/advisory exceptions before expiry.
 *  - Redacts token-like values from any surfaced error text.
 *  - Deterministic exit codes: 0 = accepted, 1 = blocked, 2 = tooling error.
 *
 * Usage:
 *   node scripts/check-dependency-security.mjs
 *   node scripts/check-dependency-security.mjs --input audit.json
 *   node scripts/check-dependency-security.mjs --stdin
 *   node scripts/check-dependency-security.mjs --exceptions path/to/exceptions.json
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BLOCKED_PACKAGES = Object.freeze([
  "@lovable.dev/mcp-js",
  "@hono/node-server",
  "hono",
  "esbuild",
  "ajv",
]);
export const BLOCKED_SEVERITIES = Object.freeze(["high", "critical"]);
export const KNOWN_SEVERITIES = Object.freeze(["info", "low", "moderate", "high", "critical"]);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = resolve(SCRIPT_DIR, "..");
export const DEFAULT_EXCEPTIONS_PATH = resolve(
  SCRIPT_DIR,
  "../config/dependency-security-exceptions.json",
);
export const DEFAULT_LOCKFILE_PATH = resolve(SCRIPT_DIR, "../bun.lock");
export const DEFAULT_NPM_LOCKFILE_PATH = resolve(SCRIPT_DIR, "../package-lock.json");
export const DEFAULT_MANIFEST_PATH = resolve(SCRIPT_DIR, "../package.json");

/**
 * Redact token-like substrings from a string. Best-effort only; the goal
 * is to keep obviously-secret values out of CI logs when audit tooling
 * accidentally includes them.
 */
export function redactSecrets(text) {
  if (typeof text !== "string") return text;
  return (
    text
      // JWT-shaped tokens: xxx.yyy.zzz (three base64 segments)
      .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
      // GitHub / npm classic tokens
      .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GH_TOKEN]")
      .replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, "[REDACTED_NPM_TOKEN]")
      // Generic Bearer credentials
      .replace(/Bearer\s+[A-Za-z0-9._\-]{16,}/gi, "Bearer [REDACTED]")
      // sk-/pk- style API keys
      .replace(/\b(sk|pk|rk)_[A-Za-z0-9]{16,}\b/g, "[REDACTED_KEY]")
  );
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeFinding(value, context) {
  if (!isObject(value)) {
    throw new Error(`Malformed advisory in ${context.source}.`);
  }

  const embeddedPackageName = [value.module_name, value.name, value.package].find(
    (candidate) => typeof candidate === "string" && candidate.trim() !== "",
  );
  if (context.packageName && embeddedPackageName && embeddedPackageName !== context.packageName) {
    throw new Error(
      `Advisory package "${embeddedPackageName}" disagrees with authoritative ` +
        `${context.source} package "${context.packageName}".`,
    );
  }
  const packageName = context.packageName ?? embeddedPackageName;
  if (!packageName) {
    throw new Error(`Advisory in ${context.source} is missing a package name.`);
  }

  if (typeof value.severity !== "string") {
    throw new Error(`Advisory for "${packageName}" is missing severity.`);
  }
  const severity = value.severity.toLowerCase();
  if (!KNOWN_SEVERITIES.includes(severity)) {
    throw new Error(`Advisory for "${packageName}" has unknown severity "${severity}".`);
  }

  const rawId = value.id ?? context.advisoryId ?? null;
  if (
    context.requireId &&
    !(typeof rawId === "string" || typeof rawId === "number") &&
    rawId !== 0
  ) {
    throw new Error(`Advisory for "${packageName}" in ${context.source} is missing an id.`);
  }

  return {
    package: packageName,
    severity,
    id: typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : null,
    title: typeof value.title === "string" ? value.title : null,
  };
}

function parseObjectMap(map, source, { keyIsAdvisoryId = false } = {}) {
  if (!isObject(map)) {
    throw new Error(`Expected ${source} to be an object.`);
  }

  return Object.entries(map).map(([key, value]) =>
    normalizeFinding(value, {
      source,
      packageName: keyIsAdvisoryId ? null : key,
      advisoryId: keyIsAdvisoryId ? key : null,
      requireId: false,
    }),
  );
}

function parseNpmVulnerabilities(map) {
  if (!isObject(map)) {
    throw new Error("Expected vulnerabilities to be an object.");
  }

  const packageNames = new Set(Object.keys(map));
  const findings = new Map();
  for (const [packageName, vulnerability] of Object.entries(map)) {
    if (!isObject(vulnerability) || !Array.isArray(vulnerability.via)) {
      throw new Error(`Malformed npm vulnerability entry for "${packageName}".`);
    }
    if (
      typeof vulnerability.severity !== "string" ||
      !KNOWN_SEVERITIES.includes(vulnerability.severity.toLowerCase())
    ) {
      throw new Error(`npm vulnerability "${packageName}" has unknown severity.`);
    }

    const paths = Array.isArray(vulnerability.nodes)
      ? vulnerability.nodes.map((path, index) =>
          requireNonEmptyString(path, `vulnerabilities.${packageName}.nodes[${index}]`),
        )
      : null;
    if (paths === null) {
      throw new Error(`npm vulnerability "${packageName}" is missing affected nodes.`);
    }

    for (const via of vulnerability.via) {
      if (typeof via === "string") {
        if (!packageNames.has(via)) {
          throw new Error(
            `npm vulnerability "${packageName}" references missing propagated package "${via}".`,
          );
        }
        continue;
      }
      if (!isObject(via)) {
        throw new Error(`npm vulnerability "${packageName}" has a malformed via entry.`);
      }
      const finding = normalizeFinding(via, {
        source: `npm vulnerabilities entry "${packageName}"`,
        packageName: null,
        advisoryId: via.source,
        requireId: true,
      });
      if (finding.package !== packageName) {
        throw new Error(
          `npm atomic advisory package "${finding.package}" does not match nodes owned by "${packageName}".`,
        );
      }
      const url = requireNonEmptyString(
        via.url,
        `npm advisory ${finding.package}#${finding.id}.url`,
      );
      const range = requireNonEmptyString(
        via.range,
        `npm advisory ${finding.package}#${finding.id}.range`,
      );
      const normalizedPaths = [...new Set(paths)].sort();
      if (normalizedPaths.length === 0) {
        throw new Error(`npm advisory ${finding.package}#${finding.id} has no affected paths.`);
      }
      const key = `${finding.package}\u0000${finding.id}`;
      const normalized = { ...finding, url, range, paths: normalizedPaths };
      const existing = findings.get(key);
      if (existing && JSON.stringify(existing) !== JSON.stringify(normalized)) {
        throw new Error(
          `npm advisory ${finding.package}#${finding.id} appeared with conflicting metadata.`,
        );
      }
      findings.set(key, normalized);
    }
  }

  if (packageNames.size > 0 && findings.size === 0) {
    throw new Error(
      "npm vulnerabilities contained only propagation entries and no atomic advisories.",
    );
  }
  return [...findings.values()];
}

function parseTextAuditOutput(raw) {
  if (/^\s*(?:no|zero)\s+(?:known\s+)?vulnerabilit(?:y|ies)(?:\s+found)?[.!]?\s*$/i.test(raw)) {
    return [];
  }

  const findings = [];
  const severityPattern = /\b(info|low|moderate|high|critical)\b/i;
  const packagePattern = /(@?[\w./-]+)\s+(?:>=|@|-)?\s*\d/;
  for (const line of raw.split(/\r?\n/)) {
    const severityMatch = line.match(severityPattern);
    const packageMatch = line.match(packagePattern);
    if (!severityMatch || !packageMatch) continue;
    findings.push({
      package: packageMatch[1],
      severity: severityMatch[1].toLowerCase(),
      id: null,
      title: line.trim().slice(0, 200),
    });
  }

  if (findings.length === 0) {
    throw new Error("Dependency audit output was not recognized; refusing to report a clean scan.");
  }
  return findings;
}

/**
 * Parse supported audit output into:
 *   { package, severity, id, title }
 *
 * Bun 1.3 emits a top-level package map whose values are advisory arrays.
 * npm-compatible `advisories`, `vulnerabilities`, and `findings` shapes
 * remain supported for fixtures and future tooling interoperability.
 */
export function parseAuditOutput(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("Dependency audit produced no output.");
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch {
    return parseTextAuditOutput(raw);
  }

  if (!isObject(json)) {
    throw new Error("Dependency audit JSON must be an object.");
  }

  if (Object.hasOwn(json, "advisories")) {
    return parseObjectMap(json.advisories, "advisories", { keyIsAdvisoryId: true });
  }

  if (Object.hasOwn(json, "vulnerabilities")) {
    return parseNpmVulnerabilities(json.vulnerabilities);
  }

  if (Object.hasOwn(json, "findings")) {
    if (!Array.isArray(json.findings)) {
      throw new Error("Expected findings to be an array.");
    }
    return json.findings.map((finding) =>
      normalizeFinding(finding, {
        source: "findings",
        packageName: null,
        advisoryId: null,
        requireId: false,
      }),
    );
  }

  const entries = Object.entries(json);
  if (entries.length === 0) return [];

  if (!entries.every(([, advisories]) => Array.isArray(advisories))) {
    throw new Error(
      "Dependency audit JSON shape was not recognized; refusing to report a clean scan.",
    );
  }

  return entries.flatMap(([packageName, advisories]) =>
    advisories.map((advisory) =>
      normalizeFinding(advisory, {
        source: `Bun package map entry "${packageName}"`,
        packageName,
        advisoryId: null,
        requireId: true,
      }),
    ),
  );
}

/**
 * Evaluate parsed findings against the core policy.
 */
export function evaluateFindings(findings, options = {}) {
  if (!Array.isArray(findings)) {
    throw new Error("Findings must be an array.");
  }

  const blocked = [];
  const reasons = [];
  const blockedPackages = new Set(options.blockedPackages ?? BLOCKED_PACKAGES);
  const blockedSeverities = new Set(options.blockedSeverities ?? BLOCKED_SEVERITIES);

  for (const finding of findings) {
    if (!isObject(finding)) {
      throw new Error("Finding must be an object.");
    }
    if (blockedPackages.has(finding.package)) {
      blocked.push(finding);
      reasons.push(
        `Blocked package "${finding.package}" has active advisory ` +
          `(severity=${finding.severity}${finding.id ? `, id=${finding.id}` : ""}).`,
      );
      continue;
    }
    if (blockedSeverities.has(finding.severity)) {
      blocked.push(finding);
      reasons.push(
        `Advisory on "${finding.package}" is ${finding.severity} severity ` +
          `(id=${finding.id ?? "n/a"}).`,
      );
    }
  }
  return { blocked, reasons };
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

/**
 * Validate and normalize the reviewed-exception document.
 */
export function parseReviewedExceptions(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("Dependency security exception file is empty.");
  }

  let document;
  try {
    document = JSON.parse(raw);
  } catch {
    throw new Error("Dependency security exception file is not valid JSON.");
  }
  if (!isObject(document) || document.schemaVersion !== 1) {
    throw new Error("Dependency security exceptions must use schemaVersion 1.");
  }
  if (!Array.isArray(document.exceptions)) {
    throw new Error("Dependency security exceptions must contain an exceptions array.");
  }

  const keys = new Set();
  return document.exceptions.map((exception, index) => {
    if (!isObject(exception)) {
      throw new Error(`exceptions[${index}] must be an object.`);
    }

    const normalized = {
      package: requireNonEmptyString(exception.package, `exceptions[${index}].package`),
      advisoryId: requireNonEmptyString(exception.advisoryId, `exceptions[${index}].advisoryId`),
      severity: requireNonEmptyString(
        exception.severity,
        `exceptions[${index}].severity`,
      ).toLowerCase(),
      expectedNpmAdvisoryUrl: requireNonEmptyString(
        exception.expectedNpmAdvisoryUrl,
        `exceptions[${index}].expectedNpmAdvisoryUrl`,
      ),
      expectedNpmVulnerableRange: requireNonEmptyString(
        exception.expectedNpmVulnerableRange,
        `exceptions[${index}].expectedNpmVulnerableRange`,
      ),
      owner: requireNonEmptyString(exception.owner, `exceptions[${index}].owner`),
      reason: requireNonEmptyString(exception.reason, `exceptions[${index}].reason`),
      reachability: requireNonEmptyString(
        exception.reachability,
        `exceptions[${index}].reachability`,
      ),
      recheckOn: requireIsoDate(exception.recheckOn, `exceptions[${index}].recheckOn`),
      expiresOn: requireIsoDate(exception.expiresOn, `exceptions[${index}].expiresOn`),
      expectedLockResolutions: null,
      expectedBunAffectedKeys: null,
      expectedNpmLockResolutions: null,
      expectedParentKeys: null,
      expectedNpmParentPaths: null,
      expectedNpmAffectedPaths: null,
      allowedImportPaths: null,
      allowedScriptNames: null,
      expectedBunDirectRootAncestors: null,
      expectedNpmDirectRootAncestors: null,
    };

    if (!KNOWN_SEVERITIES.includes(normalized.severity)) {
      throw new Error(`exceptions[${index}].severity has unknown value "${normalized.severity}".`);
    }
    if (normalized.recheckOn > normalized.expiresOn) {
      throw new Error(`exceptions[${index}].recheckOn must not be after expiresOn.`);
    }
    if (
      !Array.isArray(exception.expectedLockResolutions) ||
      exception.expectedLockResolutions.length === 0
    ) {
      throw new Error(`exceptions[${index}].expectedLockResolutions must be a non-empty array.`);
    }

    const resolutionKeys = new Set();
    normalized.expectedLockResolutions = exception.expectedLockResolutions.map(
      (resolution, resolutionIndex) => {
        if (!isObject(resolution)) {
          throw new Error(
            `exceptions[${index}].expectedLockResolutions[${resolutionIndex}] must be an object.`,
          );
        }
        const key = requireNonEmptyString(
          resolution.key,
          `exceptions[${index}].expectedLockResolutions[${resolutionIndex}].key`,
        );
        const version = requireNonEmptyString(
          resolution.version,
          `exceptions[${index}].expectedLockResolutions[${resolutionIndex}].version`,
        );
        if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
          throw new Error(
            `exceptions[${index}].expectedLockResolutions[${resolutionIndex}].version ` +
              "must be an exact semver.",
          );
        }
        if (resolutionKeys.has(key)) {
          throw new Error(
            `exceptions[${index}].expectedLockResolutions contains duplicate key "${key}".`,
          );
        }
        resolutionKeys.add(key);
        return { key, version };
      },
    );
    if (
      !Array.isArray(exception.expectedBunAffectedKeys) ||
      exception.expectedBunAffectedKeys.length === 0
    ) {
      throw new Error(`exceptions[${index}].expectedBunAffectedKeys must be a non-empty array.`);
    }
    const bunAffectedKeys = new Set();
    normalized.expectedBunAffectedKeys = exception.expectedBunAffectedKeys.map(
      (affectedKey, affectedIndex) => {
        const key = requireNonEmptyString(
          affectedKey,
          `exceptions[${index}].expectedBunAffectedKeys[${affectedIndex}]`,
        );
        if (!resolutionKeys.has(key)) {
          throw new Error(
            `exceptions[${index}].expectedBunAffectedKeys[${affectedIndex}] ` +
              `"${key}" is not an expected Bun lock resolution.`,
          );
        }
        if (bunAffectedKeys.has(key)) {
          throw new Error(
            `exceptions[${index}].expectedBunAffectedKeys contains duplicate key "${key}".`,
          );
        }
        bunAffectedKeys.add(key);
        return key;
      },
    );
    if (
      !Array.isArray(exception.expectedNpmLockResolutions) ||
      exception.expectedNpmLockResolutions.length === 0
    ) {
      throw new Error(`exceptions[${index}].expectedNpmLockResolutions must be a non-empty array.`);
    }
    const npmResolutionPaths = new Set();
    normalized.expectedNpmLockResolutions = exception.expectedNpmLockResolutions.map(
      (resolution, resolutionIndex) => {
        if (!isObject(resolution)) {
          throw new Error(
            `exceptions[${index}].expectedNpmLockResolutions[${resolutionIndex}] must be an object.`,
          );
        }
        const path = requireNonEmptyString(
          resolution.path,
          `exceptions[${index}].expectedNpmLockResolutions[${resolutionIndex}].path`,
        ).replaceAll("\\", "/");
        const version = requireNonEmptyString(
          resolution.version,
          `exceptions[${index}].expectedNpmLockResolutions[${resolutionIndex}].version`,
        );
        if (!path.startsWith("node_modules/") || path.includes("../")) {
          throw new Error(
            `exceptions[${index}].expectedNpmLockResolutions[${resolutionIndex}].path ` +
              "must be a package-lock node_modules path.",
          );
        }
        if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
          throw new Error(
            `exceptions[${index}].expectedNpmLockResolutions[${resolutionIndex}].version ` +
              "must be an exact semver.",
          );
        }
        if (npmResolutionPaths.has(path)) {
          throw new Error(
            `exceptions[${index}].expectedNpmLockResolutions contains duplicate path "${path}".`,
          );
        }
        npmResolutionPaths.add(path);
        return { path, version };
      },
    );
    if (!Array.isArray(exception.expectedParentKeys) || exception.expectedParentKeys.length === 0) {
      throw new Error(`exceptions[${index}].expectedParentKeys must be a non-empty array.`);
    }
    const parentKeys = new Set();
    normalized.expectedParentKeys = exception.expectedParentKeys.map((parentKey, parentIndex) => {
      const key = requireNonEmptyString(
        parentKey,
        `exceptions[${index}].expectedParentKeys[${parentIndex}]`,
      );
      if (parentKeys.has(key)) {
        throw new Error(`exceptions[${index}].expectedParentKeys contains duplicate key "${key}".`);
      }
      parentKeys.add(key);
      return key;
    });
    if (
      !Array.isArray(exception.expectedNpmParentPaths) ||
      exception.expectedNpmParentPaths.length === 0
    ) {
      throw new Error(`exceptions[${index}].expectedNpmParentPaths must be a non-empty array.`);
    }
    const npmParentPaths = new Set();
    normalized.expectedNpmParentPaths = exception.expectedNpmParentPaths.map(
      (parentPath, parentIndex) => {
        const path = requireNonEmptyString(
          parentPath,
          `exceptions[${index}].expectedNpmParentPaths[${parentIndex}]`,
        ).replaceAll("\\", "/");
        if (!path.startsWith("node_modules/") || path.includes("../")) {
          throw new Error(
            `exceptions[${index}].expectedNpmParentPaths[${parentIndex}] ` +
              "must be a package-lock node_modules path.",
          );
        }
        if (npmParentPaths.has(path)) {
          throw new Error(
            `exceptions[${index}].expectedNpmParentPaths contains duplicate path "${path}".`,
          );
        }
        npmParentPaths.add(path);
        return path;
      },
    );
    if (
      !Array.isArray(exception.expectedNpmAffectedPaths) ||
      exception.expectedNpmAffectedPaths.length === 0
    ) {
      throw new Error(`exceptions[${index}].expectedNpmAffectedPaths must be a non-empty array.`);
    }
    const npmAffectedPaths = new Set();
    normalized.expectedNpmAffectedPaths = exception.expectedNpmAffectedPaths.map(
      (affectedPath, affectedIndex) => {
        const path = requireNonEmptyString(
          affectedPath,
          `exceptions[${index}].expectedNpmAffectedPaths[${affectedIndex}]`,
        ).replaceAll("\\", "/");
        if (!npmResolutionPaths.has(path)) {
          throw new Error(
            `exceptions[${index}].expectedNpmAffectedPaths[${affectedIndex}] ` +
              `"${path}" is not an expected npm lock resolution.`,
          );
        }
        if (npmAffectedPaths.has(path)) {
          throw new Error(
            `exceptions[${index}].expectedNpmAffectedPaths contains duplicate path "${path}".`,
          );
        }
        npmAffectedPaths.add(path);
        return path;
      },
    );
    if (!Array.isArray(exception.allowedImportPaths)) {
      throw new Error(`exceptions[${index}].allowedImportPaths must be an array.`);
    }
    const allowedImportPaths = new Set();
    normalized.allowedImportPaths = exception.allowedImportPaths.map((importPath, importIndex) => {
      const path = requireNonEmptyString(
        importPath,
        `exceptions[${index}].allowedImportPaths[${importIndex}]`,
      ).replaceAll("\\", "/");
      if (path.startsWith("/") || path.includes("../") || path === "..") {
        throw new Error(`exceptions[${index}].allowedImportPaths[${importIndex}] is outside repo.`);
      }
      if (allowedImportPaths.has(path)) {
        throw new Error(
          `exceptions[${index}].allowedImportPaths contains duplicate path "${path}".`,
        );
      }
      allowedImportPaths.add(path);
      return path;
    });
    if (!Array.isArray(exception.allowedScriptNames)) {
      throw new Error(`exceptions[${index}].allowedScriptNames must be an array.`);
    }
    const allowedScriptNames = new Set();
    normalized.allowedScriptNames = exception.allowedScriptNames.map((scriptName, scriptIndex) => {
      const name = requireNonEmptyString(
        scriptName,
        `exceptions[${index}].allowedScriptNames[${scriptIndex}]`,
      );
      if (allowedScriptNames.has(name)) {
        throw new Error(
          `exceptions[${index}].allowedScriptNames contains duplicate name "${name}".`,
        );
      }
      allowedScriptNames.add(name);
      return name;
    });

    const allowedGroups = new Set([
      "dependencies",
      "devDependencies",
      "optionalDependencies",
      "peerDependencies",
    ]);
    const parseAncestorDeclarations = (field) => {
      if (!Array.isArray(exception[field]) || exception[field].length === 0) {
        throw new Error(`exceptions[${index}].${field} must be a non-empty array.`);
      }
      const identities = new Set();
      return exception[field].map((declaration, declarationIndex) => {
        if (!isObject(declaration)) {
          throw new Error(`exceptions[${index}].${field}[${declarationIndex}] must be an object.`);
        }
        const packageName = requireNonEmptyString(
          declaration.package,
          `exceptions[${index}].${field}[${declarationIndex}].package`,
        );
        const group = requireNonEmptyString(
          declaration.group,
          `exceptions[${index}].${field}[${declarationIndex}].group`,
        );
        const spec = requireNonEmptyString(
          declaration.spec,
          `exceptions[${index}].${field}[${declarationIndex}].spec`,
        );
        if (!allowedGroups.has(group)) {
          throw new Error(
            `exceptions[${index}].${field}[${declarationIndex}].group ` +
              `must be one of ${[...allowedGroups].join(", ")}.`,
          );
        }
        const identity = `${group}\u0000${packageName}`;
        if (identities.has(identity)) {
          throw new Error(
            `exceptions[${index}].${field} contains duplicate ${group} entry "${packageName}".`,
          );
        }
        identities.add(identity);
        return { package: packageName, group, spec };
      });
    };
    normalized.expectedBunDirectRootAncestors = parseAncestorDeclarations(
      "expectedBunDirectRootAncestors",
    );
    normalized.expectedNpmDirectRootAncestors = parseAncestorDeclarations(
      "expectedNpmDirectRootAncestors",
    );

    const key = `${normalized.package}\u0000${normalized.advisoryId}`;
    if (keys.has(key)) {
      throw new Error(
        `Duplicate dependency security exception for ${normalized.package}#${normalized.advisoryId}.`,
      );
    }
    keys.add(key);
    return normalized;
  });
}

export function loadReviewedExceptions(path = DEFAULT_EXCEPTIONS_PATH) {
  return parseReviewedExceptions(readFileSync(path, "utf8"));
}

function lockPackageResolutions(lockText) {
  if (typeof lockText !== "string" || lockText.trim() === "") {
    throw new Error("bun.lock is empty.");
  }

  const resolutions = [];
  const resolutionPattern =
    /^\s*"([^"]+)":\s*\["([^"\r\n]+)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)"([^\r\n]*)$/gm;
  let match;
  while ((match = resolutionPattern.exec(lockText)) !== null) {
    const dependencyNames = new Set();
    const runtimeDependencyNames = new Set();
    const dependencyEdges = [];
    for (const dependencyGroup of match[4].matchAll(
      /"(dependencies|optionalDependencies|peerDependencies)":\s*\{([^}]*)\}/g,
    )) {
      for (const dependencyMatch of dependencyGroup[2].matchAll(/"([^"]+)":/g)) {
        dependencyNames.add(dependencyMatch[1]);
        runtimeDependencyNames.add(dependencyMatch[1]);
        dependencyEdges.push({
          name: dependencyMatch[1],
          group: dependencyGroup[1],
        });
      }
    }
    resolutions.push({
      key: match[1],
      package: match[2],
      version: match[3],
      dependencies: [...dependencyNames],
      runtimeDependencies: [...runtimeDependencyNames],
      dependencyEdges,
    });
  }
  if (resolutions.length === 0) {
    throw new Error("bun.lock did not contain recognizable package resolutions.");
  }
  return resolutions;
}

/**
 * Bind every reviewed package exception to the complete expected set of
 * bun.lock resolution keys and versions for that package.
 */
export function evaluateExceptionLockResolutions(lockText, exceptions) {
  if (!Array.isArray(exceptions)) {
    throw new Error("Reviewed exceptions must be an array.");
  }
  if (exceptions.length === 0) return { ok: true, errors: [] };

  const resolutions = lockPackageResolutions(lockText);
  const errors = [];
  for (const exception of exceptions) {
    const expected = exception.expectedLockResolutions
      .map(({ key, version }) => `${key}@${version}`)
      .sort();
    const actual = resolutions
      .filter((resolution) => resolution.package === exception.package)
      .map(({ key, version }) => `${key}@${version}`)
      .sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(
        `Lockfile resolutions for exception "${exception.package}" drifted ` +
          `(expected ${expected.join(", ") || "none"}; found ${actual.join(", ") || "none"}).`,
      );
    }

    const expectedParents = [...exception.expectedParentKeys].sort();
    const actualParents = resolutions
      .filter((resolution) => resolution.dependencies.includes(exception.package))
      .map((resolution) => resolution.key)
      .sort();
    if (JSON.stringify(actualParents) !== JSON.stringify(expectedParents)) {
      errors.push(
        `Dependency parents for exception "${exception.package}" drifted ` +
          `(expected ${expectedParents.join(", ")}; found ${actualParents.join(", ") || "none"}).`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Bind reviewed exceptions to the npm compatibility graph as tightly as the
 * Bun graph: exact install paths, versions, and immediate parent paths.
 */
export function evaluateExceptionNpmLockResolutions(lockText, exceptions) {
  if (!Array.isArray(exceptions)) {
    throw new Error("Reviewed exceptions must be an array.");
  }
  if (exceptions.length === 0) return { ok: true, errors: [] };
  if (typeof lockText !== "string" || lockText.trim() === "") {
    throw new Error("package-lock.json is empty.");
  }

  let document;
  try {
    document = JSON.parse(lockText);
  } catch {
    throw new Error("package-lock.json is not valid JSON.");
  }
  if (!isObject(document) || document.lockfileVersion !== 3 || !isObject(document.packages)) {
    throw new Error("package-lock.json must be lockfileVersion 3 with a packages object.");
  }

  const entries = Object.entries(document.packages);
  const errors = [];
  for (const exception of exceptions) {
    const suffix = `/node_modules/${exception.package}`;
    const actualResolutions = entries
      .filter(
        ([path, entry]) =>
          (path === `node_modules/${exception.package}` || path.endsWith(suffix)) &&
          isObject(entry) &&
          typeof entry.version === "string",
      )
      .map(([path, entry]) => `${path}@${entry.version}`)
      .sort();
    const expectedResolutions = exception.expectedNpmLockResolutions
      .map(({ path, version }) => `${path}@${version}`)
      .sort();
    if (JSON.stringify(actualResolutions) !== JSON.stringify(expectedResolutions)) {
      errors.push(
        `npm lock resolutions for exception "${exception.package}" drifted ` +
          `(expected ${expectedResolutions.join(", ")}; found ${actualResolutions.join(", ") || "none"}).`,
      );
    }

    const actualParents = entries
      .filter(([, entry]) => {
        if (!isObject(entry)) return false;
        return ["dependencies", "optionalDependencies", "peerDependencies"].some(
          (group) => isObject(entry[group]) && Object.hasOwn(entry[group], exception.package),
        );
      })
      .map(([path]) => path || "<root>")
      .sort();
    const expectedParents = [...exception.expectedNpmParentPaths].sort();
    if (JSON.stringify(actualParents) !== JSON.stringify(expectedParents)) {
      errors.push(
        `npm dependency parents for exception "${exception.package}" drifted ` +
          `(expected ${expectedParents.join(", ")}; found ${actualParents.join(", ") || "none"}).`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

function directManifestDeclarations(packageJson) {
  const declarations = [];
  for (const group of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ]) {
    if (!isObject(packageJson[group])) continue;
    for (const [packageName, spec] of Object.entries(packageJson[group])) {
      declarations.push({ package: packageName, group, spec: String(spec) });
    }
  }
  return declarations;
}

function reverseClosure(reverseEdges, startKeys) {
  const seen = new Set(startKeys);
  const queue = [...startKeys];
  while (queue.length > 0) {
    const child = queue.shift();
    for (const parent of reverseEdges.get(child) ?? []) {
      if (seen.has(parent)) continue;
      seen.add(parent);
      queue.push(parent);
    }
  }
  return seen;
}

function declarationIdentity(declaration) {
  return `${declaration.group}\u0000${declaration.package}\u0000${declaration.spec}`;
}

function formatDeclarations(declarations) {
  return (
    declarations
      .map(({ group, package: packageName, spec }) => `${group}:${packageName}@${spec}`)
      .join(", ") || "none"
  );
}

/**
 * Pin the complete direct-root ancestor closure for every affected resolution
 * in both lock graphs. This prevents a new runtime dependency from reusing an
 * already-excepted transitive path without forcing review.
 */
export function evaluateExceptionRootAncestors({
  bunLockText,
  npmLockText,
  packageJson,
  exceptions,
}) {
  if (!isObject(packageJson)) throw new Error("package.json must be an object.");
  if (!Array.isArray(exceptions)) throw new Error("Reviewed exceptions must be an array.");
  if (exceptions.length === 0) return { ok: true, errors: [] };

  const bunResolutions = lockPackageResolutions(bunLockText);
  const bunKeys = new Set(bunResolutions.map(({ key }) => key));
  const bunReverseEdges = new Map();
  for (const parent of bunResolutions) {
    const ancestorKeys = bunResolutions
      .map(({ key }) => key)
      .filter((key) => parent.key === key || parent.key.startsWith(`${key}/`))
      .sort((left, right) => right.length - left.length);
    for (const edge of parent.dependencyEdges) {
      const dependency = edge.name;
      let child = null;
      for (const ancestorKey of ancestorKeys) {
        const candidate = `${ancestorKey}/${dependency}`;
        if (bunKeys.has(candidate)) {
          child = candidate;
          break;
        }
      }
      if (child === null && bunKeys.has(dependency)) child = dependency;
      if (child === null) {
        if (edge.group === "peerDependencies") continue;
        throw new Error(`Unable to resolve Bun dependency edge ${parent.key} -> ${dependency}.`);
      }
      if (!bunReverseEdges.has(child)) bunReverseEdges.set(child, []);
      bunReverseEdges.get(child).push(parent.key);
    }
  }

  let npmDocument;
  try {
    npmDocument = JSON.parse(npmLockText);
  } catch {
    throw new Error("package-lock.json is not valid JSON.");
  }
  if (!isObject(npmDocument) || !isObject(npmDocument.packages)) {
    throw new Error("package-lock.json is missing a packages object.");
  }
  const npmEntries = Object.entries(npmDocument.packages);
  const npmPaths = new Set(npmEntries.map(([path]) => path));
  const npmReverseEdges = new Map();
  const packageContainer = (path) => {
    const segments = path.split("/");
    const nodeModulesIndex = segments.lastIndexOf("node_modules");
    return nodeModulesIndex < 0 ? null : segments.slice(0, nodeModulesIndex).join("/");
  };
  const resolveNpmDependency = (parentPath, dependency) => {
    let currentPath = parentPath;
    while (currentPath !== null) {
      const candidate = `${currentPath ? `${currentPath}/` : ""}node_modules/${dependency}`;
      if (npmPaths.has(candidate)) return candidate;
      currentPath = packageContainer(currentPath);
    }
    return null;
  };
  for (const [parentPath, entry] of npmEntries) {
    if (parentPath === "" || !isObject(entry)) continue;
    for (const group of ["dependencies", "optionalDependencies", "peerDependencies"]) {
      if (!isObject(entry[group])) continue;
      for (const dependency of Object.keys(entry[group])) {
        const child = resolveNpmDependency(parentPath, dependency);
        if (child === null) {
          if (group === "peerDependencies") continue;
          throw new Error(`Unable to resolve npm dependency edge ${parentPath} -> ${dependency}.`);
        }
        if (!npmReverseEdges.has(child)) npmReverseEdges.set(child, []);
        npmReverseEdges.get(child).push(parentPath);
      }
    }
  }

  const declarations = directManifestDeclarations(packageJson);
  const byIdentity = (left, right) =>
    declarationIdentity(left).localeCompare(declarationIdentity(right));
  const errors = [];
  for (const exception of exceptions) {
    const bunClosure = reverseClosure(bunReverseEdges, exception.expectedBunAffectedKeys);
    const actualBunAncestors = declarations
      .filter(({ package: packageName }) => bunClosure.has(packageName))
      .sort(byIdentity);
    const expectedBunAncestors = [...exception.expectedBunDirectRootAncestors].sort(byIdentity);
    if (JSON.stringify(actualBunAncestors) !== JSON.stringify(expectedBunAncestors)) {
      errors.push(
        `Bun direct-root ancestors for exception "${exception.package}" drifted ` +
          `(expected ${formatDeclarations(expectedBunAncestors)}; ` +
          `found ${formatDeclarations(actualBunAncestors)}).`,
      );
    }

    const npmClosure = reverseClosure(npmReverseEdges, exception.expectedNpmAffectedPaths);
    const actualNpmAncestors = declarations
      .filter(({ package: packageName }) => npmClosure.has(`node_modules/${packageName}`))
      .sort(byIdentity);
    const expectedNpmAncestors = [...exception.expectedNpmDirectRootAncestors].sort(byIdentity);
    if (JSON.stringify(actualNpmAncestors) !== JSON.stringify(expectedNpmAncestors)) {
      errors.push(
        `npm direct-root ancestors for exception "${exception.package}" drifted ` +
          `(expected ${formatDeclarations(expectedNpmAncestors)}; ` +
          `found ${formatDeclarations(actualNpmAncestors)}).`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

export function evaluateExceptionManifestReachability(packageJson, exceptions) {
  if (!isObject(packageJson)) throw new Error("package.json must be an object.");
  if (!Array.isArray(exceptions)) throw new Error("Reviewed exceptions must be an array.");

  const declarationGroupNames = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  const errors = [];
  for (const exception of exceptions) {
    if (
      declarationGroupNames.some(
        (group) =>
          isObject(packageJson[group]) && Object.hasOwn(packageJson[group], exception.package),
      )
    ) {
      errors.push(
        `Excepted package "${exception.package}" became a direct package.json declaration; ` +
          "its reachability must be reviewed before the advisory can remain excepted.",
      );
    }
    const escapedPackage = exception.package.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const packageToken = new RegExp(
      `(^|[^A-Za-z0-9_@./-])${escapedPackage}(?:/[^\\s"';&|)]+)?` + `(?=$|[^A-Za-z0-9_.-])`,
    );
    const actualScriptNames = Object.entries(packageJson.scripts ?? {})
      .filter(([, command]) => typeof command === "string" && packageToken.test(command))
      .map(([name]) => name)
      .sort();
    const expectedScriptNames = [...exception.allowedScriptNames].sort();
    if (JSON.stringify(actualScriptNames) !== JSON.stringify(expectedScriptNames)) {
      errors.push(
        `package.json script reachability for exception "${exception.package}" drifted ` +
          `(allowed ${expectedScriptNames.join(", ") || "none"}; ` +
          `found ${actualScriptNames.join(", ") || "none"}).`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

function listReviewedSourceFiles(repoRoot) {
  const files = [];
  const ignoredDirectories = new Set([
    ".git",
    ".vitest-runs",
    "coverage",
    "dist",
    "node_modules",
    "playwright-report",
    "test-results",
  ]);
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
        continue;
      }
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && /\.(?:[cm]?[jt]sx?)$/i.test(entry.name)) files.push(path);
    }
  };
  if (existsSync(repoRoot)) visit(repoRoot);
  return files;
}

export function evaluateExceptionSourceImports({
  repoRoot = DEFAULT_REPO_ROOT,
  exceptions,
  readFile = readFileSync,
  listFiles = listReviewedSourceFiles,
}) {
  if (!Array.isArray(exceptions)) {
    throw new Error("Reviewed exceptions must be an array.");
  }
  if (exceptions.length === 0) return { ok: true, errors: [] };

  const files = listFiles(repoRoot);
  const errors = [];
  for (const exception of exceptions) {
    const escapedPackage = exception.package.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const importPattern = new RegExp(
      `(?:\\bfrom\\s*|\\bimport\\s*\\(\\s*|\\brequire(?:\\.resolve)?\\s*\\(\\s*|` +
        `\\bimport\\s*)["']${escapedPackage}(?:/[^"']*)?["']`,
    );
    const actualPaths = files
      .filter((path) => importPattern.test(readFile(path, "utf8")))
      .map((path) => relative(repoRoot, path).replaceAll("\\", "/"))
      .sort();
    const expectedPaths = [...exception.allowedImportPaths].sort();
    if (JSON.stringify(actualPaths) !== JSON.stringify(expectedPaths)) {
      errors.push(
        `Source imports for exception "${exception.package}" drifted ` +
          `(allowed ${expectedPaths.join(", ") || "none"}; found ${actualPaths.join(", ") || "none"}).`,
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

function findingKey(finding) {
  return finding.id === null ? null : `${finding.package}\u0000${finding.id}`;
}

function normalizeToday(value) {
  if (value === undefined) return new Date().toISOString().slice(0, 10);
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Today must be a valid date.");
    return value.toISOString().slice(0, 10);
  }
  return requireIsoDate(value, "today");
}

/**
 * Apply exact, expiring reviewed exceptions to findings already blocked by
 * the core policy. Stale, mismatched, and expired entries fail closed.
 */
export function evaluateReviewedExceptions(findings, exceptions, options = {}) {
  if (!Array.isArray(exceptions)) {
    throw new Error("Reviewed exceptions must be an array.");
  }

  const today = normalizeToday(options.today);
  const core = evaluateFindings(findings, options);
  const exceptionsByKey = new Map(
    exceptions.map((exception) => [`${exception.package}\u0000${exception.advisoryId}`, exception]),
  );
  const matchedKeys = new Set();
  const blocked = [];
  const reasons = [];
  const reviewed = [];

  core.blocked.forEach((finding, index) => {
    const key = findingKey(finding);
    const exception = key === null ? null : exceptionsByKey.get(key);
    let npmMetadataMatches = true;
    if (
      exception &&
      options.auditSource === "npm" &&
      (finding.url !== exception.expectedNpmAdvisoryUrl ||
        finding.range !== exception.expectedNpmVulnerableRange ||
        JSON.stringify([...(finding.paths ?? [])].sort()) !==
          JSON.stringify([...exception.expectedNpmAffectedPaths].sort()))
    ) {
      npmMetadataMatches = false;
    }
    if (
      exception &&
      exception.severity === finding.severity &&
      today <= exception.expiresOn &&
      npmMetadataMatches
    ) {
      matchedKeys.add(key);
      reviewed.push({ finding, exception });
      return;
    }

    blocked.push(finding);
    if (exception && options.auditSource === "npm" && !npmMetadataMatches) {
      reasons.push(
        `npm advisory identity, vulnerable range, or affected paths drifted for ` +
          `"${finding.package}" id=${finding.id}.`,
      );
    } else {
      reasons.push(core.reasons[index]);
    }
  });

  const expired = [];
  const stale = [];
  const recheckDue = [];
  for (const exception of exceptions) {
    const key = `${exception.package}\u0000${exception.advisoryId}`;
    if (today > exception.expiresOn) {
      expired.push(exception);
      reasons.push(
        `Reviewed exception for "${exception.package}" id=${exception.advisoryId} expired on ${exception.expiresOn}.`,
      );
      continue;
    }
    if (!matchedKeys.has(key)) {
      stale.push(exception);
      reasons.push(
        `Reviewed exception for "${exception.package}" id=${exception.advisoryId} no longer exactly matches a blocked finding.`,
      );
      continue;
    }
    if (today >= exception.recheckOn) recheckDue.push(exception);
  }

  return { blocked, reviewed, expired, stale, recheckDue, reasons, today };
}

function parseCliArgs(argv) {
  const parsed = {
    inputPath: null,
    stdin: false,
    exceptionsPath: DEFAULT_EXCEPTIONS_PATH,
    lockfilePath: DEFAULT_LOCKFILE_PATH,
    npmLockfilePath: DEFAULT_NPM_LOCKFILE_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    repoRoot: DEFAULT_REPO_ROOT,
    npmInputPath: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--stdin") {
      parsed.stdin = true;
      continue;
    }
    if (
      argument === "--input" ||
      argument === "--exceptions" ||
      argument === "--lockfile" ||
      argument === "--npm-lockfile" ||
      argument === "--manifest" ||
      argument === "--repo-root" ||
      argument === "--npm-input"
    ) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a path.`);
      }
      if (argument === "--input") parsed.inputPath = value;
      else if (argument === "--exceptions") parsed.exceptionsPath = value;
      else if (argument === "--lockfile") parsed.lockfilePath = value;
      else if (argument === "--npm-lockfile") parsed.npmLockfilePath = value;
      else if (argument === "--manifest") parsed.manifestPath = value;
      else if (argument === "--repo-root") parsed.repoRoot = value;
      else parsed.npmInputPath = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument "${argument}".`);
  }

  if (parsed.stdin && parsed.inputPath) {
    throw new Error("Use only one of --stdin or --input.");
  }
  if (parsed.stdin && parsed.npmInputPath) {
    throw new Error("--stdin cannot be combined with --npm-input.");
  }
  if (parsed.npmInputPath && !parsed.inputPath) {
    throw new Error("--npm-input requires --input for the paired Bun audit fixture.");
  }
  return parsed;
}

function runAuditCommand(command, commandArgs, label) {
  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(
      result.error.code === "ENOENT"
        ? `\`${command}\` is not on PATH.`
        : `Unable to run ${label}: ${result.error.message}`,
    );
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`${label} exited unexpectedly with status ${result.status ?? "unknown"}.`);
  }
  if (typeof result.stdout !== "string" || result.stdout.trim() === "") {
    throw new Error(`${label} produced no JSON on stdout.`);
  }
  return result.stdout;
}

export function npmAuditInvocation(platform = process.platform, environment = process.env) {
  if (platform === "win32") {
    return {
      command: environment.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", "npm audit --package-lock-only --json"],
    };
  }
  return {
    command: "npm",
    args: ["audit", "--package-lock-only", "--json"],
  };
}

function readAuditSources(args) {
  if (args.stdin) {
    return [{ name: "fixture", raw: readFileSync(0, "utf8") }];
  }
  if (args.inputPath) {
    const sources = [
      { name: args.npmInputPath ? "bun" : "fixture", raw: readFileSync(args.inputPath, "utf8") },
    ];
    if (args.npmInputPath) {
      sources.push({ name: "npm", raw: readFileSync(args.npmInputPath, "utf8") });
    }
    return sources;
  }

  const npmInvocation = npmAuditInvocation();
  return [
    {
      name: "bun",
      raw: runAuditCommand("bun", ["audit", "--json"], "bun audit"),
    },
    {
      name: "npm",
      raw: runAuditCommand(
        npmInvocation.command,
        npmInvocation.args,
        "npm audit --package-lock-only",
      ),
    },
  ];
}

function main() {
  try {
    const args = parseCliArgs(process.argv.slice(2));
    const exceptions = loadReviewedExceptions(args.exceptionsPath);
    const sourceResults = readAuditSources(args).map((source) => {
      const findings = parseAuditOutput(source.raw);
      return {
        ...source,
        findings,
        result: evaluateReviewedExceptions(findings, exceptions, {
          auditSource: source.name,
        }),
      };
    });
    const lockResult = evaluateExceptionLockResolutions(
      readFileSync(args.lockfilePath, "utf8"),
      exceptions,
    );
    const npmLockResult = evaluateExceptionNpmLockResolutions(
      readFileSync(args.npmLockfilePath, "utf8"),
      exceptions,
    );
    const manifest = JSON.parse(readFileSync(args.manifestPath, "utf8"));
    const manifestResult = evaluateExceptionManifestReachability(manifest, exceptions);
    const rootAncestorResult = evaluateExceptionRootAncestors({
      bunLockText: readFileSync(args.lockfilePath, "utf8"),
      npmLockText: readFileSync(args.npmLockfilePath, "utf8"),
      packageJson: manifest,
      exceptions,
    });
    const sourceImportResult = evaluateExceptionSourceImports({
      repoRoot: resolve(args.repoRoot),
      exceptions,
    });
    const auditBlocked = sourceResults.some(
      ({ result }) =>
        result.blocked.length > 0 || result.expired.length > 0 || result.stale.length > 0,
    );

    if (
      auditBlocked ||
      !lockResult.ok ||
      !npmLockResult.ok ||
      !manifestResult.ok ||
      !rootAncestorResult.ok ||
      !sourceImportResult.ok
    ) {
      process.stderr.write("check-dependency-security: BLOCKED\n");
      for (const reason of [
        ...sourceResults.flatMap(({ name, result }) =>
          result.reasons.map((reason) => `${name}: ${reason}`),
        ),
        ...lockResult.errors,
        ...npmLockResult.errors,
        ...manifestResult.errors,
        ...rootAncestorResult.errors,
        ...sourceImportResult.errors,
      ]) {
        process.stderr.write(`  - ${redactSecrets(reason)}\n`);
      }
      process.exitCode = 1;
      return;
    }

    const recheckDue = new Map();
    for (const { result } of sourceResults) {
      for (const exception of result.recheckDue) {
        recheckDue.set(`${exception.package}\u0000${exception.advisoryId}`, exception);
      }
    }
    for (const exception of recheckDue.values()) {
      process.stderr.write(
        `check-dependency-security: RECHECK DUE for ${exception.package}#${exception.advisoryId} ` +
          `(owner=${exception.owner}, expires=${exception.expiresOn}).\n`,
      );
    }
    if (sourceResults.length === 1) {
      const [{ findings, result }] = sourceResults;
      process.stdout.write(
        `check-dependency-security: OK (${findings.length} advisory findings parsed, ` +
          `${result.reviewed.length} reviewed blocked findings, 0 unreviewed blocked).\n`,
      );
    } else {
      const summary = sourceResults
        .map(
          ({ name, findings, result }) =>
            `${name}: ${findings.length} findings, ${result.reviewed.length} reviewed blocked, ` +
            "0 unreviewed blocked",
        )
        .join("; ");
      process.stdout.write(`check-dependency-security: OK (${summary}).\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`check-dependency-security: TOOLING ERROR: ${redactSecrets(message)}\n`);
    process.exitCode = 2;
  }
}

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
