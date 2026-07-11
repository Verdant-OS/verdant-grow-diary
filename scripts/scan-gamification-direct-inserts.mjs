#!/usr/bin/env node
/**
 * Static scan: forbid client-side direct inserts into gamification tables.
 *
 * Gamification writes must flow only through public.award_nugs SECURITY
 * DEFINER RPC. Authenticated INSERT policies on nug_events / unlocks /
 * user_quests have been dropped; any client-side `.from("<table>").insert(`
 * would be both unsafe (bypassing whitelist/caps if policies regress) and
 * dead (will return a permission error today).
 *
 * Scope: src/ only by default. Pass --extra <path> to add additional roots.
 *
 * Pure Node implementation (no ripgrep dependency) so the scan runs the
 * same way locally and in CI runners that don't ship `rg`.
 *
 * Usage: node scripts/scan-gamification-direct-inserts.mjs
 *   --extra <path>    additional path to scan (repeatable)
 * Exit 0 on clean, 1 on any forbidden hit, 2 on argument/IO error.
 *
 * NOTE: the deterministic analysis core (walkScanRoot, scanRoots) is
 * exported so in-process callers (tests) can reuse a single src walk
 * across many scenarios without spawning Node subprocesses per case.
 * The CLI wrapper below preserves the original argv/stdout/stderr/exit
 * contract exactly.
 */
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const GAMIFICATION_TABLES = ["nug_events", "unlocks", "user_quests"];
// Match `.from("X").insert(` and `.from('X').insert(` across whitespace/newlines.
export const GAMIFICATION_INSERT_PATTERN = new RegExp(
  String.raw`\.from\(\s*['"](` +
    GAMIFICATION_TABLES.join("|") +
    String.raw`)['"]\s*\)\s*\.insert\(`,
  "g",
);

// Files we never scan, even if reachable via --extra:
//   - the scanner's own self-test (intentionally contains forbidden strings).
export const EXCLUDE_BASENAMES = new Set([
  "scan-gamification-direct-inserts.test.ts",
]);

const SCANNABLE_EXT = /\.(ts|tsx|js|mjs|cjs|jsx)$/;

export function walkScanRoot(root) {
  const out = [];
  if (!existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (name === "node_modules" || name === ".git") continue;
      const full = join(cur, name);
      let s;
      try {
        s = statSync(full);
      } catch {
        continue;
      }
      if (s.isDirectory()) {
        stack.push(full);
      } else if (SCANNABLE_EXT.test(name) && !EXCLUDE_BASENAMES.has(name)) {
        out.push(full);
      }
    }
  }
  return out;
}

/**
 * Scan a list of already-collected file paths for forbidden inserts.
 * Returns hits deterministically ordered by file, then match index.
 */
export function scanFiles(files) {
  const seen = new Set();
  const hits = [];
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    GAMIFICATION_INSERT_PATTERN.lastIndex = 0;
    let m;
    while ((m = GAMIFICATION_INSERT_PATTERN.exec(content)) !== null) {
      const key = `${file}:${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const line = content.slice(0, m.index).split("\n").length;
      hits.push({ file, line, table: m[1], snippet: m[0] });
    }
  }
  return hits;
}

/**
 * Scan a list of roots (walk each, then scan). Deduplicates hits by
 * (file, matchIndex) so a root supplied twice cannot double-count.
 */
export function scanRoots(roots) {
  const files = [];
  const seenFile = new Set();
  for (const root of roots) {
    for (const f of walkScanRoot(root)) {
      if (seenFile.has(f)) continue;
      seenFile.add(f);
      files.push(f);
    }
  }
  return scanFiles(files);
}

export function formatHits(hits) {
  const lines = ["✗ forbidden direct inserts into gamification tables found:"];
  for (const h of hits) {
    const path = h.file.split(sep).join("/");
    lines.push(`  ${path}:${h.line}: ${h.snippet}  [${h.table}]`);
  }
  lines.push(
    "",
    "Use the public.award_nugs SECURITY DEFINER RPC instead. " +
      "These tables have no client INSERT policy.",
  );
  return lines.join("\n");
}

export function parseArgs(argv) {
  const extra = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--extra" && argv[i + 1]) {
      extra.push(argv[i + 1]);
      i++;
    }
  }
  return { roots: ["src", ...extra] };
}

// CLI wrapper — only runs when executed directly (not on import).
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  const { roots } = parseArgs(process.argv.slice(2));
  const hits = scanRoots(roots);
  if (hits.length === 0) {
    console.log(
      "✓ no direct client inserts into nug_events / unlocks / user_quests",
    );
    process.exit(0);
  }
  console.error("✗ forbidden direct inserts into gamification tables found:");
  for (const h of hits) {
    const path = h.file.split(sep).join("/");
    console.error(`  ${path}:${h.line}: ${h.snippet}  [${h.table}]`);
  }
  console.error(
    "\nUse the public.award_nugs SECURITY DEFINER RPC instead. " +
      "These tables have no client INSERT policy.",
  );
  process.exit(1);
}
