#!/usr/bin/env node
/**
 * Asserts Verdant's active physical sensor direction stays EcoWitt-only.
 *
 * Fails if any active source file, doc, test, fixture, prompt, or workflow
 * reintroduces a SwitchBot reference. The only files allowed to contain the
 * literal string `switchbot` (case-insensitive) are this scanner itself and
 * the historical removal report.
 *
 * Usage:
 *   node scripts/assert-ecowitt-only-sensor-direction.mjs
 *
 * Exit codes:
 *   0 — no SwitchBot references found in scanned files
 *   1 — one or more SwitchBot references found
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

const SCAN_DIRS = [
  "src",
  "docs",
  "scripts",
  "fixtures",
  "supabase",
  "templates",
  ".github",
];

const SCAN_EXTS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".sql",
  ".csv",
  ".html",
  ".sh",
]);

// Allow-list: these files document the removal and must mention the term.
const ALLOWED = new Set([
  "scripts/assert-ecowitt-only-sensor-direction.mjs",
  "docs/ecowitt-only-removal-report.md",
  "docs/ecowitt-only-sensor-direction.md",
]);

// Pattern hits SwitchBot, switchbot, switch_bot, switch-bot, "switch bot".
const PATTERN = /switch[\s_-]?bot/i;

/** @param {string} dir */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let s;
    try {
      s = statSync(p);
    } catch {
      continue;
    }
    if (s.isDirectory()) {
      if (name === "node_modules" || name === ".git" || name === "dist") continue;
      walk(p, out);
    } else {
      const dot = name.lastIndexOf(".");
      const ext = dot >= 0 ? name.slice(dot) : "";
      if (SCAN_EXTS.has(ext)) out.push(p);
    }
  }
  return out;
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
const offenders = [];

for (const f of files) {
  const rel = relative(ROOT, f).split(sep).join("/");
  if (ALLOWED.has(rel)) continue;
  const src = readFileSync(f, "utf8");
  const m = src.match(PATTERN);
  if (m) {
    const idx = src.slice(0, m.index ?? 0).split("\n").length;
    offenders.push(`${rel}:${idx}  → matched "${m[0]}"`);
  }
}

if (offenders.length > 0) {
  console.error(
    "✗ EcoWitt-only sensor direction violated. Found SwitchBot reference(s):",
  );
  for (const o of offenders) console.error("  " + o);
  console.error(
    "\nVerdant's active physical sensor path is EcoWitt-only. " +
      "Use EcoWitt equivalents (e.g. EcoWitt WH45 / WH31 / WH51, EcoWitt gateway).",
  );
  process.exit(1);
}

console.log(
  `✓ EcoWitt-only sensor direction OK — scanned ${files.length} files, no SwitchBot references.`,
);
