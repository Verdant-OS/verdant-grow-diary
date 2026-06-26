#!/usr/bin/env node
/**
 * generate-release-workbook-templates
 * -----------------------------------
 * Generates docs-only workbook template artifacts that match the v1.3
 * Seed Production Tracking and Commercial Release Review specs.
 *
 * Outputs:
 *   - docs/artifacts/seed-production-tracking-v1.3-template.xlsx
 *   - docs/artifacts/commercial-release-review-traceability-v1.3-template.xlsx
 *   - docs/artifacts/seed-production-tracking-v1.3-template.csv
 *   - docs/artifacts/commercial-release-review-traceability-v1.3-template.csv
 *   - docs/artifacts/release-workbook-formula-contracts.md
 *   - docs/artifacts/release-workbook-template-manifest.json
 *
 * If the `xlsx` package is unavailable, XLSX generation is skipped and
 * reported as "blocked by missing dependency" while CSV + contracts +
 * manifest are still produced.
 *
 * Pure read-only over the repo. No network. No app behavior.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const ARTIFACT_DIR = join(ROOT, "docs", "artifacts");
mkdirSync(ARTIFACT_DIR, { recursive: true });

// ============================================================
// Schemas
// ============================================================

export const SEED_PRODUCTION_SHEET = "Seed_Production_Tracking";
export const SEED_PRODUCTION_HEADERS = [
  "A Seed Lot ID",
  "B Project / Line",
  "C Generation",
  "D Female Parent",
  "E Male Parent",
  "F Pollination Date",
  "G Isolation Method",
  "H Seed Harvest Date",
  "I Dry / Cure Start Date",
  "J Total Seeds Collected",
  "K Cleaned / Viable Seeds",
  "L Viability % Tested",
  "M Germination Test Date",
  "N Sample Size Tested",
  "O Day 5 Germ Count",
  "P Day 7 Germ Count",
  "Q Final Germ Count",
  "R Final Count Day",
  "S Storage Method",
  "T Storage Temp",
  "U Storage RH / Desiccant",
  "V Production Notes",
  "W Quality Flag",
  "X Commercial Release Linked?",
  "Y Linked Commercial Checklist Row",
  "Z Verdant Diary Entry",
  "AA Verdant Action Queue Item",
];

export const COMMERCIAL_REVIEW_SHEET =
  "Commercial_Release_Review_Traceability";
export const COMMERCIAL_REVIEW_HEADERS = [
  "A Release Review ID",
  "B Candidate Line / Product Name",
  "C Seed Lot ID",
  "D Project / Line",
  "E Generation",
  "F Female Parent",
  "G Male Parent",
  "H Linked Seed Production Row",
  "I Linked Commercial Release Checklist Row",
  "J Linked Pheno Comparison Row(s)",
  "K Linked F1 / Backcross / Stabilization Row(s)",
  "L Germination Viability %",
  "M Germination Sample Size",
  "N Germination Test Date",
  "O Storage Method",
  "P Storage Conditions Documented?",
  "Q Parentage Complete?",
  "R Multi-Environment Testing Complete?",
  "S Stress Testing Complete?",
  "T Herm / Stability Concern?",
  "U Terp / Chemotype Stability Evidence",
  "V Dry / Cure Performance Evidence",
  "W Yield / Production Evidence",
  "X Pest / Disease Resistance Evidence",
  "Y Hash / Extraction Evidence, if applicable",
  "Z Test Grow Feedback, if available",
  "AA Unresolved Concerns",
  "AB Missing Evidence Count",
  "AC Review Status",
  "AD Human Release Decision",
  "AE Reviewer",
  "AF Review Date",
  "AG Verdant Diary Evidence",
  "AH Verdant Action Queue Draft",
  "AI Notes",
];

export const ALLOWED_VALUES_SEED = {
  Generation: ["F1", "F2", "F3", "S1", "S2", "BC1", "BC2", "BC3", "Open Pollination", "Unknown"],
  "Isolation Method": [
    "whole_tent", "branch_bag", "isolated_room", "manual_paint",
    "open_pollination", "unknown",
  ],
  "Storage Method": ["fridge", "freezer", "room_temp", "cool_dark", "unknown", "other"],
  "Quality Flag (output only)": ["Pass", "Needs Review", "Hold", "Missing Test"],
  "Commercial Release Linked?": ["Yes", "No"],
};

export const ALLOWED_VALUES_REVIEW = {
  "Storage Conditions Documented?": ["Yes", "No"],
  "Parentage Complete?": ["Yes", "No"],
  "Multi-Environment Testing Complete?": ["Yes", "No", "Waived"],
  "Stress Testing Complete?": ["Yes", "No", "Waived"],
  "Herm / Stability Concern?": ["No", "Yes", "Unknown"],
  "Review Status (formula-suggested, max Release Candidate)": [
    "Draft", "Needs Review", "Hold", "Release Candidate",
    "Released (manual-only)", "Rejected (manual-only)", "Retest Required",
  ],
  "Human Release Decision (manual-only)": [
    "Not Reviewed", "Approved", "Rejected", "Hold for Retest", "Hold for More Data",
  ],
};

// ============================================================
// Formula contracts (string templates parameterised by row index `r`)
// ============================================================

export function viabilityFormula(r) {
  return `=IF(OR(N${r}="",N${r}=0,Q${r}=""),"",Q${r}/N${r})`;
}
export function viableSeedRatioFormula(r) {
  return `=IF(OR(J${r}="",J${r}=0,K${r}=""),"",K${r}/J${r})`;
}
export function qualityFlagFormula(r) {
  return `=IF(L${r}="","Missing Test",IF(N${r}<25,"Hold",IF(N${r}<50,"Needs Review",IF(L${r}<0.7,"Hold",IF(L${r}<0.85,"Needs Review","Pass")))))`;
}

/**
 * Review Status suggestion. Formula must never output "Released" —
 * Released is a human-only manual transition based on Human Release
 * Decision = Approved.
 *
 * Columns referenced (Commercial_Release_Review_Traceability):
 *   L = Germination Viability %
 *   M = Germination Sample Size
 *   AB = Missing Evidence Count
 */
