import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  scanText,
  TARGET_FILE,
  ALLOW_MARKER,
  checkDiaryTemplate,
  checkFilenameExamples,
  checkSampleOutputLog,
  parseFilename,
  FILENAME_RE,
  REQUIRED_DIARY_FIELDS,
  REQUIRED_SAMPLE_LOG_COLUMNS,
  runAllChecks,
} from "../../scripts/assert-automated-phenotyping-docs-safety.mjs";

const REAL_TEXT = readFileSync(TARGET_FILE, "utf8");

describe("assert-automated-phenotyping-docs-safety — banned phrases", () => {
  it("real protocol file has no banned-phrase violations", () => {
    const violations = scanText(REAL_TEXT);
    if (violations.length) {
      // eslint-disable-next-line no-console
      console.error(violations);
    }
    expect(violations).toEqual([]);
  });

  it("safe text passes", () => {
    const safe = `
# Safe doc
- No visible concern
- Visible concern
- Uncertain
- Needs human review
- Retake Photo
- Accepted as Supporting Evidence
- Rejected
`;
    expect(scanText(safe)).toEqual([]);
  });

  it("banned label outside allow block fails", () => {
    const bad = `Plants are marked Healthy_Leaf today.`;
    const v = scanText(bad);
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].phrase).toBe("Healthy_Leaf");
  });

  it("banned phrase inside allowed line passes", () => {
    const ok = `- "Healthy_Leaf" <!-- ${ALLOW_MARKER} -->`;
    expect(scanText(ok)).toEqual([]);
  });

  it("case-insensitive detection catches lowercase variants", () => {
    const bad = `we auto-release approved phenos`;
    const v = scanText(bad);
    expect(v.some((x) => x.phrase === "auto-release")).toBe(true);
  });

  it("certainty wording variants fail", () => {
    const bad = `This pheno is guaranteed healthy and AI selected.`;
    const v = scanText(bad);
    const phrases = v.map((x) => x.phrase);
    expect(phrases).toContain("guaranteed healthy");
    expect(phrases).toContain("AI selected");
  });

  it("standalone Healthy/Stressed flagged with word boundary", () => {
    const bad = `Status: Healthy. Plant looks Stressed.`;
    const phrases = scanText(bad).map((x) => x.phrase);
    expect(phrases).toContain("Healthy");
    expect(phrases).toContain("Stressed");
  });

  it("word-boundary avoids false positives inside larger words", () => {
    const ok = `Unhealthy is not the same token. Distressed plants noted.`;
    const phrases = scanText(ok).map((x) => x.phrase);
    expect(phrases).not.toContain("Healthy");
    expect(phrases).not.toContain("Stressed");
  });

  it("safer labels do not trip the scanner", () => {
    const ok = `Label set: No visible concern, Visible concern, Uncertain.`;
    expect(scanText(ok)).toEqual([]);
  });

  it("reports line numbers", () => {
    const bad = `line one\nline two has Pest_Damage here\nline three`;
    const v = scanText(bad);
    expect(v[0].line).toBe(2);
  });
});

describe("assert-automated-phenotyping-docs-safety — diary template", () => {
  it("real protocol diary template has all required fields", () => {
    expect(checkDiaryTemplate(REAL_TEXT)).toEqual([]);
  });

  it("flags missing required diary field", () => {
    const missing = REAL_TEXT.replace(/^Stage:\s*$/m, "");
    const v = checkDiaryTemplate(missing);
    expect(v.some((x) => x.message.includes("Stage"))).toBe(true);
  });

  it("required fields list is non-empty and includes core identifiers", () => {
    expect(REQUIRED_DIARY_FIELDS).toContain("Plant ID");
    expect(REQUIRED_DIARY_FIELDS).toContain("Human Final Score");
    expect(REQUIRED_DIARY_FIELDS).toContain("photo_date");
  });
});

describe("assert-automated-phenotyping-docs-safety — filename convention", () => {
  it("FILENAME_RE matches a canonical filename", () => {
    expect(
      FILENAME_RE.test("SDxBD_SDxBD-F1-04_flower-wk6_side-view_2026-06-26_01.jpg"),
    ).toBe(true);
  });

  it("parseFilename returns structured fields", () => {
    const p = parseFilename("SDxBD_SDxBD-F1-04_flower-wk6_macro-trichome_2026-06-26_01");
    expect(p).toMatchObject({
      project: "SDxBD",
      phenoId: "SDxBD-F1-04",
      stage: "flower-wk6",
      viewType: "macro-trichome",
      date: "2026-06-26",
      sequence: "01",
    });
  });

  it("parseFilename rejects malformed names", () => {
    expect(parseFilename("not_enough_fields_2026-06-26_01")).toBeNull();
    expect(parseFilename("SDxBD_SDxBD-F1-04_flower-wk6_side_06-26_01")).toBeNull();
  });

  it("real protocol filename examples all match convention", () => {
    expect(checkFilenameExamples(REAL_TEXT)).toEqual([]);
  });
});

describe("assert-automated-phenotyping-docs-safety — sample output log", () => {
  it("real protocol sample log has all required columns and consistent rows", () => {
    expect(checkSampleOutputLog(REAL_TEXT)).toEqual([]);
  });

  it("required columns include Confidence and Human Final Score", () => {
    expect(REQUIRED_SAMPLE_LOG_COLUMNS).toContain("Confidence");
    expect(REQUIRED_SAMPLE_LOG_COLUMNS).toContain("Human Final Score");
    expect(REQUIRED_SAMPLE_LOG_COLUMNS).toContain("Photo Date");
  });

  it("flags low-confidence row with non-blank Human Final Score", () => {
    // Mutate the real text to set a Low-confidence row's Final Score to a non-blank value.
    // Sample row 2 in the doc has Confidence=Low and blank Final Score.
    // Replace `| Low        | external_tool | Needs human review               |                   |`
    // with the same row but with a "55" Final Score.
    const broken = REAL_TEXT.replace(
      "| Low        | external_tool | Needs human review               |                   |",
      "| Low        | external_tool | Needs human review               | 55                |",
    );
    const v = checkSampleOutputLog(broken);
    expect(v.some((x) => /must be blank/.test(x.message))).toBe(true);
  });

  it("flags filename / photo_date mismatch in sample log", () => {
    const broken = REAL_TEXT.replace(
      "| 2026-06-26 | flower-wk6  | side-view      | PlantCV 4.x (manual run) | estimated_height_cm",
      "| 2025-01-01 | flower-wk6  | side-view      | PlantCV 4.x (manual run) | estimated_height_cm",
    );
    const v = checkSampleOutputLog(broken);
    expect(
      v.some((x) => /does not match date in filename/.test(x.message)),
    ).toBe(true);
  });
});

describe("assert-automated-phenotyping-docs-safety — runAllChecks", () => {
  it("returns empty arrays for the real protocol file", () => {
    const r = runAllChecks(REAL_TEXT);
    expect(r.phraseViolations).toEqual([]);
    expect(r.diaryViolations).toEqual([]);
    expect(r.filenameViolations).toEqual([]);
    expect(r.sampleLogViolations).toEqual([]);
  });
});
