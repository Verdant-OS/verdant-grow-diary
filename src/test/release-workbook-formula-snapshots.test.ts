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

describe("v1.3 workbook formula snapshots — XLSX must match contract exactly", () => {
  it("Seed Production: L (viability) formula matches contract for rows 2–5", () => {
    const wb = XLSX.readFile(SEED_XLSX);
    const ws = wb.Sheets[wb.SheetNames.find((n) => n.startsWith("Seed_Production"))!];
    for (const r of [2, 3, 4, 5]) {
      expect(cell(ws, `L${r}`)).toBe(viabilityFormula(r));
    }
  });

  it("Seed Production: W (quality flag) formula matches contract for rows 2–5", () => {
    const wb = XLSX.readFile(SEED_XLSX);
    const ws = wb.Sheets[wb.SheetNames.find((n) => n.startsWith("Seed_Production"))!];
    for (const r of [2, 3, 4, 5]) {
      expect(cell(ws, `W${r}`)).toBe(qualityFlagFormula(r));
    }
  });

  it("Commercial Release Review: AC (Review Status) formula matches contract and never says Released", () => {
    const wb = XLSX.readFile(REVIEW_XLSX);
    const ws = wb.Sheets[wb.SheetNames.find((n) => n.startsWith("Commercial_Release_Review"))!];
    for (const r of [2, 3, 4, 5]) {
      const f = cell(ws, `AC${r}`);
      expect(f).toBe(reviewStatusFormula(r));
      expect(f).not.toMatch(/"Released"/);
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

  it("CSV artifacts contain the canonical formula text verbatim", () => {
    const seedCsv = readFileSync(SEED_CSV, "utf8");
    expect(seedCsv).toContain(viabilityFormula(2));
    expect(seedCsv).toContain(qualityFlagFormula(2));

    const revCsv = readFileSync(REVIEW_CSV, "utf8");
    expect(revCsv).toContain(reviewStatusFormula(2));
    expect(revCsv).not.toMatch(/"Released"/);
  });

  it("formula contracts markdown documents all four formulas verbatim", () => {
    const md = readFileSync(CONTRACTS_MD, "utf8");
    expect(md).toContain(viabilityFormula(2));
    expect(md).toContain(viableSeedRatioFormula(2));
    expect(md).toContain(qualityFlagFormula(2));
    expect(md).toContain(reviewStatusFormula(2));
    expect(md).not.toMatch(/"Released"/);
  });

  it("inline snapshot of canonical formula strings (drift detector)", () => {
    expect({
      viability: viabilityFormula(2),
      viableSeedRatio: viableSeedRatioFormula(2),
      qualityFlag: qualityFlagFormula(2),
      reviewStatus: reviewStatusFormula(2),
    }).toMatchInlineSnapshot(`
      {
        "qualityFlag": "=IF(L2=\\"\\",\\"Missing Test\\",IF(N2<25,\\"Hold\\",IF(N2<50,\\"Needs Review\\",IF(L2<0.7,\\"Hold\\",IF(L2<0.85,\\"Needs Review\\",\\"Pass\\")))))",
        "reviewStatus": "=IF(AB2>0,\\"Needs Review\\",IF(M2<25,\\"Hold\\",IF(L2<0.7,\\"Hold\\",IF(M2<50,\\"Needs Review\\",IF(AND(L2>=0.85,AB2=0),\\"Release Candidate\\",\\"Needs Review\\")))))",
        "viability": "=IF(OR(N2=\\"\\",N2=0,Q2=\\"\\"),\\"\\",Q2/N2)",
        "viableSeedRatio": "=IF(OR(J2=\\"\\",J2=0,K2=\\"\\"),\\"\\",K2/J2)",
      }
    `);
  });
});
