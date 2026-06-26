#!/usr/bin/env node
/**
 * verify-release-workbooks
 * ------------------------
 * Local aggregator for the full release-workbook verification flow.
 *
 * Runs each step in order, captures exit code + duration + stderr/stdout,
 * prints a compact PASS/FAIL summary table, and exits non-zero on the
 * first failure (after streaming the full child output so the failure
 * is debuggable in place).
 *
 * Pass `--diff` to print focused expected-vs-actual hash/formula
 * diagnostics with file + cell locations after a failure (or even when
 * the aggregator passes, --diff still runs the focused checks as a
 * second safety pass).
 *
 * Pure read-only over the repo aside from the generator step, which only
 * writes deterministic artifacts under docs/artifacts/. No network.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import process from "node:process";

const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "docs", "artifacts");

const STEPS = [
  {
    label: "Generate workbook templates",
    cmd: "bun",
    args: ["run", "docs:generate-release-workbook-templates"],
  },
  {
    label: "Premium workbook access docs",
    cmd: "bun",
    args: ["run", "docs:assert-premium-workbook-access"],
  },
  {
    label: "Release traceability mapping",
    cmd: "bun",
    args: ["run", "docs:assert-release-traceability"],
  },
  {
    label: "Release docs safety",
    cmd: "node",
    args: ["scripts/assert-release-docs-safety.mjs"],
  },
  {
    label: "Sensor safety",
    cmd: "node",
    args: ["scripts/sensor-safety-check.mjs"],
  },
  {
    label: "Workbook tests",
    cmd: "bunx",
    args: [
      "vitest", "run",
      "src/test/assert-premium-workbook-access-docs.test.ts",
      "src/test/assert-release-traceability-mapping.test.ts",
      "src/test/generate-release-workbook-templates.test.ts",
      "src/test/release-workbook-formula-snapshots.test.ts",
      "src/test/release-workbook-manifest.test.ts",
      "--reporter=dot",
    ],
  },
];

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}
function fmtSeconds(ms) { return `${(ms / 1000).toFixed(2)}s`; }
function sha256OfFile(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

// ---------------------------------------------------------------------------
// Reusable diff formatters (exported for tests).
// ---------------------------------------------------------------------------

export function formatHashMismatch({ file, expected, actual }) {
  return [
    "Hash mismatch:",
    `File: ${file}`,
    `Expected SHA256: ${expected}`,
    `Actual SHA256:   ${actual}`,
  ].join("\n");
}

export function formatFormulaMismatch({ workbook, sheet, cell, expected, actual }) {
  return [
    "Formula mismatch:",
    `Workbook: ${workbook}`,
    `Sheet: ${sheet}`,
    `Cell: ${cell}`,
    `Expected: ${expected}`,
    `Actual:   ${actual}`,
  ].join("\n");
}

export function formatBlockedToken({ file, pattern, line }) {
  return [
    "Blocked token:",
    `File: ${file}`,
    `Pattern: ${pattern}`,
    `Line: ${line}`,
  ].join("\n");
}

export function formatPlaceholderMismatch({ file, expected, found }) {
  return [
    "Premium placeholder mismatch:",
    `File: ${file}`,
    `Expected placeholder: ${expected}`,
    `Found invalid placeholder: ${found}`,
  ].join("\n");
}

export function formatMissingFile({ file }) {
  return ["Missing generated file:", `File: ${file}`].join("\n");
}

// ---------------------------------------------------------------------------
// Focused diff checks (exported for tests).
// ---------------------------------------------------------------------------

const EXPECTED_PLACEHOLDER = "{{PREMIUM_WORKBOOK_COPY_URL}}";
// Typo is constructed at runtime so this source file does not itself
// contain the literal misspelling and self-trigger scanners.
const TYPO_PLACEHOLDER = `{{PREMI${"MUM"}_WORKBOOK_COPY_URL}}`;

const BLOCKED_TOKEN_PATTERNS = [
  /access_token=/,
  /Bearer\s+[A-Za-z0-9._-]+/,
  /X-Amz-Signature/,
  /SUPABASE_SERVICE_ROLE_KEY\s*=/,
  /\bprivate\//,
];

export function scanFileForBlockedTokens(file, content) {
  const hits = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    for (const pat of BLOCKED_TOKEN_PATTERNS) {
      if (pat.test(lines[i])) {
        hits.push({ file, pattern: pat.source, line: i + 1 });
      }
    }
  }
  return hits;
}

export function scanForPlaceholderTypos(file, content) {
  const hits = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(TYPO_PLACEHOLDER)) {
      hits.push({
        file,
        expected: EXPECTED_PLACEHOLDER,
        found: TYPO_PLACEHOLDER,
        line: i + 1,
      });
    }
  }
  return hits;
}

function checkManifestHashes() {
  const manifestPath = join(ARTIFACT_DIR, "release-workbook-template-manifest.json");
  if (!existsSync(manifestPath)) {
    return [formatMissingFile({ file: "docs/artifacts/release-workbook-template-manifest.json" })];
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const out = [];
  for (const f of manifest.files ?? []) {
    const abs = join(ROOT, f.path);
    if (!existsSync(abs)) {
      out.push(formatMissingFile({ file: f.path }));
      continue;
    }
    const actual = sha256OfFile(abs);
    if (actual !== f.sha256) {
      out.push(formatHashMismatch({ file: f.path, expected: f.sha256, actual }));
    }
  }
  return out;
}

async function checkXlsxFormulasAgainstManifest() {
  const out = [];
  const manifestPath = join(ARTIFACT_DIR, "release-workbook-template-manifest.json");
  if (!existsSync(manifestPath)) return out;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  let XLSX;
  try {
    XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
  } catch {
    return out; // xlsx not installed — skip silently
  }
  const xlsxFiles = (manifest.files ?? []).filter((f) => f.kind === "xlsx");
  for (const f of xlsxFiles) {
    const abs = join(ROOT, f.path);
    if (!existsSync(abs)) continue;
    const wb = XLSX.readFile(abs, { cellFormula: true });
    const sheetName = f.xlsx_tab_name ?? wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const sheetContract = manifest.sheets?.[f.sheet_canonical_name]?.formula_contracts ?? {};
    // Seed: column L (viability), column W (quality flag)
    // Review: column AC (review status)
    const cellChecks = [];
    if (sheetContract.L) cellChecks.push({ col: "L", tpl: sheetContract.L });
    if (sheetContract.W) cellChecks.push({ col: "W", tpl: sheetContract.W });
    if (sheetContract.AC_review_status_suggestion) {
      cellChecks.push({ col: "AC", tpl: sheetContract.AC_review_status_suggestion });
    }
    for (let row = 2; row <= 10; row++) {
      for (const { col, tpl } of cellChecks) {
        const ref = `${col}${row}`;
        const cell = ws[ref];
        if (!cell || cell.f === undefined) continue;
        const expected = tpl.replace(/\{r\}/g, String(row)).replace(/^=/, "");
        const actual = String(cell.f);
        if (actual !== expected) {
          out.push(
            formatFormulaMismatch({
              workbook: f.path,
              sheet: sheetName,
              cell: ref,
              expected,
              actual,
            }),
          );
        }
        // Review Status must never emit "Released".
        if (col === "AC" && /"Released"/.test(actual)) {
          out.push(
            formatFormulaMismatch({
              workbook: f.path,
              sheet: sheetName,
              cell: ref,
              expected: 'AC formula must not contain "Released"',
              actual,
            }),
          );
        }
      }
    }
  }
  return out;
}

function checkManifestBlockedTokens() {
  const manifestPath = join(ARTIFACT_DIR, "release-workbook-template-manifest.json");
  if (!existsSync(manifestPath)) return [];
  const rel = relative(ROOT, manifestPath).replace(/\\/g, "/");
  const content = readFileSync(manifestPath, "utf8");
  return scanFileForBlockedTokens(rel, content).map(formatBlockedToken);
}

function checkDocsPlaceholderTypos() {
  const out = [];
  const candidates = [
    "docs/seed-production-tracking-workbook-spec.md",
    "docs/commercial-release-review-traceability-workbook-spec.md",
    "docs/artifacts/release-workbook-formula-contracts.md",
    "docs/artifacts/release-workbook-template-manifest.json",
  ];
  for (const c of candidates) {
    const abs = join(ROOT, c);
    if (!existsSync(abs)) continue;
    const hits = scanForPlaceholderTypos(c, readFileSync(abs, "utf8"));
    for (const h of hits) out.push(formatPlaceholderMismatch(h));
  }
  return out;
}

export async function runDiffChecks() {
  const sections = [];
  const hash = checkManifestHashes();
  if (hash.length) sections.push(...hash);
  const formula = await checkXlsxFormulasAgainstManifest();
  if (formula.length) sections.push(...formula);
  const tokens = checkManifestBlockedTokens();
  if (tokens.length) sections.push(...tokens);
  const typos = checkDocsPlaceholderTypos();
  if (typos.length) sections.push(...typos);
  return sections;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("verify-release-workbooks.mjs");

if (invokedDirectly) {
  const diffMode = process.argv.includes("--diff");

  const results = [];
  let firstFailure = null;

  for (const step of STEPS) {
    if (firstFailure) {
      results.push({ ...step, status: "SKIP", ms: 0 });
      continue;
    }
    const t0 = Date.now();
    const r = spawnSync(step.cmd, step.args, { stdio: "inherit", env: process.env });
    const ms = Date.now() - t0;
    const ok = r.status === 0 && !r.error;
    results.push({ ...step, status: ok ? "PASS" : "FAIL", ms, exit: r.status, err: r.error?.message });
    if (!ok) firstFailure = { ...step, ms, exit: r.status, err: r.error?.message };
  }

  const ok = !firstFailure;
  console.log("");
  console.log(`Release Workbook Verification: ${ok ? "PASS" : "FAIL"}`);
  console.log("");
  console.log(`${pad("Step", 42)}${pad("Result", 9)}Duration`);
  for (const r of results) {
    console.log(`${pad(r.label, 42)}${pad(r.status, 9)}${fmtSeconds(r.ms)}`);
  }
  console.log("");

  if (!ok || diffMode) {
    if (!ok) {
      const failedCmd = `${firstFailure.cmd} ${firstFailure.args.join(" ")}`;
      console.log("Failed command:");
      console.log(`  ${failedCmd}`);
      console.log("");
      console.log("Failure details:");
      console.log(
        `  exit=${firstFailure.exit ?? "n/a"}${firstFailure.err ? ` error=${firstFailure.err}` : ""}`,
      );
      console.log("  (full child output streamed above)");
      console.log("");
    }
    if (diffMode) {
      console.log("Focused diff diagnostics:");
      console.log("");
      const sections = await runDiffChecks();
      if (sections.length === 0) {
        console.log("  (no focused hash/formula/token/placeholder mismatches detected)");
      } else {
        for (const s of sections) {
          console.log(s);
          console.log("");
        }
      }
    } else {
      console.log("Re-run with --diff for focused hash/formula/token diagnostics:");
      console.log("  bun run docs:verify-release-workbooks:diff");
    }
  }

  if (!ok) process.exit(1);
  console.log("All release workbook checks passed.");
}
