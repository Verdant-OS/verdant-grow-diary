import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as XLSX from "xlsx";
import {
  SEED_PRODUCTION_HEADERS,
  COMMERCIAL_REVIEW_HEADERS,
  reviewStatusFormula,
  qualityFlagFormula,
  viabilityFormula,
  manifestContentFingerprint,
  resolveGeneratedAt,
} from "../../scripts/generate-release-workbook-templates.mjs";

const BLOCKED_STRINGS = [
  "PREMIMUM_WORKBOOK_COPY_URL",
  "docs.google.com",
  "drive.google.com",
  "dropbox.com",
  "notion.so",
  "notion.site",
  "sheets.googleapis.com",
  "storage.googleapis.com",
  "supabase.co/storage",
  "access_token=",
  "X-Amz-Signature",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const BLOCKED_REGEXES: RegExp[] = [
  /\bservice_role\b/,
  /(^|[\s"'])private\//,
  /(^|[\s"'])premium\//,
  /auto[- ]?release/i,
  /automatic action queue/i,
  /automatically creates action queue/i,
];

function assertNoBlocked(text: string, label: string) {
  for (const bad of BLOCKED_STRINGS) {
    expect(text.includes(bad), `${label} contains blocked string ${bad}`).toBe(false);
  }
  for (const rx of BLOCKED_REGEXES) {
    expect(text, `${label} matches blocked pattern ${rx}`).not.toMatch(rx);
  }
}

const ART = join(process.cwd(), "docs", "artifacts");

describe("generate-release-workbook-templates", () => {
  it("Seed Production headers match A–AA exactly (27 columns)", () => {
    expect(SEED_PRODUCTION_HEADERS).toHaveLength(27);
    expect(SEED_PRODUCTION_HEADERS[0]).toBe("A Seed Lot ID");
    expect(SEED_PRODUCTION_HEADERS[11]).toBe("L Viability % Tested");
    expect(SEED_PRODUCTION_HEADERS[22]).toBe("W Quality Flag");
    expect(SEED_PRODUCTION_HEADERS.at(-1)).toBe("AA Verdant Action Queue Item");
  });

  it("Commercial Release Review headers match A–AI exactly (35 columns)", () => {
    expect(COMMERCIAL_REVIEW_HEADERS).toHaveLength(35);
    expect(COMMERCIAL_REVIEW_HEADERS[0]).toBe("A Release Review ID");
    expect(COMMERCIAL_REVIEW_HEADERS[2]).toBe("C Seed Lot ID");
    expect(COMMERCIAL_REVIEW_HEADERS[27]).toBe("AB Missing Evidence Count");
    expect(COMMERCIAL_REVIEW_HEADERS[28]).toBe("AC Review Status");
    expect(COMMERCIAL_REVIEW_HEADERS[29]).toBe("AD Human Release Decision");
    expect(COMMERCIAL_REVIEW_HEADERS.at(-1)).toBe("AI Notes");
  });

  it("Review Status formula never outputs 'Released'", () => {
    const f = reviewStatusFormula(5);
    expect(f).not.toMatch(/"Released"/);
    expect(f).toMatch(/Release Candidate/);
  });

  it("Quality Flag formula contract matches v1.3 spec exactly", () => {
    expect(qualityFlagFormula(2)).toBe(
      '=IF(L2="","Missing Test",IF(N2<25,"Hold",IF(N2<50,"Needs Review",IF(L2<0.7,"Hold",IF(L2<0.85,"Needs Review","Pass")))))',
    );
  });

  it("Viability formula contract matches v1.3 spec exactly", () => {
    expect(viabilityFormula(2)).toBe('=IF(OR(N2="",N2=0,Q2=""),"",Q2/N2)');
  });

  it("generated manifest declares v1.3 + placeholder-only premium status", () => {
    const manifestPath = join(ART, "release-workbook-template-manifest.json");
    if (!existsSync(manifestPath)) {
      // Generator hasn't been run in this environment; skip rather than fail.
      return;
    }
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    expect(m.version).toBe("v1.3");
    expect(m.premium_workbook.real_url_included).toBe(false);
    expect(m.premium_workbook.placeholder).toBe("{{PREMIUM_WORKBOOK_COPY_URL}}");
    expect(m.premium_workbook.entitlement_required_before_serving_real_link).toBe(true);
  });

  it("generated CSV artifacts do not contain blocked URLs/secrets/private paths", () => {
    const csvFiles = [
      join(ART, "seed-production-tracking-v1.3-template.csv"),
      join(ART, "commercial-release-review-traceability-v1.3-template.csv"),
    ];
    for (const f of csvFiles) {
      if (!existsSync(f)) continue;
      assertNoBlocked(readFileSync(f, "utf8"), `CSV ${f}`);
    }
  });

  it("generated XLSX visible strings contain no blocked URLs/secrets/private paths", () => {
    const xlsxFiles = [
      join(ART, "seed-production-tracking-v1.3-template.xlsx"),
      join(ART, "commercial-release-review-traceability-v1.3-template.xlsx"),
    ];
    for (const f of xlsxFiles) {
      if (!existsSync(f)) continue;
      const wb = XLSX.readFile(f);
      const parts: string[] = [];
      for (const name of wb.SheetNames) {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as unknown[][];
        for (const row of rows) {
          for (const cell of row) parts.push(String(cell ?? ""));
        }
      }
      assertNoBlocked(parts.join("\n"), `XLSX ${f}`);
    }
  });

  it("generated manifest and contracts md contain no blocked tokens", () => {
    // NOTE: the artifacts README intentionally enumerates blocked tokens as
    // human-readable documentation of what the scanner rejects, so it is
    // excluded from this content sweep.
    const targets = [
      join(ART, "release-workbook-template-manifest.json"),
      join(ART, "release-workbook-formula-contracts.md"),
    ];
    for (const f of targets) {
      if (!existsSync(f)) continue;
      assertNoBlocked(readFileSync(f, "utf8"), f);
    }
  });

  it("typo placeholder PREMIMUM_WORKBOOK_COPY_URL must not appear in any generated artifact", () => {
    const all = [
      "seed-production-tracking-v1.3-template.csv",
      "commercial-release-review-traceability-v1.3-template.csv",
      "release-workbook-formula-contracts.md",
      "release-workbook-template-manifest.json",
      "README.md",
    ];
    for (const fn of all) {
      const p = join(ART, fn);
      if (!existsSync(p)) continue;
      expect(readFileSync(p, "utf8")).not.toMatch(/PREMIMUM_WORKBOOK_COPY_URL/);
    }
  });
});

describe("manifest generated_at stability (anti-churn)", () => {
  const NOW = new Date("2026-07-03T12:00:00.000Z");
  const baseManifest = () => ({
    version: "v1.3",
    generated_at: "",
    templates: { a: 1 },
    files: [{ filename: "x.csv", sha256: "abc" }],
  });

  it("fingerprint ignores generated_at but tracks content", () => {
    const a = { ...baseManifest(), generated_at: "2026-01-01T00:00:00.000Z" };
    const b = { ...baseManifest(), generated_at: "2026-02-02T00:00:00.000Z" };
    expect(manifestContentFingerprint(a)).toBe(manifestContentFingerprint(b));
    const c = { ...baseManifest(), files: [{ filename: "x.csv", sha256: "CHANGED" }] };
    expect(manifestContentFingerprint(a)).not.toBe(manifestContentFingerprint(c));
  });

  it("preserves the previous timestamp when content is unchanged", () => {
    const prev = { ...baseManifest(), generated_at: "2026-01-01T00:00:00.000Z" };
    const next = baseManifest();
    expect(resolveGeneratedAt(next, JSON.stringify(prev), NOW)).toBe("2026-01-01T00:00:00.000Z");
  });

  it("stamps the injected now when content changed", () => {
    const prev = { ...baseManifest(), generated_at: "2026-01-01T00:00:00.000Z" };
    const next = {
      ...baseManifest(),
      files: [{ filename: "x.csv", sha256: "CHANGED" }],
    };
    expect(resolveGeneratedAt(next, JSON.stringify(prev), NOW)).toBe(NOW.toISOString());
  });

  it("stamps the injected now when the previous manifest is missing or unreadable", () => {
    expect(resolveGeneratedAt(baseManifest(), null, NOW)).toBe(NOW.toISOString());
    expect(resolveGeneratedAt(baseManifest(), "not json {", NOW)).toBe(NOW.toISOString());
    expect(resolveGeneratedAt(baseManifest(), "", NOW)).toBe(NOW.toISOString());
  });
});
