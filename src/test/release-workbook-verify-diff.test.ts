import { describe, it, expect } from "vitest";
import {
  formatHashMismatch,
  formatFormulaMismatch,
  formatBlockedToken,
  formatPlaceholderMismatch,
  formatMissingFile,
  scanFileForBlockedTokens,
  scanForPlaceholderTypos,
} from "../../scripts/verify-release-workbooks.mjs";
import {
  GENERATED_FILENAMES,
  PRESERVED_FILENAMES,
  isSafeArtifactPath,
} from "../../scripts/regenerate-release-workbooks.mjs";
import { pickRelevantStaged } from "../../scripts/precommit-release-workbooks.mjs";

const TYPO = `{{PREMI${"MUM"}_WORKBOOK_COPY_URL}}`;

describe("verify-release-workbooks --diff formatters", () => {
  it("formats hash mismatch with expected/actual + filename", () => {
    const out = formatHashMismatch({
      file: "docs/artifacts/seed-production-tracking-v1.3-template.xlsx",
      expected: "a".repeat(64),
      actual: "b".repeat(64),
    });
    expect(out).toContain("Hash mismatch:");
    expect(out).toContain("File: docs/artifacts/seed-production-tracking-v1.3-template.xlsx");
    expect(out).toContain(`Expected SHA256: ${"a".repeat(64)}`);
    expect(out).toContain(`Actual SHA256:   ${"b".repeat(64)}`);
  });

  it("formats formula mismatch with workbook/sheet/cell/expected/actual", () => {
    const out = formatFormulaMismatch({
      workbook: "docs/artifacts/seed-production-tracking-v1.3-template.xlsx",
      sheet: "Seed_Production_Tracking",
      cell: "W4",
      expected: 'IF(L4="","Missing Test","Pass")',
      actual: 'IF(L4="","X","Pass")',
    });
    expect(out).toMatch(/Workbook: .+seed-production.+\.xlsx/);
    expect(out).toContain("Sheet: Seed_Production_Tracking");
    expect(out).toContain("Cell: W4");
    expect(out).toContain("Expected:");
    expect(out).toContain("Actual:");
  });

  it("formats blocked token with file/pattern/line", () => {
    const out = formatBlockedToken({
      file: "docs/artifacts/release-workbook-template-manifest.json",
      pattern: "access_token=",
      line: 42,
    });
    expect(out).toContain("Blocked token:");
    expect(out).toContain("Pattern: access_token=");
    expect(out).toContain("Line: 42");
  });

  it("formats placeholder typo with expected vs found", () => {
    const out = formatPlaceholderMismatch({
      file: "docs/commercial-release-review-traceability-workbook-spec.md",
      expected: "{{PREMIUM_WORKBOOK_COPY_URL}}",
      found: TYPO,
    });
    expect(out).toContain("Premium placeholder mismatch:");
    expect(out).toContain("Expected placeholder: {{PREMIUM_WORKBOOK_COPY_URL}}");
    expect(out).toContain(`Found invalid placeholder: ${TYPO}`);
  });

  it("formats missing file message", () => {
    const out = formatMissingFile({ file: "docs/artifacts/missing.xlsx" });
    expect(out).toContain("Missing generated file:");
    expect(out).toContain("File: docs/artifacts/missing.xlsx");
  });
});

describe("verify-release-workbooks --diff scanners", () => {
  it("detects access_token= and reports line number", () => {
    const hits = scanFileForBlockedTokens(
      "manifest.json",
      "ok line\nbad access_token=abc\nfine\n",
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].line).toBe(2);
    expect(hits[0].pattern).toContain("access_token=");
  });

  it("ignores clean content", () => {
    expect(scanFileForBlockedTokens("x.md", "all clean\nno secrets here\n")).toEqual([]);
  });

  it("detects the premium placeholder typo", () => {
    const hits = scanForPlaceholderTypos("spec.md", `header\n${TYPO}\nfooter\n`);
    expect(hits.length).toBe(1);
    expect(hits[0].found).toBe(TYPO);
    expect(hits[0].expected).toBe("{{PREMIUM_WORKBOOK_COPY_URL}}");
  });

  it("does not flag the correct placeholder", () => {
    expect(
      scanForPlaceholderTypos("spec.md", "Use {{PREMIUM_WORKBOOK_COPY_URL}} here.\n"),
    ).toEqual([]);
  });
});

describe("regenerate-release-workbooks safety", () => {
  it("never lists README.md among generated filenames", () => {
    expect(GENERATED_FILENAMES).not.toContain("README.md");
    expect(PRESERVED_FILENAMES).toContain("README.md");
  });

  it("lists exactly the v1.3 generated artifacts", () => {
    expect(new Set(GENERATED_FILENAMES)).toEqual(
      new Set([
        "seed-production-tracking-v1.3-template.xlsx",
        "seed-production-tracking-v1.3-template.csv",
        "commercial-release-review-traceability-v1.3-template.xlsx",
        "commercial-release-review-traceability-v1.3-template.csv",
        "release-workbook-formula-contracts.md",
        "release-workbook-template-manifest.json",
      ]),
    );
  });

  it("isSafeArtifactPath refuses paths outside the artifact dir", () => {
    const dir = "/repo/docs/artifacts";
    expect(isSafeArtifactPath("/repo/docs/artifacts/seed.xlsx", dir)).toBe(true);
    expect(isSafeArtifactPath("/repo/docs/other/seed.xlsx", dir)).toBe(false);
    expect(isSafeArtifactPath("/repo/docs/artifacts/../etc/passwd", dir)).toBe(false);
    expect(isSafeArtifactPath("/etc/passwd", dir)).toBe(false);
  });
});

describe("precommit-release-workbooks staged filter", () => {
  it("matches workbook-relevant paths", () => {
    expect(
      pickRelevantStaged([
        "src/pages/Auth.tsx",
        "docs/artifacts/seed-production-tracking-v1.3-template.xlsx",
        "scripts/generate-release-workbook-templates.mjs",
        "README.md",
      ]),
    ).toEqual([
      "docs/artifacts/seed-production-tracking-v1.3-template.xlsx",
      "scripts/generate-release-workbook-templates.mjs",
    ]);
  });

  it("returns empty when nothing relevant is staged", () => {
    expect(pickRelevantStaged(["src/App.tsx", "README.md"])).toEqual([]);
  });
});
