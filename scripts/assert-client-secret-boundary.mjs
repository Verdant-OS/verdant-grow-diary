#!/usr/bin/env node
/**
 * Client Secret Boundary Guard
 *
 * Fails the build if any client-side product source file references
 * `service_role` or `SUPABASE_SERVICE_ROLE_KEY` *in executable code*.
 *
 * The scan strips comments, string literals, template literals, and
 * regex literals before searching. This means:
 *   - Documentation comments naming the forbidden symbol are OK.
 *   - Redaction/denylist string arrays naming the forbidden symbol
 *     are OK (they need the literal to do their job).
 *   - Actual identifier usage (e.g. `process.env.SUPABASE_SERVICE_ROLE_KEY`
 *     or `supabase.auth.service_role`) is BLOCKED.
 *
 * Scope: client-side product code only.
 *   src/components, src/pages, src/hooks, src/lib
 *
 * Exact-path exceptions: none required today. The strip-then-scan
 * approach permits intentional denylist data (kept as strings) without
 * a broad allowlist.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative } from "node:path";

export const SCAN_ROOTS = [
  "src/components",
  "src/pages",
  "src/hooks",
  "src/lib",
];

export const BLOCKED_TERMS = ["SUPABASE_SERVICE_ROLE_KEY", "service_role"];

/** Exact relative file paths permitted to reference blocked terms in code. */
export const EXACT_PATH_EXCEPTIONS: ReadonlySet<string> = new Set([
  // (intentionally empty — see header comment)
]);

const FILE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Strip /* ... *​/ block and // line comments. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Strip "...", '...', `...` (incl. interpolations) and /.../ regex literals. */
function stripLiteralsAndRegex(src) {
  // Template literals — non-greedy, accept escaped backticks.
  let out = src.replace(/`(?:\\.|\$\{[^}]*\}|[^`\\])*`/g, '""');
  // Double-quoted strings
  out = out.replace(/"(?:\\.|[^"\\\n])*"/g, '""');
  // Single-quoted strings
  out = out.replace(/'(?:\\.|[^'\\\n])*'/g, "''");
  // Regex literals — heuristic: after a non-identifier char.
  out = out.replace(/([=(,;:!&|?{}\[\n])\s*\/(?:\\.|[^\/\\\n])+\/[gimsuy]*/g, "$1/_/");
  return out;
}

export function scrubSource(src) {
  return stripLiteralsAndRegex(stripComments(src));
}

export function findOffendingTerms(src) {
  const scrubbed = scrubSource(src);
  const hits = [];
  for (const term of BLOCKED_TERMS) {
    const re = new RegExp(term, "g");
    if (re.test(scrubbed)) hits.push(term);
  }
  return hits;
}

function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (FILE_EXT.test(name) && !/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(name)) {
      yield full;
    }
  }
}

export function scanClientSecretBoundary(rootDir = process.cwd()) {
  const violations = [];
  for (const rel of SCAN_ROOTS) {
    const root = resolve(rootDir, rel);
    for (const file of walk(root)) {
      const relPath = relative(rootDir, file).replace(/\\/g, "/");
      if (EXACT_PATH_EXCEPTIONS.has(relPath)) continue;
      const src = readFileSync(file, "utf8");
      const hits = findOffendingTerms(src);
      if (hits.length > 0) {
        violations.push({ file: relPath, hits });
      }
    }
  }
  return violations;
}

// CLI entrypoint
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname);

if (isMain) {
  const violations = scanClientSecretBoundary(process.cwd());
  if (violations.length > 0) {
    console.error("Client secret boundary violations:");
    for (const v of violations) {
      console.error(`  ${v.file}: ${v.hits.join(", ")}`);
    }
    process.exit(1);
  }
  console.log("Client secret boundary OK.");
}
