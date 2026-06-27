#!/usr/bin/env node
/**
 * assert-automated-phenotyping-docs-safety
 * ----------------------------------------
 * Static scanner for docs/automated-phenotyping-protocol-v1.0.md.
 *
 * Layered checks (all fail CI):
 *   1. Banned phrase scan (certainty-heavy labels, auto-decision wording).
 *      Lines explicitly annotated with the allow marker
 *        <!-- automated-phenotyping-docs-safety:allow -->
 *      are exempt — intended only for the "Avoid wording" block that
 *      documents the prohibited phrases.
 *   2. Diary Template required-field validation (Section 10).
 *   3. Filename Convention example validation (Section 11).
 *   4. Sample Filled Phenotyping Output Log validation (Section 13):
 *        - required columns present
 *        - filenames match the convention
 *        - photo_date matches the YYYY-MM-DD in the filename
 *        - rows with Low / Unknown confidence have blank Human Final
 *          Score
 *
 * Reports file, line number (when applicable), and a structured message.
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

// ─────────────────────────────────────────────────────────────────────────────
// 1. Banned phrases
// ─────────────────────────────────────────────────────────────────────────────

export const BANNED_PHRASES = [
  "Healthy_Leaf",
  "Stressed_Leaf",
  "Nutrient_Deficiency",
  "Pest_Damage",
  "Disease_Detected",
  "Diseased",
  { phrase: "Healthy", wordBoundary: true },
  { phrase: "Stressed", wordBoundary: true },
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
  const pattern = wordBoundary
    ? `(?<![A-Za-z0-9_])${body}(?![A-Za-z0-9_])`
    : body;
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
        violations.push({ line: i + 1, phrase, text: line.trim() });
      }
    }
  }
  return violations;
}

export function formatViolation(file, v) {
  return `${file}:${v.line} [banned-phrase "${v.phrase}"] ${v.text}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Section helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Extract the lines belonging to the section whose heading matches `headingRe`. */
export function extractSection(text, headingRe) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,6})\s+(.*)$/);
    if (!m) continue;
    if (start === -1) {
      if (headingRe.test(m[2])) {
        start = i;
        level = m[1].length;
      }
    } else if (m[1].length <= level) {
      return lines.slice(start, i).join("\n");
    }
  }
  return start === -1 ? "" : lines.slice(start).join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Diary Template required fields
// ─────────────────────────────────────────────────────────────────────────────

export const REQUIRED_DIARY_FIELDS = [
  "Plant ID",
  "Pheno ID",
  "Project / Line",
  "Generation",
  "Photo ID / File Name",
  "photo_date",
  "Stage",
  "View Type",
  "Tool / Method",
  "Source Type",
  "Confidence",
  "Human Review Status",
  "Human Final Score",
  "Missing Evidence",
  "Notes",
];

