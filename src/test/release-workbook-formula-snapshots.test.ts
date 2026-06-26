import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import * as XLSX from "xlsx";
import {
  viabilityFormula,
  viableSeedRatioFormula,
  qualityFlagFormula,
  reviewStatusFormula,
  SEED_PRODUCTION_HEADERS,
  COMMERCIAL_REVIEW_HEADERS,
} from "../../scripts/generate-release-workbook-templates.mjs";

const ART = join(process.cwd(), "docs", "artifacts");
const SEED_XLSX = join(ART, "seed-production-tracking-v1.3-template.xlsx");
const REVIEW_XLSX = join(ART, "commercial-release-review-traceability-v1.3-template.xlsx");
const SEED_CSV = join(ART, "seed-production-tracking-v1.3-template.csv");
const REVIEW_CSV = join(ART, "commercial-release-review-traceability-v1.3-template.csv");
const CONTRACTS_MD = join(ART, "release-workbook-formula-contracts.md");

beforeAll(() => {
  if (!existsSync(SEED_XLSX) || !existsSync(REVIEW_XLSX) || !existsSync(CONTRACTS_MD)) {
    execSync("node scripts/generate-release-workbook-templates.mjs", { stdio: "inherit" });
  }
});

function cell(ws: XLSX.WorkSheet, addr: string): string {
  const c = ws[addr];
  if (!c) return "";
  return c.f ? `=${c.f}` : String(c.v ?? "");
}

function expectFormulaCell(
  ws: XLSX.WorkSheet,
  addr: string,
  expected: string,
  context: { file: string; sheet: string },
) {
  const actual = cell(ws, addr);
  if (actual !== expected) {
    throw new Error(
      `Formula mismatch in ${context.file} → sheet "${context.sheet}" cell ${addr}\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}`,
    );
  }
}

// Full row coverage: Seed has 5 generated data rows (blank template + 4 examples)
// → rows 2–6. Review has 4 generated data rows → rows 2–5.
const SEED_ROWS = [2, 3, 4, 5, 6];
const REVIEW_ROWS = [2, 3, 4, 5];

const FORBIDDEN_IN_FORMULAS = [
  /"Released"/,
  /auto-release/i,
  /automatic Action Queue/i,
  /automatically creates Action Queue/i,
];

