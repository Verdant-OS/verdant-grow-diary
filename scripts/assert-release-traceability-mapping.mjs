#!/usr/bin/env node
/**
 * assert-release-traceability-mapping
 * -----------------------------------
 * Documentation-level validator (no live workbook parsing, no network).
 *
 * Validates that the Seed Production + Commercial Release Review specs
 * document the required cross-sheet ID mappings AND the required
 * traceability rules from the v1.3 contract.
 *
 * Inputs:
 *   - docs/seed-production-tracking-workbook-spec.md
 *   - docs/commercial-release-review-traceability-workbook-spec.md
 *
 * Exits 1 with STOP-SHIP on any missing mapping or missing rule.
 */
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const COMMERCIAL_SPEC = join(
  ROOT,
  "docs",
  "commercial-release-review-traceability-workbook-spec.md",
);
const SEED_SPEC = join(
  ROOT,
  "docs",
  "seed-production-tracking-workbook-spec.md",
);

export const REQUIRED_MAPPINGS = [
  {
    label: "Seed Production → Commercial Release Review (Seed Lot ID)",
    fromRe: /seed_production_tracking.*\ba seed lot id\b/i,
    toRe: /commercial_release_review_traceability.*\bc seed lot id\b/i,
  },
  {
    label: "Seed Production → Commercial Release Checklist Row",
    fromRe: /seed_production_tracking.*\by linked commercial checklist row\b/i,
    toRe: /commercial_release_checklist.*row id.*checklist id/i,
  },
  {
    label: "Commercial Release Review → Commercial Release Checklist",
    fromRe: /commercial_release_review_traceability.*\bi linked commercial release checklist row\b/i,
    toRe: /commercial_release_checklist.*row id.*checklist id/i,
  },
  {
    label: "Commercial Release Review → Pheno Comparison",
    fromRe: /commercial_release_review_traceability.*\bj linked pheno comparison row\(s\)/i,
    toRe: /pheno_comparison_v2_enhanced.*(phase\/pheno row id|pheno id)/i,
  },
  {
    label: "Commercial Release Review → F1 / Backcross / Stabilization",
    fromRe: /commercial_release_review_traceability.*\bk linked f1 \/ backcross \/ stabilization row\(s\)/i,
    toRe: /(f1_population_tracker.*project or row id|backcross_line_development.*backcross line id|f2_stabilization_tracker.*line id)/i,
  },
  {
    label: "Commercial Release Review → Verdant Diary Evidence",
    fromRe: /commercial_release_review_traceability.*verdant diary evidence/i,
    toRe: /verdant diary/i,
  },
  {
    label: "Commercial Release Review → Action Queue Draft (draft-only)",
    fromRe: /commercial_release_review_traceability.*verdant action queue draft/i,
    toRe: /draft text only/i,
  },
];

export const REQUIRED_RULES = [
  {
    label: "Seed Lot ID uniqueness in Seed_Production_Tracking",
    re: /\bseed lot id\b[^.\n]*(must be )?\bunique\b[^.\n]*seed_production_tracking|\bunique\b[^.\n]*\bseed lot id\b/i,
  },
  {
    label: "Commercial Release Review rows reference exactly one Seed Lot ID",
    re: /(exactly one|single)\s+seed lot id|reference[s]?\s+one\s+seed lot id/i,
  },
  {
    label: "Multiple review rows per Seed Lot allowed only with unique Release Review ID + Review Date",
    re: /unique\s+release review id[^.\n]*review date|release review id[^.\n]*review date[^.\n]*unique/i,
  },
  {
    label: "Stable human-readable row/checklist IDs preferred over fragile row numbers",
    re: /stable[^.\n]*(row id|checklist id|human-readable)[^.\n]*(avoid|not[^.\n]*fragile|instead of[^.\n]*row number)|human-readable row ids[^.\n]*checklist ids/i,
  },
  {
    label: "Broken/missing references increment Missing Evidence Count",
    re: /(broken|missing) references? (increment|count toward|add to|raise)[^.\n]*missing evidence count/i,
  },
  {
    label: "Missing references → review/hold signal only, never automatic rejection or release",
    re: /(review.*hold|hold.*signal|signals?[^.\n]*only)[^.\n]*(not automatic|never automatic|no automatic).*(release|reject)|never automatically (release|reject)/i,
  },
  {
    label: "Action Queue items must not be created automatically",
    re: /(must )?not (create|automatically create) action queue items? automatically|no automatic action queue creation/i,
  },
];

function check(text, rules) {
  const missing = [];
  for (const r of rules) {
    if (!r.re.test(text)) missing.push(r.label);
  }
  return missing;
}

export function checkMappings(commercialText) {
  const missing = [];
  for (const m of REQUIRED_MAPPINGS) {
    // The mapping table rows are markdown rows; collapse the file to
    // single-line matchable chunks (pipe-delimited rows) and check
    // each row contains both `fromRe` and `toRe`.
    const rows = commercialText
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith("|"));
    const hit = rows.some((r) => m.fromRe.test(r) && m.toRe.test(r));
    if (!hit) missing.push(m.label);
  }
  return missing;
}

function main() {
  let commercialText;
  let seedText;
  try {
    commercialText = readFileSync(COMMERCIAL_SPEC, "utf8");
  } catch {
    console.error(`Spec not found: ${COMMERCIAL_SPEC}`);
    process.exit(1);
  }
  try {
    seedText = readFileSync(SEED_SPEC, "utf8");
  } catch {
    console.error(`Spec not found: ${SEED_SPEC}`);
    process.exit(1);
  }

  const combined = `${commercialText}\n\n---\n\n${seedText}`;

  const missingMappings = checkMappings(commercialText);
  const missingRules = check(combined, REQUIRED_RULES);

  let failures = 0;
  for (const m of missingMappings) {
    failures++;
    console.error(
      `${relative(ROOT, COMMERCIAL_SPEC)}: missing required mapping — ${m}`,
    );
  }
  for (const m of missingRules) {
    failures++;
    console.error(
      `release-traceability-mapping: missing required rule — ${m}`,
    );
  }

  if (failures) {
    console.error(
      `\nrelease-traceability-mapping: STOP-SHIP (${missingMappings.length}/${REQUIRED_MAPPINGS.length} mapping(s) missing, ${missingRules.length}/${REQUIRED_RULES.length} rule(s) missing).`,
    );
    process.exit(1);
  }
  console.log(
    `release-traceability-mapping: PASS (${REQUIRED_MAPPINGS.length} mapping(s), ${REQUIRED_RULES.length} rule(s) all present).`,
  );
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("assert-release-traceability-mapping.mjs");
if (invokedDirectly) main();
