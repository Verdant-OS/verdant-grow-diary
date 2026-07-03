import { describe, it, expect, beforeAll } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  SEED_PRODUCTION_HEADERS,
  COMMERCIAL_REVIEW_HEADERS,
} from "../../scripts/generate-release-workbook-templates.mjs";

const ART = join(process.cwd(), "docs", "artifacts");
const MANIFEST = join(ART, "release-workbook-template-manifest.json");

const REQUIRED_FILES = [
  "seed-production-tracking-v1.3-template.xlsx",
  "seed-production-tracking-v1.3-template.csv",
  "commercial-release-review-traceability-v1.3-template.xlsx",
  "commercial-release-review-traceability-v1.3-template.csv",
  "release-workbook-formula-contracts.md",
  "release-workbook-template-manifest.json",
];

const BLOCKED_STRINGS = [
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
  "PREMIMUM_WORKBOOK_COPY_URL",
];

beforeAll(() => {
  if (!existsSync(MANIFEST)) {
    execSync("node scripts/generate-release-workbook-templates.mjs", { stdio: "inherit" });
  }
});

function sha256File(p: string): string {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

describe("release workbook manifest", () => {
  it("exists with version v1.3 and required top-level keys", () => {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    expect(m.version).toBe("v1.3");
    for (const key of [
      "templates",
      "files",
      "hashes",
      "formula_contracts",
      "safety_notes",
      "premium_workbook_placeholder",
    ]) {
      expect(m, `missing manifest key ${key}`).toHaveProperty(key);
    }
  });

  it("references every required generated artifact and the files exist", () => {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const filenames = new Set(m.files.map((f: { filename: string }) => f.filename));
    for (const required of REQUIRED_FILES) {
      // Manifest itself need not list itself, but every other file must be present
      // both in manifest and on disk.
      if (required === "release-workbook-template-manifest.json") {
        expect(existsSync(join(ART, required))).toBe(true);
        continue;
      }
      expect(filenames.has(required), `manifest missing file ${required}`).toBe(true);
      expect(existsSync(join(ART, required)), `artifact missing on disk: ${required}`).toBe(true);
    }
  });

  it("manifest SHA256 for every generated file matches actual file hash on disk", () => {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    for (const f of m.files) {
      const fullPath = join(process.cwd(), f.path);
      expect(statSync(fullPath).isFile()).toBe(true);
      const actual = sha256File(fullPath);
      expect(actual, `hash mismatch for ${f.filename}`).toBe(f.sha256);
      expect(m.hashes[f.filename]).toBe(actual);
    }
  });

  it("XLSX filenames are pinned to v1.3 and reference canonical sheets", () => {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    const xlsx = m.files.filter((f: { kind: string }) => f.kind === "xlsx");
    expect(xlsx.length).toBeGreaterThanOrEqual(2);
    for (const f of xlsx) {
      expect(f.filename).toMatch(/v1\.3-template\.xlsx$/);
      expect(f.sheet_canonical_name).toBeTruthy();
      expect(f.xlsx_tab_name).toBeTruthy();
      expect(f.xlsx_tab_name.length).toBeLessThanOrEqual(31);
    }
    expect(m.templates.seed_production.canonical_sheet).toBe("Seed_Production_Tracking");
    expect(m.templates.commercial_release_review.canonical_sheet).toBe(
      "Commercial_Release_Review_Traceability",
    );
    expect(m.templates.commercial_release_review.xlsx_tab_name).toBe(
      "Commercial_Release_Review_Trace",
    );
  });

  it("header counts match Seed=27 and Review=35", () => {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    expect(m.templates.seed_production.header_count).toBe(27);
    expect(m.templates.commercial_release_review.header_count).toBe(35);
    expect(SEED_PRODUCTION_HEADERS).toHaveLength(27);
    expect(COMMERCIAL_REVIEW_HEADERS).toHaveLength(35);
  });

  it("formula_contracts include viability, qualityFlag, reviewStatus", () => {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    expect(m.formula_contracts.viabilityFormula).toContain("=IF(OR(N{r}");
    expect(m.formula_contracts.qualityFlagFormula).toContain("Missing Test");
    expect(m.formula_contracts.reviewStatusFormula).toContain("Release Candidate");
    expect(m.formula_contracts.reviewStatusFormula).not.toMatch(/"Released"/);
  });

  it("premium_workbook_placeholder.placeholder is the canonical placeholder", () => {
    const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
    expect(m.premium_workbook_placeholder.placeholder).toBe("{{PREMIUM_WORKBOOK_COPY_URL}}");
  });

  it("manifest contains no blocked URLs, secrets, or private/premium paths", () => {
    const text = readFileSync(MANIFEST, "utf8");
    for (const bad of BLOCKED_STRINGS) {
      expect(text.includes(bad), `manifest contains blocked string ${bad}`).toBe(false);
    }
    // service_role / private/ / premium/ bucket paths must not appear.
    expect(text).not.toMatch(/\bservice_role\b/);
    expect(text).not.toMatch(/(^|[\s"])private\//);
    expect(text).not.toMatch(/(^|[\s"])premium\//);
  });

  it("regenerating the artifacts is fully deterministic (XLSX hashes stable)", () => {
    const before = REQUIRED_FILES.filter((f) => f.endsWith(".xlsx")).map((f) => ({
      f,
      hash: sha256File(join(ART, f)),
    }));
    execSync("node scripts/generate-release-workbook-templates.mjs", { stdio: "ignore" });
    for (const { f, hash } of before) {
      expect(sha256File(join(ART, f)), `XLSX nondeterministic: ${f}`).toBe(hash);
    }
  });

  it("regenerating with unchanged content leaves the manifest byte-identical (no timestamp/format churn)", () => {
    const before = readFileSync(MANIFEST, "utf8");
    execSync("node scripts/generate-release-workbook-templates.mjs", { stdio: "ignore" });
    const after = readFileSync(MANIFEST, "utf8");
    expect(after, "manifest churned on a no-change regeneration").toBe(before);
  });

  it("manifest on disk is prettier-formatted (generator output matches repo formatting)", async () => {
    const raw = readFileSync(MANIFEST, "utf8");
    const prettier = await import("prettier");
    const config = (await prettier.resolveConfig(MANIFEST)) ?? {};
    const formatted = await prettier.format(raw, {
      ...config,
      parser: "json",
      filepath: MANIFEST,
    });
    expect(raw, "manifest is not prettier-clean — lint-staged would rewrite it").toBe(formatted);
  });
});
