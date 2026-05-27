/**
 * Shared test utilities for gate safety-contract tests.
 *
 * Provides:
 * - Comment stripping (JS/TS and SQL) so safety scans only inspect executable code
 * - Recursive file walker for collecting source files
 * - Banned-token scanner that asserts no forbidden patterns appear in source
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { expect } from "vitest";

/** Project root resolved from this file's `src/test/` location. */
export const ROOT = resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// Comment stripping
// ---------------------------------------------------------------------------

/**
 * Strip JS/TS block comments (including JSDoc) and line comments.
 * Preserves protocol prefixes like `https://` by not matching `//` after `:`.
 */
export function stripJsComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Strip SQL single-line comments (`-- ...`).
 */
export function stripSqlComments(sql: string): string {
  return sql.replace(/^\s*--.*$/gm, "");
}

// ---------------------------------------------------------------------------
// File walking
// ---------------------------------------------------------------------------

/**
 * Recursively collect file paths under `dir`, skipping node_modules, .git, and dist.
 * Optionally filter by file extension pattern.
 */
export function walkDir(
  dir: string,
  opts: { extensions?: RegExp } = {},
  acc: string[] = [],
): string[] {
  if (!existsSync(dir)) return acc;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "dist") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      walkDir(p, opts, acc);
    } else if (!opts.extensions || opts.extensions.test(name)) {
      acc.push(p);
    }
  }
  return acc;
}

// ---------------------------------------------------------------------------
// Banned-token scanning
// ---------------------------------------------------------------------------

export interface BannedToken {
  name: string;
  re: RegExp;
}

/**
 * Assert that `source` does not match any of the provided banned-token patterns.
 * Failures report which pattern matched and an optional `context` label (e.g. file path).
 */
export function assertNoBannedTokens(
  source: string,
  banned: ReadonlyArray<RegExp | BannedToken>,
  context?: string,
): void {
  for (const entry of banned) {
    if (entry instanceof RegExp) {
      expect(source, context ? `banned token ${entry} in ${context}` : undefined).not.toMatch(
        entry,
      );
    } else {
      expect(
        source,
        context
          ? `banned token "${entry.name}" (${entry.re}) in ${context}`
          : `must not contain: ${entry.name}`,
      ).not.toMatch(entry.re);
    }
  }
}

/**
 * Scan all files matching `filter` under `dir` for banned tokens.
 * Reads each file, optionally strips comments, then asserts no banned patterns.
 */
export function scanFilesForBannedTokens(
  dir: string,
  filter: (path: string) => boolean,
  banned: ReadonlyArray<RegExp | BannedToken>,
  opts: { stripComments?: boolean } = {},
): void {
  const files = walkDir(dir, { extensions: /\.(ts|tsx|js|jsx)$/ }).filter(filter);
  for (const f of files) {
    let txt = readFileSync(f, "utf8");
    if (opts.stripComments) {
      txt = stripJsComments(txt);
    }
    assertNoBannedTokens(txt, banned, f);
  }
}