export function reviewStatusFormula(r) {
  return `=IF(AB${r}>0,"Needs Review",IF(M${r}<25,"Hold",IF(L${r}<0.7,"Hold",IF(M${r}<50,"Needs Review",IF(AND(L${r}>=0.85,AB${r}=0),"Release Candidate","Needs Review")))))`;
}

// ============================================================
// Example rows
// ============================================================

// Seed Production rows. Use placeholder formulas in L/W; CSV stores
// formula text verbatim so the contract is auditable in plain text.
function seedRow({ rowIdx, id, project, generation, female, male, polD, iso, harvest, dryStart, total, cleaned, gtest, sample, d5, d7, final, finalDay, storage, temp, rh, notes, linked, checklistRow, diary, action }) {
  return [
    id, project, generation, female, male, polD, iso, harvest, dryStart,
    total, cleaned, viabilityFormula(rowIdx), gtest, sample, d5, d7,
    final, finalDay, storage, temp, rh, notes,
    qualityFlagFormula(rowIdx), linked, checklistRow, diary, action,
  ];
}

export const SEED_EXAMPLE_ROWS = [
  // Row 2: blank template row with formulas only.
  seedRow({
    rowIdx: 2,
    id: "", project: "", generation: "", female: "", male: "",
    polD: "", iso: "", harvest: "", dryStart: "",
    total: "", cleaned: "", gtest: "", sample: "", d5: "", d7: "",
    final: "", finalDay: "", storage: "", temp: "", rh: "",
    notes: "Template row — populate fields, formulas auto-fill.",
    linked: "", checklistRow: "", diary: "", action: "",
  }),
  // Row 3: Example 1 — normal Pass candidate signal.
  seedRow({
    rowIdx: 3,
    id: "SPL-2026-Nimbus-01", project: "Nimbus", generation: "F2",
    female: "Nimbus-mom-04", male: "Nimbus-dad-02",
    polD: "2026-03-12", iso: "branch_bag",
    harvest: "2026-04-30", dryStart: "2026-05-02",
    total: 480, cleaned: 410,
    gtest: "2026-05-20", sample: 60, d5: 50, d7: 55,
    final: 56, finalDay: 10,
    storage: "fridge", temp: "5C", rh: "20%",
    notes: "Clean cure, no mold.", linked: "No",
    checklistRow: "", diary: "diary://entry/sample-pass",
    action: "",
  }),
  // Row 4: Example 2 — Hold / low viability.
  seedRow({
    rowIdx: 4,
    id: "SPL-2026-Nimbus-02", project: "Nimbus", generation: "F2",
    female: "Nimbus-mom-04", male: "Nimbus-dad-02",
    polD: "2026-03-12", iso: "branch_bag",
    harvest: "2026-04-30", dryStart: "2026-05-02",
    total: 250, cleaned: 180,
    gtest: "2026-05-20", sample: 60, d5: 32, d7: 38,
    final: 40, finalDay: 10,
    storage: "fridge", temp: "5C", rh: "20%",
    notes: "Low germination — hold.", linked: "No",
    checklistRow: "", diary: "diary://entry/sample-low-viability",
    action: "",
  }),
  // Row 5: Example 3 — full release candidate signal.
  seedRow({
    rowIdx: 5,
    id: "SPL-2026-Aurora-01", project: "Aurora", generation: "F3",
    female: "Aurora-mom-01", male: "Aurora-dad-03",
    polD: "2026-02-01", iso: "isolated_room",
    harvest: "2026-03-25", dryStart: "2026-03-27",
    total: 1200, cleaned: 1100,
    gtest: "2026-04-15", sample: 100, d5: 92, d7: 96,
    final: 97, finalDay: 10,
    storage: "freezer", temp: "-15C", rh: "10%",
    notes: "Strong cure, candidate for commercial review.", linked: "Yes",
    checklistRow: "CHK-Aurora-001", diary: "diary://entry/sample-candidate",
    action: "draft://action/queue-suggested-review",
  }),
  // Row 6: Example 4 — data-incomplete hold.
  seedRow({
    rowIdx: 6,
    id: "SPL-2026-Helix-01", project: "Helix", generation: "S1",
    female: "Helix-mom-02", male: "selfed",
    polD: "2026-03-01", iso: "branch_bag",
    harvest: "2026-04-20", dryStart: "2026-04-22",
    total: 320, cleaned: 290,
    gtest: "", sample: "", d5: "", d7: "",
    final: "", finalDay: "",
    storage: "fridge", temp: "5C", rh: "25%",
    notes: "Germination test not yet run.", linked: "No",
    checklistRow: "", diary: "diary://entry/sample-pending-test",
    action: "",
  }),
];

