#!/usr/bin/env node
/**
 * assert-automated-phenotyping-docs-safety
 * ----------------------------------------
 * Static scanner for docs/automated-phenotyping-protocol-v1.0.md.
 *
 * Fails CI if banned certainty-heavy labels or unsafe wording appear
 * on any line that is NOT explicitly annotated with the allow marker:
 *
 *   <!-- automated-phenotyping-docs-safety:allow -->
 *
 * The allow marker is intended only for lines that explicitly document
 * the prohibited wording (e.g. the "Avoid wording" / "Do not use"
 * block).
 *
 * Reports file, line number, and matched phrase.
 *
 * Usage:
 *   node scripts/assert-automated-phenotyping-docs-safety.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
export const TARGET_FILE = join(
  ROOT,
  "docs",
  "automated-phenotyping-protocol-v1.0.md",
);
export const ALLOW_MARKER = "automated-phenotyping-docs-safety:allow";

/** Banned phrases. Whole-phrase, case-insensitive match. */
export const BANNED_PHRASES = [
  // Legacy certainty-heavy class names
  "Healthy_Leaf",
  "Stressed_Leaf",
  "Nutrient_Deficiency",
  "Pest_Damage",
  "Disease_Detected",
  "Diseased",
  // Single-word certainty labels — match as standalone tokens only.
  { phrase: "Healthy", wordBoundary: true },
  { phrase: "Stressed", wordBoundary: true },
  // Certainty / automation wording
  "Guaranteed harvest ready",
  "AI approved",
  "AI selected",
  "automatically cull",
  "auto-release",
  "guaranteed healthy",
  "diagnosed from photo",
  "Action Queue item created automatically",
  "automatically creates Action Queue",
  "automated keeper decision",
  "automated cull decision",
  "automated release decision",
];

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compile(entry) {
  if (typeof entry === "string") {
    return { phrase: entry, re: new RegExp(escapeRe(entry), "i") };
  }
  const { phrase, wordBoundary } = entry;
  const body = escapeRe(phrase);
  const pattern = wordBoundary ? `(?<![A-Za-z0-9_])${body}(?![A-Za-z0-9_])` : body;
  return { phrase, re: new RegExp(pattern, "i") };
}

export function scanText(text) {
  const compiled = BANNED_PHRASES.map(compile);
  const lines = text.split(/\r?\n/);
  const violations = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes(ALLOW_MARKER)) continue;
    for (const { phrase, re } of compiled) {
      if (re.test(line)) {
        violations.push({
          line: i + 1,
          phrase,
          text: line.trim(),
        });
      }
    }
  }
  return violations;
}

export function formatViolation(file, v) {
  return `${file}:${v.line} [banned-phrase "${v.phrase}"] ${v.text}`;
}

function main() {
  if (!existsSync(TARGET_FILE)) {
    console.error(
      `automated-phenotyping-docs-safety: target file missing: ${relative(ROOT, TARGET_FILE)}`,
    );
    process.exit(1);
  }
  const rel = relative(ROOT, TARGET_FILE);
  const violations = scanText(readFileSync(TARGET_FILE, "utf8"));
  if (violations.length) {
    for (const v of violations) console.error(formatViolation(rel, v));
    console.error(
      `\nautomated-phenotyping-docs-safety: ${violations.length} violation(s) in ${rel}.`,
    );
    process.exit(1);
  }
  console.log(`automated-phenotyping-docs-safety: OK (${rel}).`);
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("assert-automated-phenotyping-docs-safety.mjs");
if (invokedDirectly) main();