describe("v1.3 workbook formula snapshots — XLSX must match contract exactly", () => {
  it("Seed Production: column L (viability) formula matches contract for every generated row", () => {
    const wb = XLSX.readFile(SEED_XLSX);
    const sheetName = wb.SheetNames.find((n) => n.startsWith("Seed_Production"))!;
    const ws = wb.Sheets[sheetName];
    for (const r of SEED_ROWS) {
      expectFormulaCell(ws, `L${r}`, viabilityFormula(r), { file: SEED_XLSX, sheet: sheetName });
    }
  });

  it("Seed Production: column W (quality flag) formula matches contract for every generated row", () => {
    const wb = XLSX.readFile(SEED_XLSX);
    const sheetName = wb.SheetNames.find((n) => n.startsWith("Seed_Production"))!;
    const ws = wb.Sheets[sheetName];
    for (const r of SEED_ROWS) {
      expectFormulaCell(ws, `W${r}`, qualityFlagFormula(r), { file: SEED_XLSX, sheet: sheetName });
    }
  });

  it("Commercial Release Review: AC (Review Status) formula matches contract and never says Released", () => {
    const wb = XLSX.readFile(REVIEW_XLSX);
    const sheetName = wb.SheetNames.find((n) => n.startsWith("Commercial_Release_Review"))!;
    const ws = wb.Sheets[sheetName];
    for (const r of REVIEW_ROWS) {
      const expected = reviewStatusFormula(r);
      expectFormulaCell(ws, `AC${r}`, expected, { file: REVIEW_XLSX, sheet: sheetName });
      for (const rx of FORBIDDEN_IN_FORMULAS) {
        expect(expected, `forbidden token in formula AC${r}`).not.toMatch(rx);
      }
    }
  });

  it("Commercial Release Review: AB (Missing Evidence Count) is operator-entered (no formula in any row)", () => {
    const wb = XLSX.readFile(REVIEW_XLSX);
    const sheetName = wb.SheetNames.find((n) => n.startsWith("Commercial_Release_Review"))!;
    const ws = wb.Sheets[sheetName];
    for (const r of REVIEW_ROWS) {
      const c = ws[`AB${r}`];
      // AB may be a numeric value or empty, but must never be a formula in v1.3 generated rows.
      expect(c?.f, `AB${r} unexpectedly has a formula`).toBeFalsy();
      const txt = String(c?.v ?? "");
      expect(txt.startsWith("="), `AB${r} value looks like a formula`).toBe(false);
    }
  });

  it("Commercial Release Review: human-decision columns (AD reviewer/date/queue draft) have no formulas", () => {
    const wb = XLSX.readFile(REVIEW_XLSX);
    const sheetName = wb.SheetNames.find((n) => n.startsWith("Commercial_Release_Review"))!;
    const ws = wb.Sheets[sheetName];
    for (const r of REVIEW_ROWS) {
      for (const col of ["AD", "AE", "AF", "AG", "AH", "AI"]) {
        const c = ws[`${col}${r}`];
        if (!c) continue;
        expect(c.f, `${col}${r} must not be a formula`).toBeFalsy();
        const txt = String(c.v ?? "");
        expect(txt.startsWith("="), `${col}${r} value looks like a formula`).toBe(false);
      }
    }
  });

  it("XLSX header rows match canonical contracts exactly", () => {
    const seedWb = XLSX.readFile(SEED_XLSX);
    const seedWs = seedWb.Sheets[seedWb.SheetNames.find((n) => n.startsWith("Seed_Production"))!];
    const seedHeaders = SEED_PRODUCTION_HEADERS.map((_, i) => {
      const ref = XLSX.utils.encode_cell({ r: 0, c: i });
      return String(seedWs[ref]?.v ?? "");
    });
    expect(seedHeaders).toEqual(SEED_PRODUCTION_HEADERS);

    const revWb = XLSX.readFile(REVIEW_XLSX);
    const revWs = revWb.Sheets[revWb.SheetNames.find((n) => n.startsWith("Commercial_Release_Review"))!];
    const revHeaders = COMMERCIAL_REVIEW_HEADERS.map((_, i) => {
      const ref = XLSX.utils.encode_cell({ r: 0, c: i });
      return String(revWs[ref]?.v ?? "");
    });
    expect(revHeaders).toEqual(COMMERCIAL_REVIEW_HEADERS);
  });

  it("CSV artifacts contain the canonical formula text (RFC-4180 quote-escaped) and never 'Released' in formulas", () => {
    const csvEscape = (f: string) => f.replace(/"/g, '""');
    const seedCsv = readFileSync(SEED_CSV, "utf8");
    expect(seedCsv).toContain(csvEscape(viabilityFormula(2)));
    expect(seedCsv).toContain(csvEscape(qualityFlagFormula(2)));

    const revCsv = readFileSync(REVIEW_CSV, "utf8");
    expect(revCsv).toContain(csvEscape(reviewStatusFormula(2)));
    // "Released" must not appear inside any formula serialization.
    expect(revCsv).not.toMatch(/""Released""/);
  });

  it("formula contracts markdown documents all four formulas (generic-row form)", () => {
    const generic = (f: string) => f.replace(/([A-Z]+)\d+/g, "$1r");
    const md = readFileSync(CONTRACTS_MD, "utf8");
    expect(md).toContain(generic(viabilityFormula(2)));
    expect(md).toContain(generic(viableSeedRatioFormula(2)));
    expect(md).toContain(generic(qualityFlagFormula(2)));
    expect(md).toContain(generic(reviewStatusFormula(2)));
    expect(md).not.toMatch(/"Released"/);
  });

  it("canonical formula strings match the v1.3 contract exactly (drift detector)", () => {
    expect({
      viability: viabilityFormula(2),
      viableSeedRatio: viableSeedRatioFormula(2),
      qualityFlag: qualityFlagFormula(2),
      reviewStatus: reviewStatusFormula(2),
    }).toEqual({
      viability: '=IF(OR(N2="",N2=0,Q2=""),"",Q2/N2)',
      viableSeedRatio: '=IF(OR(J2="",J2=0,K2=""),"",K2/J2)',
      qualityFlag:
        '=IF(L2="","Missing Test",IF(N2<25,"Hold",IF(N2<50,"Needs Review",IF(L2<0.7,"Hold",IF(L2<0.85,"Needs Review","Pass")))))',
      reviewStatus:
        '=IF(AB2>0,"Needs Review",IF(M2<25,"Hold",IF(L2<0.7,"Hold",IF(M2<50,"Needs Review",IF(AND(L2>=0.85,AB2=0),"Release Candidate","Needs Review")))))',
    });
  });
});