export function checkDiaryTemplate(text) {
  const violations = [];
  const section = extractSection(text, /Diary Entry Template/i);
  if (!section) {
    violations.push({ kind: "diary-template", message: "Section 'Diary Entry Template' not found." });
    return violations;
  }
  for (const field of REQUIRED_DIARY_FIELDS) {
    const re = new RegExp(`^${escapeRe(field)}\\s*:`, "mi");
    if (!re.test(section)) {
      violations.push({
        kind: "diary-template",
        message: `Diary Entry Template missing required field: '${field}:'`,
      });
    }
  }
  // Action Queue Draft must be present as grower-review-only label.
  if (!/Action Queue Draft\s*\/\s*Grower-review-only\s*:/i.test(section)) {
    violations.push({
      kind: "diary-template",
      message: "Diary Entry Template missing 'Action Queue Draft / Grower-review-only:' field.",
    });
  }
  return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Filename convention
// ─────────────────────────────────────────────────────────────────────────────

// {project}_{phenoId}_{stage}_{viewType}_{YYYY-MM-DD}_{NN}
// Hyphens allowed inside any field; underscores only between fields.
export const FILENAME_RE =
  /^([A-Za-z0-9-]+)_([A-Za-z0-9-]+)_([A-Za-z0-9-]+)_([A-Za-z0-9-]+)_(\d{4}-\d{2}-\d{2})_(\d{2})(?:\.[A-Za-z0-9]+)?$/;

export function parseFilename(name) {
  const m = String(name).trim().match(FILENAME_RE);
  if (!m) return null;
  return {
    project: m[1],
    phenoId: m[2],
    stage: m[3],
    viewType: m[4],
    date: m[5],
    sequence: m[6],
  };
}

export function checkFilenameExamples(text) {
  const violations = [];
  const section = extractSection(text, /Filename Convention/i);
  if (!section) {
    violations.push({ kind: "filename-convention", message: "Section 'Filename Convention' not found." });
    return violations;
  }
  // Match backtick-wrapped names and bare *.jpg names in headings/examples.
  const candidates = new Set();
  for (const m of section.matchAll(/`([^`\n]+?)`/g)) candidates.add(m[1]);
  for (const m of section.matchAll(/([A-Za-z0-9][A-Za-z0-9_-]+_\d{4}-\d{2}-\d{2}_\d{2}\.jpg)/g))
    candidates.add(m[1]);
  let exampleCount = 0;
  for (const c of candidates) {
    // Only validate things that look like filename examples (contain a date).
    if (!/\d{4}-\d{2}-\d{2}_\d{2}(\.[A-Za-z0-9]+)?$/.test(c)) continue;
    exampleCount++;
    if (!parseFilename(c)) {
      violations.push({
        kind: "filename-convention",
        message: `Filename example does not match convention: '${c}'`,
      });
    }
  }
  if (exampleCount === 0) {
    violations.push({
      kind: "filename-convention",
      message: "Filename Convention section contains no validatable example filenames.",
    });
  }
  return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Sample Filled Output Log
// ─────────────────────────────────────────────────────────────────────────────

export const REQUIRED_SAMPLE_LOG_COLUMNS = [
  "Pheno ID",
  "Plant ID",
  "Project / Line",
  "Generation",
  "Photo ID / File Name",
  "Photo Date",
  "Stage",
  "View Type",
  "Tool / Method",
  "Metric Name",
  "Automated Value",
  "Unit",
  "Confidence",
  "Source Type",
  "Human Review Status",
  "Human Final Score",
  "Notes",
  "Verdant Diary Reference",
  "Action Queue Draft",
];

export const LOW_CONFIDENCE_VALUES = new Set(["low", "unknown"]);

function parseMarkdownTable(sectionText) {
  const lines = sectionText.split(/\r?\n/);
  let headerIdx = -1;
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim().startsWith("|") && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || "")) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;
  const splitRow = (l) =>
    l
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((c) => c.trim());
  const headers = splitRow(lines[headerIdx]);
  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim().startsWith("|")) break;
    rows.push(splitRow(l));
  }
  return { headers, rows };
}

export function checkSampleOutputLog(text) {
  const violations = [];
  const section = extractSection(text, /Sample Filled Phenotyping Output Log/i);
  if (!section) {
    violations.push({
      kind: "sample-log",
      message: "Section 'Sample Filled Phenotyping Output Log' not found.",
    });
    return violations;
  }
  const table = parseMarkdownTable(section);
  if (!table) {
    violations.push({ kind: "sample-log", message: "Sample log table not found." });
    return violations;
  }
  const headerSet = new Set(table.headers);
  for (const col of REQUIRED_SAMPLE_LOG_COLUMNS) {
    if (!headerSet.has(col)) {
      violations.push({
        kind: "sample-log",
        message: `Sample log missing required column: '${col}'`,
      });
    }
  }
  // Column indices for per-row validation.
  const idx = (name) => table.headers.indexOf(name);
  const iFile = idx("Photo ID / File Name");
  const iDate = idx("Photo Date");
  const iConf = idx("Confidence");
  const iFinal = idx("Human Final Score");
  table.rows.forEach((row, rIdx) => {
    const rowLabel = `sample-log row ${rIdx + 1}`;
    // Filename + photo_date checks
    if (iFile >= 0) {
      const raw = row[iFile] ?? "";
      const parsed = parseFilename(raw);
      if (!parsed) {
        violations.push({
          kind: "sample-log",
          message: `${rowLabel}: Photo ID / File Name does not match filename convention: '${raw}'`,
        });
      } else if (iDate >= 0) {
        const dateCell = (row[iDate] ?? "").trim();
        if (dateCell !== parsed.date) {
          violations.push({
            kind: "sample-log",
            message: `${rowLabel}: Photo Date '${dateCell}' does not match date in filename '${parsed.date}'.`,
          });
        }
      }
    }
    // Low / Unknown confidence → Human Final Score must be blank.
    if (iConf >= 0 && iFinal >= 0) {
      const conf = (row[iConf] ?? "").trim().toLowerCase();
      const finalScore = (row[iFinal] ?? "").trim();
      if (LOW_CONFIDENCE_VALUES.has(conf) && finalScore !== "") {
        violations.push({
          kind: "sample-log",
          message: `${rowLabel}: Confidence is '${row[iConf]}' but Human Final Score is '${finalScore}' (must be blank).`,
        });
      }
    }
  });
  return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

export function runAllChecks(text) {
  return {
    phraseViolations: scanText(text),
    diaryViolations: checkDiaryTemplate(text),
    filenameViolations: checkFilenameExamples(text),
    sampleLogViolations: checkSampleOutputLog(text),
  };
}

function main() {
  if (!existsSync(TARGET_FILE)) {
    console.error(
      `automated-phenotyping-docs-safety: target file missing: ${relative(ROOT, TARGET_FILE)}`,
    );
    process.exit(1);
  }
  const rel = relative(ROOT, TARGET_FILE);
  const text = readFileSync(TARGET_FILE, "utf8");
  const { phraseViolations, diaryViolations, filenameViolations, sampleLogViolations } =
    runAllChecks(text);

  for (const v of phraseViolations) console.error(formatViolation(rel, v));
  for (const v of diaryViolations) console.error(`${rel} [${v.kind}] ${v.message}`);
  for (const v of filenameViolations) console.error(`${rel} [${v.kind}] ${v.message}`);
  for (const v of sampleLogViolations) console.error(`${rel} [${v.kind}] ${v.message}`);

  const total =
    phraseViolations.length +
    diaryViolations.length +
    filenameViolations.length +
    sampleLogViolations.length;

  if (total) {
    console.error(
      `\nautomated-phenotyping-docs-safety: ${total} violation(s) in ${rel} ` +
        `(banned-phrase=${phraseViolations.length}, diary-template=${diaryViolations.length}, ` +
        `filename-convention=${filenameViolations.length}, sample-log=${sampleLogViolations.length}).`,
    );
    process.exit(1);
  }
  console.log(`automated-phenotyping-docs-safety: OK (${rel}).`);
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("assert-automated-phenotyping-docs-safety.mjs");
if (invokedDirectly) main();
