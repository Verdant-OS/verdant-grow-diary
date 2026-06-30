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
 */
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";

const TABLES = ["nug_events", "unlocks", "user_quests"];
// Match `.from("X").insert(` and `.from('X').insert(` across whitespace/newlines.
const PATTERN = new RegExp(
  String.raw`\.from\(\s*['"](` + TABLES.join("|") + String.raw`)['"]\s*\)\s*\.insert\(`,
  "g",
);

// Files we never scan, even if reachable via --extra:
//   - the scanner's own self-test (intentionally contains forbidden strings).
const EXCLUDE_BASENAMES = new Set([
  "scan-gamification-direct-inserts.test.ts",
]);

const args = process.argv.slice(2);
const extra = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--extra" && args[i + 1]) {
    extra.push(args[i + 1]);
    i++;
  }
}
const roots = ["src", ...extra];

const SCANNABLE_EXT = /\.(ts|tsx|js|mjs|cjs|jsx)$/;

function walk(root) {
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

// Deduplicate hits by file + match index so the same direct insert can only
// be counted once even if a root is supplied twice.
const seen = new Set();
const hits = [];
for (const root of roots) {
  const files = walk(root);
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    PATTERN.lastIndex = 0;
    let m;
    while ((m = PATTERN.exec(content)) !== null) {
      const key = `${file}:${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);
      // Compute 1-indexed line number for human-readable output.
      const line = content.slice(0, m.index).split("\n").length;
      hits.push({ file, line, table: m[1], snippet: m[0] });
    }
  }
}

if (hits.length === 0) {
  console.log(
    "✓ no direct client inserts into nug_events / unlocks / user_quests",
  );
  process.exit(0);
}

console.error("✗ forbidden direct inserts into gamification tables found:");
for (const h of hits) {
  // Normalize path separator for consistent output across platforms.
  const path = h.file.split(sep).join("/");
  console.error(`  ${path}:${h.line}: ${h.snippet}  [${h.table}]`);
}
console.error(
  "\nUse the public.award_nugs SECURITY DEFINER RPC instead. " +
    "These tables have no client INSERT policy.",
);
process.exit(1);
