#!/usr/bin/env node
/**
 * check-dependency-security — parse `bun audit` output (JSON or text)
 * and fail if blocked packages have active vulnerability findings.
 *
 * Safety posture:
 *  - Read-only. Never mutates package.json, bun.lock, or node_modules.
 *  - Never auto-fixes.
 *  - Redacts token-like values from any surfaced audit text.
 *  - Deterministic exit codes: 0 = clean, 1 = blocked, 2 = tooling error.
 *
 * Usage:
 *   node scripts/check-dependency-security.mjs                # runs `bun audit --json`
 *   node scripts/check-dependency-security.mjs --input file   # parse fixture
 *   node scripts/check-dependency-security.mjs --stdin        # parse stdin
 *
 * Blocked package names (must never carry an active advisory):
 *   - @lovable.dev/mcp-js
 *   - esbuild
 *   - ajv
 *
 * Additionally fails on any high/critical severity finding.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export const BLOCKED_PACKAGES = Object.freeze([
  "@lovable.dev/mcp-js",
  "esbuild",
  "ajv",
]);

export const BLOCKED_SEVERITIES = Object.freeze(["high", "critical"]);

/**
 * Redact token-like substrings from a string. Best-effort only; the goal
 * is to keep obviously-secret values out of CI logs when audit output
 * accidentally includes them.
 */
export function redactSecrets(text) {
  if (typeof text !== "string") return text;
  return text
    // JWT-shaped tokens: xxx.yyy.zzz (three base64 segments)
    .replace(/\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_JWT]")
    // GitHub / npm classic tokens
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, "[REDACTED_GH_TOKEN]")
    .replace(/\bnpm_[A-Za-z0-9]{20,}\b/g, "[REDACTED_NPM_TOKEN]")
    // Generic Bearer credentials
    .replace(/Bearer\s+[A-Za-z0-9._\-]{16,}/gi, "Bearer [REDACTED]")
    // sk-/pk- style API keys
    .replace(/\b(sk|pk|rk)_[A-Za-z0-9]{16,}\b/g, "[REDACTED_KEY]");
}

/**
 * Parse `bun audit` output. Accepts either JSON (preferred) or a text
 * table fallback. Returns a normalized list of findings:
 *   { package, severity, id?, title? }
 */
export function parseAuditOutput(raw) {
  const findings = [];
  if (typeof raw !== "string" || raw.trim() === "") return findings;

  // Try JSON first.
  try {
    const json = JSON.parse(raw);
    // npm-audit-compatible shape: { advisories: { id: {...} } } or
    // { vulnerabilities: { pkg: {...} } }, or bun's own shape.
    if (json && typeof json === "object") {
      const advisories = json.advisories ?? json.vulnerabilities ?? null;
      if (advisories && typeof advisories === "object") {
        for (const [key, val] of Object.entries(advisories)) {
          if (!val || typeof val !== "object") continue;
          const pkg =
            typeof val.module_name === "string"
              ? val.module_name
              : typeof val.name === "string"
                ? val.name
                : typeof val.package === "string"
                  ? val.package
                  : String(key);
          const severity =
            typeof val.severity === "string" ? val.severity.toLowerCase() : "unknown";
          findings.push({
            package: pkg,
            severity,
            id: typeof val.id === "string" || typeof val.id === "number" ? String(val.id) : null,
            title: typeof val.title === "string" ? val.title : null,
          });
        }
        return findings;
      }
      // Bun-style array
      if (Array.isArray(json.findings)) {
        for (const f of json.findings) {
          if (!f || typeof f !== "object") continue;
          findings.push({
            package: String(f.package ?? f.name ?? ""),
            severity: String(f.severity ?? "unknown").toLowerCase(),
            id: f.id != null ? String(f.id) : null,
            title: typeof f.title === "string" ? f.title : null,
          });
        }
        return findings;
      }
    }
  } catch {
    // fall through to text parser
  }

  // Text fallback: look for lines mentioning severity + package name.
  const lines = raw.split(/\r?\n/);
  const sevRe = /\b(low|moderate|high|critical)\b/i;
  const pkgRe = /(@?[\w./-]+)\s+(?:>=|@|-)?\s*\d/;
  for (const line of lines) {
    const sevMatch = line.match(sevRe);
    if (!sevMatch) continue;
    const pkgMatch = line.match(pkgRe);
    if (!pkgMatch) continue;
    findings.push({
      package: pkgMatch[1],
      severity: sevMatch[1].toLowerCase(),
      id: null,
      title: line.trim().slice(0, 200),
    });
  }
  return findings;
}

/**
 * Evaluate parsed findings against policy. Returns { blocked, reasons }.
 */
export function evaluateFindings(findings, options = {}) {
  const blocked = [];
  const reasons = [];
  const blockedPackages = new Set(options.blockedPackages ?? BLOCKED_PACKAGES);
  const blockedSeverities = new Set(options.blockedSeverities ?? BLOCKED_SEVERITIES);

  for (const f of findings) {
    if (!f || typeof f !== "object") continue;
    if (blockedPackages.has(f.package)) {
      blocked.push(f);
      reasons.push(
        `Blocked package "${f.package}" has active advisory ` +
          `(severity=${f.severity}${f.id ? `, id=${f.id}` : ""}).`,
      );
      continue;
    }
    if (blockedSeverities.has(f.severity)) {
      blocked.push(f);
      reasons.push(
        `Advisory on "${f.package}" is ${f.severity} severity ` +
          `(id=${f.id ?? "n/a"}).`,
      );
    }
  }
  return { blocked, reasons };
}

function readInput(argv) {
  const inputIdx = argv.indexOf("--input");
  if (inputIdx !== -1 && argv[inputIdx + 1]) {
    return readFileSync(argv[inputIdx + 1], "utf8");
  }
  if (argv.includes("--stdin")) {
    return readFileSync(0, "utf8");
  }
  // Run bun audit --json. Bun exits non-zero when findings exist; that's fine.
  const res = spawnSync("bun", ["audit", "--json"], { encoding: "utf8" });
  if (res.error && res.error.code === "ENOENT") {
    process.stderr.write(
      "check-dependency-security: `bun` is not on PATH.\n",
    );
    process.exit(2);
  }
  return (res.stdout ?? "") + (res.stderr ?? "");
}

function main() {
  const raw = readInput(process.argv.slice(2));
  const findings = parseAuditOutput(raw);
  const { blocked, reasons } = evaluateFindings(findings);

  if (blocked.length === 0) {
    process.stdout.write(
      `check-dependency-security: OK (${findings.length} advisory findings parsed, 0 blocked).\n`,
    );
    process.exit(0);
  }
  process.stderr.write("check-dependency-security: BLOCKED\n");
  for (const r of reasons) process.stderr.write(`  - ${redactSecrets(r)}\n`);
  process.exit(1);
}

// Only run when invoked directly.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