function reviewRow({ rowIdx, id, line, lot, project, gen, female, male, seedProdRow, checklistRow, phenoRows, fbsRows, viability, sample, gtest, storage, condDoc, parentage, multiEnv, stress, herm, terp, dry, yieldEv, pest, hash, testGrow, unresolved, missingCount, humanDecision, reviewer, reviewDate, diary, actionDraft, notes }) {
  return [
    id, line, lot, project, gen, female, male,
    seedProdRow, checklistRow, phenoRows, fbsRows,
    viability, sample, gtest,
    storage, condDoc, parentage, multiEnv, stress, herm,
    terp, dry, yieldEv, pest, hash, testGrow,
    unresolved, missingCount, reviewStatusFormula(rowIdx),
    humanDecision, reviewer, reviewDate, diary, actionDraft, notes,
  ];
}

export const REVIEW_EXAMPLE_ROWS = [
  // Row 2: template row with formula only.
  reviewRow({
    rowIdx: 2,
    id: "", line: "", lot: "", project: "", gen: "", female: "", male: "",
    seedProdRow: "", checklistRow: "", phenoRows: "", fbsRows: "",
    viability: "", sample: "", gtest: "",
    storage: "", condDoc: "", parentage: "", multiEnv: "", stress: "",
    herm: "", terp: "", dry: "", yieldEv: "", pest: "", hash: "",
    testGrow: "", unresolved: "",
    missingCount: 0,
    humanDecision: "Not Reviewed", reviewer: "", reviewDate: "",
    diary: "", actionDraft: "",
    notes: "Template row — Review Status auto-populates from formula.",
  }),
  // Row 3: Release Candidate signal.
  reviewRow({
    rowIdx: 3,
    id: "CRR-2026-Aurora-Lot01-r1",
    line: "Aurora F3", lot: "SPL-2026-Aurora-01", project: "Aurora",
    gen: "F3", female: "Aurora-mom-01", male: "Aurora-dad-03",
    seedProdRow: "SPL-2026-Aurora-01",
    checklistRow: "CHK-Aurora-001",
    phenoRows: "PHENO-Aurora-A1, PHENO-Aurora-A2",
    fbsRows: "F1-Aurora-Project-01",
    viability: 0.97, sample: 100, gtest: "2026-04-15",
    storage: "freezer", condDoc: "Yes", parentage: "Yes",
    multiEnv: "Yes", stress: "Yes", herm: "No",
    terp: "Stable across 3 runs.",
    dry: "10-day dry, 14-day cure, no mold.",
    yieldEv: "Consistent within 5% across 3 grows.",
    pest: "No pest issues observed.",
    hash: "n/a", testGrow: "Positive feedback from 2 test grows.",
    unresolved: "", missingCount: 0,
    humanDecision: "Not Reviewed",
    reviewer: "", reviewDate: "",
    diary: "diary://entry/aurora-review-r1",
    actionDraft: "Draft: schedule final operator review (grower-approval-only).",
    notes: "Formula will suggest Release Candidate; Released is manual-only.",
  }),
  // Row 4: Hold for Retest signal (low viability).
  reviewRow({
    rowIdx: 4,
    id: "CRR-2026-Nimbus-Lot02-r1",
    line: "Nimbus F2", lot: "SPL-2026-Nimbus-02", project: "Nimbus",
    gen: "F2", female: "Nimbus-mom-04", male: "Nimbus-dad-02",
    seedProdRow: "SPL-2026-Nimbus-02",
    checklistRow: "CHK-Nimbus-002",
    phenoRows: "PHENO-Nimbus-N1",
    fbsRows: "",
    viability: 0.62, sample: 60, gtest: "2026-05-20",
    storage: "fridge", condDoc: "Yes", parentage: "Yes",
    multiEnv: "No", stress: "No", herm: "Unknown",
    terp: "Limited data.",
    dry: "Acceptable cure.",
    yieldEv: "Insufficient data — single grow.",
    pest: "No issues observed.",
    hash: "n/a", testGrow: "",
    unresolved: "Viability below 70%.",
    missingCount: 3,
    humanDecision: "Hold for Retest",
    reviewer: "Operator (manual)",
    reviewDate: "2026-05-25",
    diary: "diary://entry/nimbus-review-r1",
    actionDraft: "Draft: schedule retest; do not release until viability >= 0.85.",
    notes: "Formula suggests Hold; release requires manual decision after retest.",
  }),
  // Row 5: Hold for More Data signal.
  reviewRow({
    rowIdx: 5,
    id: "CRR-2026-Helix-Lot01-r1",
    line: "Helix S1", lot: "SPL-2026-Helix-01", project: "Helix",
    gen: "S1", female: "Helix-mom-02", male: "selfed",
    seedProdRow: "SPL-2026-Helix-01",
    checklistRow: "",
    phenoRows: "",
    fbsRows: "",
    viability: "", sample: "", gtest: "",
    storage: "fridge", condDoc: "No", parentage: "Yes",
    multiEnv: "No", stress: "No", herm: "Unknown",
    terp: "", dry: "", yieldEv: "", pest: "", hash: "", testGrow: "",
    unresolved: "Germination test not run; checklist row missing.",
    missingCount: 7,
    humanDecision: "Hold for More Data",
    reviewer: "Operator (manual)",
    reviewDate: "2026-05-26",
    diary: "diary://entry/helix-review-r1",
    actionDraft: "Draft: run germination test; complete checklist before further review.",
    notes: "Formula suggests Needs Review; manual hold pending data.",
  }),
];

