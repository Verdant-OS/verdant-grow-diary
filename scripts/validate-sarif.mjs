#!/usr/bin/env node
/**
 * validate-sarif.mjs
 *
 * Lightweight SARIF 2.1.0 structural validator for pre-upload checks.
 * Verifies required top-level fields, tool driver metadata, rule catalog,
 * per-result required fields (ruleId, level, message, locations,
 * partialFingerprints), and physicalLocation shape.
 *
 * Usage:
 *   node scripts/validate-sarif.mjs <path-to-sarif> [--json] [--quiet]
 *
 * Exit codes:
 *   0  valid (no errors; warnings allowed)
 *   1  invalid (structural errors found)
 *   2  usage / IO error (file missing, not JSON, bad args)
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SARIF_SCHEMA_VERSION = "2.1.0";
const SARIF_SCHEMA_URL_PREFIX =
  "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const quiet = args.includes("--quiet");
const filePath = args.find((a) => !a.startsWith("--"));

function die(code, msg) {
  if (jsonOut) {
    process.stdout.write(
      JSON.stringify({ ok: false, errors: [{ path: "$", message: msg }], warnings: [] }) + "\n",
    );
  } else if (!quiet) {
    process.stderr.write(`validate-sarif: ${msg}\n`);
  }
  process.exit(code);
}

if (!filePath) {
  die(2, "usage: validate-sarif.mjs <path-to-sarif> [--json] [--quiet]");
}
const abs = resolve(filePath);
if (!existsSync(abs)) die(2, `file not found: ${abs}`);

let sarif;
try {
  sarif = JSON.parse(readFileSync(abs, "utf8"));
} catch (e) {
  die(2, `not valid JSON: ${e.message}`);
}

const errors = [];
const warnings = [];
const err = (path, message) => errors.push({ path, message });
const warn = (path, message) => warnings.push({ path, message });

// ---------- top-level ----------
if (typeof sarif !== "object" || sarif === null || Array.isArray(sarif)) {
  err("$", "root must be a JSON object");
} else {
  if (sarif.version !== SARIF_SCHEMA_VERSION) {
    err("$.version", `expected "${SARIF_SCHEMA_VERSION}", got ${JSON.stringify(sarif.version)}`);
  }
  if (sarif.$schema && !String(sarif.$schema).startsWith(SARIF_SCHEMA_URL_PREFIX)) {
    warn("$.$schema", `unexpected $schema URL: ${sarif.$schema}`);
  }
  if (!Array.isArray(sarif.runs)) {
    err("$.runs", "must be an array");
  } else if (sarif.runs.length === 0) {
    warn("$.runs", "empty runs array (GitHub accepts but shows nothing)");
  } else {
    sarif.runs.forEach((run, i) => validateRun(run, `$.runs[${i}]`));
  }
}

function validateRun(run, base) {
  if (!run || typeof run !== "object") {
    err(base, "must be an object");
    return;
  }

  // tool.driver
  const driver = run.tool?.driver;
  if (!driver || typeof driver !== "object") {
    err(`${base}.tool.driver`, "required object missing");
  } else {
    if (typeof driver.name !== "string" || !driver.name.trim()) {
      err(`${base}.tool.driver.name`, "required non-empty string");
    }
    if (driver.rules != null && !Array.isArray(driver.rules)) {
      err(`${base}.tool.driver.rules`, "must be an array when present");
    }
  }

  // Build ruleId set from rules catalog for cross-check
  const ruleIds = new Set(
    Array.isArray(driver?.rules)
      ? driver.rules
          .map((r, i) => {
            if (!r || typeof r !== "object") {
              err(`${base}.tool.driver.rules[${i}]`, "must be an object");
              return null;
            }
            if (typeof r.id !== "string" || !r.id.trim()) {
              err(`${base}.tool.driver.rules[${i}].id`, "required non-empty string");
              return null;
            }
            return r.id;
          })
          .filter(Boolean)
      : [],
  );

  // results
  if (run.results == null) {
    warn(`${base}.results`, "missing (treated as empty)");
    return;
  }
  if (!Array.isArray(run.results)) {
    err(`${base}.results`, "must be an array");
    return;
  }

  run.results.forEach((res, i) => validateResult(res, `${base}.results[${i}]`, ruleIds));
}

function validateResult(res, base, ruleIds) {
  if (!res || typeof res !== "object") {
    err(base, "must be an object");
    return;
  }

  if (typeof res.ruleId !== "string" || !res.ruleId.trim()) {
    err(`${base}.ruleId`, "required non-empty string");
  } else if (ruleIds.size > 0 && !ruleIds.has(res.ruleId)) {
    warn(`${base}.ruleId`, `"${res.ruleId}" not declared in tool.driver.rules`);
  }

  if (res.level != null && !["none", "note", "warning", "error"].includes(res.level)) {
    err(`${base}.level`, `invalid value ${JSON.stringify(res.level)}`);
  } else if (res.level == null) {
    warn(`${base}.level`, "missing (GitHub defaults to warning)");
  }

  if (!res.message || typeof res.message !== "object") {
    err(`${base}.message`, "required object");
  } else if (typeof res.message.text !== "string" || !res.message.text.trim()) {
    err(`${base}.message.text`, "required non-empty string");
  }

  // locations
  if (!Array.isArray(res.locations) || res.locations.length === 0) {
    err(`${base}.locations`, "required non-empty array (GitHub needs a physicalLocation to anchor the alert)");
  } else {
    res.locations.forEach((loc, i) => validateLocation(loc, `${base}.locations[${i}]`));
  }

  // partialFingerprints — required for stable de-duplication in Code Scanning
  if (!res.partialFingerprints || typeof res.partialFingerprints !== "object") {
    err(
      `${base}.partialFingerprints`,
      "required object (at least one key, e.g. primaryLocationLineHash) so re-uploads de-duplicate",
    );
  } else {
    const keys = Object.keys(res.partialFingerprints);
    if (keys.length === 0) {
      err(`${base}.partialFingerprints`, "must contain at least one fingerprint entry");
    }
    for (const k of keys) {
      const v = res.partialFingerprints[k];
      if (typeof v !== "string" || !v.trim()) {
        err(`${base}.partialFingerprints.${k}`, "fingerprint value must be a non-empty string");
      }
    }
  }
}

function validateLocation(loc, base) {
  if (!loc || typeof loc !== "object") {
    err(base, "must be an object");
    return;
  }
  const phys = loc.physicalLocation;
  if (!phys || typeof phys !== "object") {
    err(`${base}.physicalLocation`, "required object");
    return;
  }
  const artifact = phys.artifactLocation;
  if (!artifact || typeof artifact !== "object") {
    err(`${base}.physicalLocation.artifactLocation`, "required object");
  } else if (typeof artifact.uri !== "string" || !artifact.uri.trim()) {
    err(`${base}.physicalLocation.artifactLocation.uri`, "required non-empty string");
  } else if (artifact.uri.startsWith("/") || /^[A-Za-z]:\\/.test(artifact.uri)) {
    warn(
      `${base}.physicalLocation.artifactLocation.uri`,
      "should be a repo-relative path, not absolute (GitHub cannot anchor absolute paths to files)",
    );
  }

  const region = phys.region;
  if (region != null) {
    if (typeof region !== "object") {
      err(`${base}.physicalLocation.region`, "must be an object when present");
    } else if (region.startLine != null) {
      if (!Number.isInteger(region.startLine) || region.startLine < 1) {
        err(`${base}.physicalLocation.region.startLine`, "must be an integer >= 1");
      }
    } else {
      warn(`${base}.physicalLocation.region`, "no startLine — alert will anchor at line 1");
    }
  } else {
    warn(`${base}.physicalLocation.region`, "missing — alert will anchor at line 1");
  }
}

// ---------- output ----------
const ok = errors.length === 0;
if (jsonOut) {
  process.stdout.write(JSON.stringify({ ok, errors, warnings }, null, 2) + "\n");
} else if (!quiet) {
  const rel = filePath;
  if (ok) {
    process.stdout.write(
      `validate-sarif: OK — ${rel} (${warnings.length} warning${warnings.length === 1 ? "" : "s"})\n`,
    );
  } else {
    process.stderr.write(`validate-sarif: FAIL — ${rel}\n`);
  }
  for (const w of warnings) process.stderr.write(`  warn  ${w.path}: ${w.message}\n`);
  for (const e of errors) process.stderr.write(`  ERROR ${e.path}: ${e.message}\n`);
}

process.exit(ok ? 0 : 1);
