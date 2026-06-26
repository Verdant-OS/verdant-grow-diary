#!/usr/bin/env node
/**
 * verify-stabilization-pr-scope.mjs
 *
 * Scope guard for "test-stabilization" PRs. Verifies that a branch or staged
 * changeset contains ONLY harness/test files — never product features,
 * schema/RLS/RPC migrations, edge functions, genetics/breeding, Harvest
 * Watch, harvest/cure persistence, Harvest Evidence Report, AI/proof
 * surfaces, or product UI.
 *
 * Dev tooling only. No product behavior, schema, RLS, edge function, AI,
 * alerts, Action Queue, or device-control surface is touched.
 *
 * Usage:
 *   node scripts/verify-stabilization-pr-scope.mjs [--base <ref>] [--staged]
 *                                                  [--allow-docs] [--json]
 *                                                  [--help]
 */

import { execSync } from "node:child_process";

// ---------- Pure helpers (exported for unit tests) ----------

/**
 * Allowed-by-default path prefixes/exact matches for harness work.
 * Conservative on purpose: when in doubt, BLOCK.
 */
const ALLOWED_PREFIXES = [
  "src/test/",
  "tests/",
  "scripts/",
];

const ALLOWED_EXACT = new Set([
  "package.json",
  "bun.lockb",
  "bun.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
]);

const ALLOWED_CONFIG_REGEXES = [
  /^vitest\.config\.[cm]?[jt]s$/,
  /^playwright\.config\.[cm]?[jt]s$/,
];

/** Hard block prefixes — never allowed in a stabilization PR. */
const BLOCKED_PREFIXES = [
  "src/lib/genetics/",
  "src/components/genetics/",
  "supabase/functions/_shared/genetics/",
  "supabase/functions/create-breeding-suggestions/",
  "supabase/migrations/",
  "supabase/functions/",
  "src/pages/",
];

/** Hard block exact files. */
const BLOCKED_EXACT = new Set([
  "src/components/GeneticsBadge.tsx",
  "src/lib/plantGeneticsViewModel.ts",
  "src/components/PlantDetailHarvestWatchCard.tsx",
  "src/lib/plantDetailHarvestWatchCardViewModel.ts",
  "src/constants/groveBagCureFields.ts",
  "src/lib/groveBagAirflowRules.ts",
  "src/hooks/useHarvestEvidenceReportData.ts",
]);

/**
 * Hard block prefixes for product modules whose filenames begin with
 * blocked tokens (e.g. harvestWatch*, harvestCure*, harvestEvidenceReport*).
 */
const BLOCKED_FILENAME_PREFIXES_IN_LIB = [
  "harvestWatch",
  "harvestCure",
  "harvestEvidenceReport",
];

const BLOCKED_FILENAME_PREFIXES_IN_COMPONENTS = [
  "HarvestEvidenceReport",
  "HarvestWatch",
  "PlantDetailHarvestWatch",
];

/** Token regex match — applies to any changed file path. */
const BLOCKED_TOKEN_REGEX =
  /(HarvestWatch|HarvestEvidenceReport|harvestCure|genetics|breeding|dryback|verdantGeneticsXlsx)/i;

/**
 * Test-only allowlist exception. The scope guard's own test file
 * legitimately contains blocked tokens as fixtures and must not block itself.
 */
const ALLOWLIST_EXCEPTIONS = new Set([
  "src/test/verify-stabilization-pr-scope.test.ts",
  "scripts/verify-stabilization-pr-scope.mjs",
]);

/**
 * Returns true if the given path is on the test-only allow exception list.
 */
export function isAllowlistException(filePath) {
  return ALLOWLIST_EXCEPTIONS.has(filePath);
}

/**
 * Returns true if the path matches an always-block rule, regardless of
 * whether it would otherwise match an allowed prefix.
 */
export function isBlockedStabilizationPath(filePath) {
  if (isAllowlistException(filePath)) return false;
  if (BLOCKED_EXACT.has(filePath)) return true;
  for (const prefix of BLOCKED_PREFIXES) {
    if (filePath.startsWith(prefix)) return true;
  }
  // src/lib/<harvestWatch|harvestCure|harvestEvidenceReport>*
  if (filePath.startsWith("src/lib/")) {
    const tail = filePath.slice("src/lib/".length);
    for (const p of BLOCKED_FILENAME_PREFIXES_IN_LIB) {
      if (tail.startsWith(p)) return true;
    }
  }
  if (filePath.startsWith("src/components/")) {
    const tail = filePath.slice("src/components/".length);
    for (const p of BLOCKED_FILENAME_PREFIXES_IN_COMPONENTS) {
      if (tail.startsWith(p)) return true;
    }
  }
  if (BLOCKED_TOKEN_REGEX.test(filePath)) return true;
  return false;
}

