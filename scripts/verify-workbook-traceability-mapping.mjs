#!/usr/bin/env node
/**
 * verify-workbook-traceability-mapping
 * ------------------------------------
 * Documentation-level validator for the cross-sheet traceability table in
 * `docs/commercial-release-review-traceability-workbook-spec.md` §12.
 *
 * It enforces that the documented `From` / `To` cross-sheet references:
 *   1. Use known sheet names (referenced sheets must be specs we know
 *      about — Seed_Production_Tracking, Commercial_Release_Review_*,
 *      Commercial_Release_Checklist, Pheno_Comparison_v2_Enhanced,
 *      F1_Population_Tracker, Backcross_Line_Development,
 *      F2_Stabilization_Tracker, or a Verdant diary reference).
 *   2. Reference a stable ID-like column on each side (column letter +
 *      field name, or "Row ID" / "Checklist ID" / "Pheno ID" / etc.),
 *      not just a free-text field.
 *   3. Are present for every required mapping listed in REQUIRED_MAPPINGS
 *      below — the contract the spec promises to consumers.
 *
 * Pure read-only. No network. Exits 1 on missing or inconsistent mappings.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const SPEC = join(
  ROOT,
  "docs",
  "commercial-release-review-traceability-workbook-spec.md",
);

const KNOWN_SHEETS = new Set([
  "Seed_Production_Tracking",
  "Commercial_Release_Review_Traceability",
  "Commercial_Release_Checklist",
  "Pheno_Comparison_v2_Enhanced",
  "F1_Population_Tracker",
  "Backcross_Line_Development",
  "F2_Stabilization_Tracker",
]);

// Generic targets allowed on the `To` side that aren't a sheet but are
// referenced as evidence buckets.
const GENERIC_TARGETS = [
  /verdant diary/i,
  /draft text only/i,
];

const ID_LIKE = /(\bid\b|row id|checklist id|pheno id|line id|backcross line id|seed lot id|review id|column [A-Z]\b|\.[A-Z]{1,2}\s|`[A-Z]{1,2}\s)/i;

// Mappings the spec is required to publish. Each is matched loosely
// against the table rows (substring on `from` AND `to`, case-insensitive).
const REQUIRED_MAPPINGS = [
  {
    label: "Seed Lot ID → Commercial Release Review.Seed Lot ID",
    from: /seed_production_tracking.*seed lot id/i,
    to: /commercial_release_review_traceability.*seed lot id/i,
  },
  {
    label: "Seed Production → Commercial Release Checklist Row",
    from: /seed_production_tracking.*linked commercial checklist row/i,
    to: /commercial_release_checklist/i,
  },
  {
    label: "Commercial Release Review → Commercial Release Checklist",
    from: /commercial_release_review_traceability.*linked commercial release checklist/i,
    to: /commercial_release_checklist/i,
  },
  {
    label: "Commercial Release Review → Pheno Comparison",
    from: /commercial_release_review_traceability.*linked pheno comparison/i,
    to: /pheno_comparison_v2_enhanced/i,
  },
  {
    label: "Commercial Release Review → F1 / Backcross / Stabilization",
    from: /commercial_release_review_traceability.*linked f1 \/ backcross \/ stabilization/i,
    to: /(f1_population_tracker|backcross_line_development|f2_stabilization_tracker)/i,
  },
  {
    label: "Commercial Release Review → Verdant diary evidence",
    from: /commercial_release_review_traceability.*verdant diary evidence/i,
    to: /verdant diary/i,
  },
];

function extractTraceabilityTable(text) {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+12\.\s+Cross-Sheet Traceability Mapping/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection && /^##\s+\d+\./.test(line)) break;
    if (!inSection) continue;
    if (!line.startsWith("|")) continue;
    // Skip header + alignment rows.
    if (/^\|\s*-+/.test(line) || /^\|\s*From\s*\|/i.test(line)) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length >= 3) {
      rows.push({ from: cells[0], to: cells[1], requiredFor: cells[2], lineNumber: i + 1 });
    }
  }
  return rows;
}

function checkRow(row) {
  const problems = [];
  const fromSheet = row.from.split(".")[0].replace(/[`*_]/g, "").trim();
  const toSheet = row.to.split(".")[0].replace(/[`*_]/g, "").trim();

  // Validate sheet membership for `from` (must be a known sheet).
  if (!KNOWN_SHEETS.has(fromSheet)) {
    problems.push(`from-sheet unknown: "${fromSheet}"`);
  }
  // Validate `to` is a known sheet OR an allowed generic target.
  const toKnown =
    KNOWN_SHEETS.has(toSheet) || GENERIC_TARGETS.some((re) => re.test(row.to));
  if (!toKnown) {
    problems.push(`to-target unknown: "${toSheet}"`);
  }
  // Validate ID-shaped reference on both sides.
  if (!ID_LIKE.test(row.from)) {
    problems.push(`from side lacks ID-shaped column reference`);
  }
  if (!ID_LIKE.test(row.to) && !GENERIC_TARGETS.some((re) => re.test(row.to))) {
    problems.push(`to side lacks ID-shaped column reference`);
  }
  return problems;
}

function main() {
  let text;
  try {
    text = readFileSync(SPEC, "utf8");
  } catch (e) {
    console.error(`Spec not found: ${SPEC}`);
    process.exit(1);
  }

  const rows = extractTraceabilityTable(text);
  if (rows.length === 0) {
    console.error("traceability-mapping: §12 Cross-Sheet Traceability Mapping table not found or empty.");
    process.exit(1);
  }

  let failures = 0;

  // Row-level checks.
  for (const row of rows) {
    const problems = checkRow(row);
    if (problems.length) {
      failures += problems.length;
      for (const p of problems) {
        console.error(`${SPEC}:${row.lineNumber} [mapping-row] ${p} — from="${row.from}" to="${row.to}"`);
      }
    }
  }

  // Required-mapping presence checks.
  const missing = [];
  for (const req of REQUIRED_MAPPINGS) {
    const hit = rows.some((r) => req.from.test(r.from) && req.to.test(r.to));
    if (!hit) missing.push(req.label);
  }
  if (missing.length) {
    failures += missing.length;
    for (const m of missing) {
      console.error(`traceability-mapping: required mapping missing — ${m}`);
    }
  }

  if (failures) {
    console.error(
      `\ntraceability-mapping: ${failures} issue(s) across ${rows.length} mapping row(s).`,
    );
    process.exit(1);
  }
  console.log(
    `traceability-mapping: OK (${rows.length} mapping row(s), ${REQUIRED_MAPPINGS.length} required mapping(s) present).`,
  );
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("verify-workbook-traceability-mapping.mjs");
if (invokedDirectly) main();