// ============================================================
// CSV emitter (formulas preserved verbatim).
// ============================================================

function csvCell(v) {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(headers, rows) {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return lines.join("\n") + "\n";
}

// ============================================================
// XLSX emitter (uses repo-pinned `xlsx` package if present).
// ============================================================

async function tryGenerateXlsx({ filePath, sheetName, headers, rows, readmeNote }) {
  // Excel caps sheet names at 31 chars; preserve the canonical name in
  // CSV / manifest / docs and use a deterministic shortened tab name in
  // the .xlsx workbook only.
  const xlsxSheetName = sheetName.length > 31 ? sheetName.slice(0, 31) : sheetName;
  let XLSX;
  try {
    XLSX = (await import("xlsx")).default ?? (await import("xlsx"));
  } catch {
    return { ok: false, reason: "xlsx-dependency-missing" };
  }
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, xlsxSheetName);
  if (readmeNote) {
    const readmeWs = XLSX.utils.aoa_to_sheet([
      ["README — Template Safety Notes"],
      [readmeNote],
      [""],
      ["Formulas provide review signals only."],
      ["Human Release Decision is manual."],
      ["No formula releases a seed lot."],
      ["Action Queue text is draft-only and grower-review-only."],
    ]);
    XLSX.utils.book_append_sheet(wb, readmeWs, "README");
  }
  XLSX.writeFile(wb, filePath);
  return { ok: true };
}

