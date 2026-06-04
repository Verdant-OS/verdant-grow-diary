#!/usr/bin/env node
/**
 * Asserts the legacy → canonical VPD stage mapping table is owned by
 * exactly one file. Fails if any other file inlines the mapping pairs.
 *
 * Allow-list:
 *   - src/lib/vpdStageNormalizationRules.ts
 *   - src/test/vpd-stage-normalization-rules.test.ts
 *   - docs/vpd-stage-vocabulary.md
 *   - scripts/assert-vpd-stage-normalization-ownership.mjs
 *
 * Detected patterns (per legacy → canonical pair, same line):
 *   veg: "late_veg"
 *   "veg": "late_veg"
 *   'veg': 'late_veg'
 *   veg => "late_veg"     veg = "late_veg"
 *   veg -> late_veg       veg --> late_veg
 *
 * Pure / read-only. No I/O against Supabase. No automation.
 *
 * Usage:
 *   node scripts/assert-vpd-stage-normalization-ownership.mjs
 *
 * Exit codes:
 *   0 — no duplicate mapping found
 *   1 — duplicate mapping found (prints file path + matching line)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = process.cwd();

const SCAN_DIRS = ["src", "docs", "scripts", "supabase", "templates", ".github"];

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
]);

const ALLOWED = new Set(
  [
    "src/lib/vpdStageNormalizationRules.ts",
    "src/test/vpd-stage-normalization-rules.test.ts",
    "docs/vpd-stage-vocabulary.md",
    "scripts/assert-vpd-stage-normalization-ownership.mjs",
  ].map((p) => p.split("/").join(sep)),
);

/** Documented legacy → canonical pairs. */
const PAIRS = [
  ["veg", "late_veg"],
  ["preflower", "early_flower"],
  ["flower", "mid_late_flower"],
  ["late_flower", "mid_late_flower"],
];

/**
 * Build per-pair regexes that flag a same-line mapping declaration. The
 * `veg` legacy token is matched on a word boundary so it does not also
 * match `early_veg` / `late_veg`.
 */
function buildPairRegex([legacy, canonical]) {
  // Negative lookbehind on `_` so "early_veg" / "late_veg" don't match.
  const lhsToken = `(?<![A-Za-z0-9_])${legacy}(?![A-Za-z0-9_])`;
  // Optional quotes around either side, then a mapping separator, then RHS.
  // Separators we flag: `:`, `=`, `=>`, `->`, `-->`.
  const sep = `\\s*(?::|=>|=|-->|->)\\s*`;
  const rhs = `(["'\\s])?${canonical}\\b`;
  return new RegExp(`(["'])?${lhsToken}\\1?${sep}${rhs}`);
}

const PAIR_REGEXES = PAIRS.map(([l, c]) => ({
  legacy: l,
  canonical: c,
  regex: buildPairRegex([l, c]),
}));

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
  const rel = relative(ROOT, f);
  if (ALLOWED.has(rel)) continue;
  const src = readFileSync(f, "utf8");
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { legacy, canonical, regex } of PAIR_REGEXES) {
      if (regex.test(line)) {
        offenders.push({
          file: rel.split(sep).join("/"),
          lineNumber: i + 1,
          legacy,
          canonical,
          line: line.trim(),
        });
      }
    }
  }
}

if (offenders.length > 0) {
  console.error(
    "✗ VPD stage mapping ownership violated. The legacy→canonical table",
  );
  console.error(
    "  must live ONLY in src/lib/vpdStageNormalizationRules.ts.",
  );
  console.error("  Duplicate mappings found:");
  for (const o of offenders) {
    console.error(
      `  ${o.file}:${o.lineNumber}  → ${o.legacy} -> ${o.canonical}`,
    );
    console.error(`      ${o.line}`);
  }
  process.exit(1);
}

console.log(
  `✓ VPD stage mapping ownership OK — scanned ${files.length} files, no duplicates.`,
);