/**
 * Returns true if the path is permitted under stabilization PR rules.
 * `options.allowDocs` opens `docs/**` paths. Otherwise docs are blocked
 * to force product-doc changes into separate PRs.
 */
export function isAllowedStabilizationPath(filePath, options = {}) {
  if (isAllowlistException(filePath)) return true;
  if (isBlockedStabilizationPath(filePath)) return false;
  if (ALLOWED_EXACT.has(filePath)) return true;
  for (const re of ALLOWED_CONFIG_REGEXES) {
    if (re.test(filePath)) return true;
  }
  for (const prefix of ALLOWED_PREFIXES) {
    if (filePath.startsWith(prefix)) return true;
  }
  if (options.allowDocs && filePath.startsWith("docs/")) return true;
  return false;
}

/**
 * Classify a list of changed files into allowed/blocked buckets and
 * compute a final verdict.
 *
 * @param {string[]} files
 * @param {{ allowDocs?: boolean }} [options]
 * @returns {{ allowed: string[], blocked: string[], verdict: "pass" | "stop-ship", count: number }}
 */
export function classifyStabilizationPrFiles(files, options = {}) {
  const allowed = [];
  const blocked = [];
  for (const f of files) {
    if (!f) continue;
    if (
      isBlockedStabilizationPath(f) ||
      !isAllowedStabilizationPath(f, options)
    ) {
      blocked.push(f);
    } else {
      allowed.push(f);
    }
  }
  return {
    allowed,
    blocked,
    count: allowed.length + blocked.length,
    verdict: blocked.length === 0 ? "pass" : "stop-ship",
  };
}

// ---------- CLI ----------

function parseArgs(argv) {
  const args = {
    base: null,
    staged: false,
    allowDocs: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") args.help = true;
    else if (a === "--staged") args.staged = true;
    else if (a === "--allow-docs") args.allowDocs = true;
    else if (a === "--json") args.json = true;
    else if (a === "--base") args.base = argv[++i];
    else if (a.startsWith("--base=")) args.base = a.slice("--base=".length);
  }
  return args;
}

function printHelp() {
  process.stdout.write(`verify-stabilization-pr-scope

Verifies a test-stabilization branch/changeset contains only harness files.

Usage:
  node scripts/verify-stabilization-pr-scope.mjs [options]

Options:
  --base <ref>     Compare against <ref> (default: origin/main).
  --staged         Check staged files (git diff --cached) instead of branch diff.
  --allow-docs     Permit docs/** changes (off by default).
  --json           Emit machine-readable JSON output.
  -h, --help       Show this help.

Exit codes:
  0  All changed files are allowed.
  1  Blocked files found, OR git command failed.
`);
}

function getChangedFiles(args) {
  if (args.staged) {
    const out = execSync("git diff --cached --name-only", {
      encoding: "utf8",
    });
    return { mode: "staged", base: null, files: splitLines(out) };
  }
  const base = args.base ?? "origin/main";
  const out = execSync(
    `git diff --name-only ${shellEscape(base)}...HEAD`,
    { encoding: "utf8" },
  );
  return { mode: "branch-diff", base, files: splitLines(out) };
}

function splitLines(s) {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function shellEscape(s) {
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let mode, base, files;
  try {
    ({ mode, base, files } = getChangedFiles(args));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`STOP-SHIP: git command failed: ${msg}\n`);
    process.exit(1);
  }

  const result = classifyStabilizationPrFiles(files, {
    allowDocs: args.allowDocs,
  });

  if (args.json) {
    process.stdout.write(
      JSON.stringify(
        {
          mode,
          base,
          changedCount: result.count,
          allowed: result.allowed,
          blocked: result.blocked,
          verdict: result.verdict,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(`stabilization PR scope check\n`);
    process.stdout.write(`  mode: ${mode}\n`);
    if (base) process.stdout.write(`  base: ${base}\n`);
    process.stdout.write(`  changed files: ${result.count}\n`);
    process.stdout.write(`  allowed: ${result.allowed.length}\n`);
    for (const f of result.allowed) process.stdout.write(`    + ${f}\n`);
    process.stdout.write(`  blocked: ${result.blocked.length}\n`);
    for (const f of result.blocked) process.stdout.write(`    - ${f}\n`);
    if (result.verdict === "pass") {
      process.stdout.write(`\nVERDICT: pass (harness-only)\n`);
    } else {
      process.stdout.write(
        `\nSTOP-SHIP: this branch is not test-stabilization only.\n` +
          `Move blocked files into separate, scoped PRs before retrying.\n`,
      );
    }
  }

  process.exit(result.verdict === "pass" ? 0 : 1);
}

// Only run CLI when invoked directly, not when imported by tests.
const invokedDirectly =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (invokedDirectly) {
  main();
}