// ============================================================
// Main
// ============================================================

const SAFETY_NOTE =
  "Formulas provide review signals only. Human Release Decision is manual. No formula releases a seed lot. Action Queue text is draft-only and grower-review-only.";

async function main() {
  const seedCsvPath = join(ARTIFACT_DIR, "seed-production-tracking-v1.3-template.csv");
  const reviewCsvPath = join(ARTIFACT_DIR, "commercial-release-review-traceability-v1.3-template.csv");
  const seedXlsxPath = join(ARTIFACT_DIR, "seed-production-tracking-v1.3-template.xlsx");
  const reviewXlsxPath = join(ARTIFACT_DIR, "commercial-release-review-traceability-v1.3-template.xlsx");
  const contractsPath = join(ARTIFACT_DIR, "release-workbook-formula-contracts.md");
  const manifestPath = join(ARTIFACT_DIR, "release-workbook-template-manifest.json");

  // CSVs (always).
  writeFileSync(seedCsvPath, toCsv(SEED_PRODUCTION_HEADERS, SEED_EXAMPLE_ROWS));
  writeFileSync(reviewCsvPath, toCsv(COMMERCIAL_REVIEW_HEADERS, REVIEW_EXAMPLE_ROWS));

  // Formula contracts (always).
  const contractsMd = [
    "# Release Workbook Formula Contracts (v1.3)",
    "",
    "Docs-only artifact. Reflects the canonical formula contracts shipped in the",
    "v1.3 specs. Formulas are review signals only — no formula releases a seed lot.",
    "",
    "## Seed_Production_Tracking",
    "",
    "- **L Viability % Tested** (row r):",
    "  `" + viabilityFormula("r") + "`",
    "- **Viable Seed Ratio** (helper, row r):",
    "  `" + viableSeedRatioFormula("r") + "`",
    "- **W Quality Flag** (row r):",
    "  `" + qualityFlagFormula("r") + "`",
    "  Outputs: Pass / Needs Review / Hold / Missing Test.",
    "",
    "## Commercial_Release_Review_Traceability",
    "",
    "- **AC Review Status suggestion** (row r):",
    "  `" + reviewStatusFormula("r") + "`",
    "  Outputs at most `Release Candidate`. **Never outputs `Released`.**",
    "- `AD Human Release Decision` is **manual-only**.",
    "- `AB Missing Evidence Count` is operator-counted (or a documented helper formula).",
    "",
    "## Safety",
    "",
    "> " + SAFETY_NOTE,
    "",
  ].join("\n");
  writeFileSync(contractsPath, contractsMd);

  // XLSX (best-effort).
  const xlsxResults = {
    seed: await tryGenerateXlsx({
      filePath: seedXlsxPath,
      sheetName: SEED_PRODUCTION_SHEET,
      headers: SEED_PRODUCTION_HEADERS,
      rows: SEED_EXAMPLE_ROWS,
      readmeNote: SAFETY_NOTE,
    }),
    review: await tryGenerateXlsx({
      filePath: reviewXlsxPath,
      sheetName: COMMERCIAL_REVIEW_SHEET,
      headers: COMMERCIAL_REVIEW_HEADERS,
      rows: REVIEW_EXAMPLE_ROWS,
      readmeNote: SAFETY_NOTE,
    }),
  };
  const xlsxBlocked = !xlsxResults.seed.ok || !xlsxResults.review.ok;

  // Manifest (always).
  const manifest = {
    version: "v1.3",
    generated_at: new Date().toISOString(),
    files: [
      { path: "docs/artifacts/seed-production-tracking-v1.3-template.csv", kind: "csv" },
      { path: "docs/artifacts/commercial-release-review-traceability-v1.3-template.csv", kind: "csv" },
      { path: "docs/artifacts/seed-production-tracking-v1.3-template.xlsx", kind: "xlsx", generated: xlsxResults.seed.ok },
      { path: "docs/artifacts/commercial-release-review-traceability-v1.3-template.xlsx", kind: "xlsx", generated: xlsxResults.review.ok },
      { path: "docs/artifacts/release-workbook-formula-contracts.md", kind: "markdown" },
    ],
    sheets: {
      [SEED_PRODUCTION_SHEET]: {
        headers: SEED_PRODUCTION_HEADERS,
        allowed_values: ALLOWED_VALUES_SEED,
        formula_contracts: {
          L: "=IF(OR(N{r}=\"\",N{r}=0,Q{r}=\"\"),\"\",Q{r}/N{r})",
          "viable_seed_ratio_helper": "=IF(OR(J{r}=\"\",J{r}=0,K{r}=\"\"),\"\",K{r}/J{r})",
          W: "=IF(L{r}=\"\",\"Missing Test\",IF(N{r}<25,\"Hold\",IF(N{r}<50,\"Needs Review\",IF(L{r}<0.7,\"Hold\",IF(L{r}<0.85,\"Needs Review\",\"Pass\")))))",
        },
      },
      [COMMERCIAL_REVIEW_SHEET]: {
        headers: COMMERCIAL_REVIEW_HEADERS,
        allowed_values: ALLOWED_VALUES_REVIEW,
        formula_contracts: {
          AC_review_status_suggestion:
            "=IF(AB{r}>0,\"Needs Review\",IF(M{r}<25,\"Hold\",IF(L{r}<0.7,\"Hold\",IF(M{r}<50,\"Needs Review\",IF(AND(L{r}>=0.85,AB{r}=0),\"Release Candidate\",\"Needs Review\")))))",
          AD_human_release_decision: "manual-only",
          AB_missing_evidence_count: "operator-counted or documented helper formula",
        },
      },
    },
    safety_notes: [
      SAFETY_NOTE,
      "Review Status formula must never output 'Released' — Released is a human-only transition.",
      "Action Queue text is draft-only; no automatic Action Queue creation.",
    ],
    premium_workbook: {
      status: "placeholder only",
      placeholder: "{{PREMIUM_WORKBOOK_COPY_URL}}",
      real_url_included: false,
      entitlement_required_before_serving_real_link: true,
    },
    xlsx_generation: {
      seed: xlsxResults.seed.ok ? "generated" : `blocked: ${xlsxResults.seed.reason}`,
      review: xlsxResults.review.ok ? "generated" : `blocked: ${xlsxResults.review.reason}`,
    },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

  console.log("generate-release-workbook-templates: wrote artifacts:");
  console.log("  -", seedCsvPath);
  console.log("  -", reviewCsvPath);
  console.log("  -", contractsPath);
  console.log("  -", manifestPath);
  if (xlsxResults.seed.ok) console.log("  -", seedXlsxPath);
  else console.log(`  - [BLOCKED xlsx] seed: ${xlsxResults.seed.reason}`);
  if (xlsxResults.review.ok) console.log("  -", reviewXlsxPath);
  else console.log(`  - [BLOCKED xlsx] review: ${xlsxResults.review.reason}`);

  if (xlsxBlocked) {
    console.log(
      "\nNote: XLSX generation blocked by missing dependency. CSV + manifest + contracts still produced.",
    );
  }
}

const invokedDirectly =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("generate-release-workbook-templates.mjs");
if (invokedDirectly) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
