import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  scanText,
  TARGET_FILE,
  ALLOW_MARKER,
  BANNED_PHRASES,
  checkDiaryTemplate,
  checkFilenameExamples,
  checkSampleOutputLog,
  parseFilename,
  parseFilenameExamples,
  extractExamplesSubsection,
  FILENAME_RE,
  FORBIDDEN_DIARY_FIELDS,
  MIN_FILENAME_EXAMPLES,
  REQUIRED_DIARY_FIELDS,
  REQUIRED_EXAMPLE_SCENARIOS,
  REQUIRED_SAMPLE_LOG_COLUMNS,
  runAllChecks,
  toStructuredFailures,
} from "../../scripts/assert-automated-phenotyping-docs-safety.mjs";

// LF-normalized so fixture surgery (e.g. removing "…:\n" headings) behaves
// identically on Windows (CRLF checkout) and CI (LF): without this, the
// removal no-ops under CRLF and the expected violations never fire.
const REAL_TEXT = readFileSync(TARGET_FILE, "utf8").replace(/\r\n/g, "\n");

/** Health-framing phrases ported from the reconciled June WIP scanner. */
const HEALTH_FRAMING_PHRASES = [
  "health indicators",
  "health scoring",
  "nutrient deficiency",
  "nutrient deficiencies",
  "healthier green",
  "healthy green",
  "genetic diversity tracking",
  "objective health score",
  "diagnosed from color",
  "harvest ready",
] as const;

describe("assert-automated-phenotyping-docs-safety — banned phrases", () => {
  it("real protocol file has no banned-phrase violations", () => {
    const violations = scanText(REAL_TEXT);
    if (violations.length) {
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

describe("assert-automated-phenotyping-docs-safety — health-framing phrases", () => {
  it("every health-framing phrase is registered as banned", () => {
    for (const phrase of HEALTH_FRAMING_PHRASES) {
      expect(BANNED_PHRASES).toContain(phrase);
    }
  });

  it("real protocol file still scans clean with the health-framing phrases banned", () => {
    const violations = scanText(REAL_TEXT);
    if (violations.length) {
      console.error(violations);
    }
    expect(violations).toEqual([]);
  });

  it.each(HEALTH_FRAMING_PHRASES)(
    "health-framing phrase %s fails outside an allow marker",
    (phrase) => {
      const phrases = scanText(`Record copy says ${phrase} for this pheno.`).map((x) => x.phrase);
      expect(phrases).toContain(phrase);
    },
  );

  it.each(HEALTH_FRAMING_PHRASES)(
    "health-framing phrase %s passes on an allow-marked line",
    (phrase) => {
      expect(scanText(`- "${phrase}" <!-- ${ALLOW_MARKER} -->`)).toEqual([]);
    },
  );

  it("allow marking is per line, so 'harvest ready' inside the allow-marked 'Guaranteed harvest ready' entry does not fire", () => {
    const ok = `- "Guaranteed harvest ready" <!-- ${ALLOW_MARKER} -->`;
    expect(scanText(ok)).toEqual([]);
    // Same wording without the marker is still a violation.
    const phrases = scanText(`- "Guaranteed harvest ready"`).map((x) => x.phrase);
    expect(phrases).toContain("harvest ready");
    expect(phrases).toContain("Guaranteed harvest ready");
  });

  it("health-framing violations surface through toStructuredFailures", () => {
    const broken = REAL_TEXT.replace(
      "## 14. Rollback notes",
      "## 14. Rollback notes\n\nThe tool reports an objective health score.",
    );
    const checks = toStructuredFailures(broken, "doc.md").map((f) => f.check);
    expect(checks).toContain("banned-phrase");
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

  it("Automated Metric(s) is a required diary field and the real template carries it", () => {
    expect(REQUIRED_DIARY_FIELDS).toContain("Automated Metric(s)");
    expect(checkDiaryTemplate(REAL_TEXT)).toEqual([]);
  });

  it("flags a diary template that drops Automated Metric(s)", () => {
    const missing = REAL_TEXT.replace("Automated Metric(s):\n", "");
    const v = checkDiaryTemplate(missing);
    expect(v.some((x) => x.message.includes("Automated Metric(s)"))).toBe(true);
  });

  it("real diary template does not contain auto-created Action Queue wording", () => {
    for (const forbidden of FORBIDDEN_DIARY_FIELDS) {
      expect(REAL_TEXT).not.toContain(forbidden);
    }
    expect(checkDiaryTemplate(REAL_TEXT)).toEqual([]);
  });

  it("flags a diary template that reintroduces 'Action Queue Items Created'", () => {
    const broken = REAL_TEXT.replace(
      "Missing Evidence:",
      "Action Queue Items Created:\nMissing Evidence:",
    );
    const v = checkDiaryTemplate(broken);
    expect(v.some((x) => /must not contain 'Action Queue Items Created'/.test(x.message))).toBe(
      true,
    );
    // The tripwire fires on its own — no required field was removed.
    expect(v.some((x) => /missing required field/.test(x.message))).toBe(false);
  });

  it("diary tripwire surfaces through toStructuredFailures with its own check name", () => {
    const broken = REAL_TEXT.replace(
      "Missing Evidence:",
      "Action Queue Items Created:\nMissing Evidence:",
    );
    const checks = toStructuredFailures(broken, "doc.md").map((f) => f.check);
    expect(checks).toContain("diary-template-forbidden-wording");
  });
});

describe("assert-automated-phenotyping-docs-safety — filename convention", () => {
  it("FILENAME_RE matches a canonical filename", () => {
    expect(FILENAME_RE.test("SDxBD_SDxBD-F1-04_flower-wk6_side-view_2026-06-26_01.jpg")).toBe(true);
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

describe("assert-automated-phenotyping-docs-safety — filename example count", () => {
  it("real protocol section clears the minimum example threshold", () => {
    expect(MIN_FILENAME_EXAMPLES).toBe(5);
    expect(checkFilenameExamples(REAL_TEXT)).toEqual([]);
  });

  it("flags a Filename Convention section carrying too few example filenames", () => {
    const thin = [
      "## 11. Filename Convention and Photo ID Mapping",
      "",
      "### 11.2 Examples",
      "",
      "**Example 1 — Side view**",
      "",
      "`AAA_AAA-F1-01_veg-wk1_side-view_2026-06-26_01.jpg`",
      "",
      "| Field      | Value                                        |",
      "| ---------- | -------------------------------------------- |",
      "| Photo ID   | `AAA_AAA-F1-01_veg-wk1_side-view_2026-06-26_01` |",
      "| photo_date | 2026-06-26                                   |",
      "",
    ].join("\n");
    const v = checkFilenameExamples(thin);
    expect(v.some((x) => /at least 5 are required/.test(x.message))).toBe(true);
  });

  it("example-count failure surfaces through toStructuredFailures", () => {
    const thin = [
      "## 11. Filename Convention and Photo ID Mapping",
      "",
      "### 11.2 Examples",
      "",
      "No worked examples remain.",
      "",
    ].join("\n");
    const checks = toStructuredFailures(thin, "doc.md").map((f) => f.check);
    expect(checks).toContain("filename-example-count");
  });
});

describe("assert-automated-phenotyping-docs-safety — filename example scenarios", () => {
  it("real protocol keeps every required scenario", () => {
    const examples = parseFilenameExamples(extractExamplesSubsection(REAL_TEXT));
    expect(examples).toHaveLength(5);
    for (const scenario of REQUIRED_EXAMPLE_SCENARIOS) {
      expect(examples.some((ex) => scenario.re.test(ex.label))).toBe(true);
    }
    expect(checkFilenameExamples(REAL_TEXT)).toEqual([]);
  });

  it.each([
    ["**Example 1 — Side view**", "side view"],
    ["**Example 2 — Top canopy**", "top canopy"],
    ["**Example 3 — Macro / trichome**", "macro / trichome"],
    ["**Example 4 — Mother plant**", "mother plant"],
    ["**Example 5 — Retake photo**", "retake photo"],
  ])("removing %s fails the scenario check", (heading, label) => {
    const broken = REAL_TEXT.replace(heading, "");
    expect(broken).not.toBe(REAL_TEXT);
    const v = checkFilenameExamples(broken);
    expect(v.some((x) => x.message.includes(`missing required scenario: '${label}'`))).toBe(true);
  });

  it("flags a missing Examples subsection instead of silently passing", () => {
    const broken = REAL_TEXT.replace("### 11.2 Examples", "");
    const v = checkFilenameExamples(broken);
    expect(v.some((x) => /missing its 'Examples' subsection/.test(x.message))).toBe(true);
  });

  it("scenario failure surfaces through toStructuredFailures", () => {
    const broken = REAL_TEXT.replace("**Example 4 — Mother plant**", "");
    const checks = toStructuredFailures(broken, "doc.md").map((f) => f.check);
    expect(checks).toContain("filename-example-scenarios");
  });
});

describe("assert-automated-phenotyping-docs-safety — filename example cross-check", () => {
  it("every real example's Photo ID and photo_date agree with its own filename", () => {
    const examples = parseFilenameExamples(extractExamplesSubsection(REAL_TEXT));
    expect(examples).toHaveLength(5);
    for (const ex of examples) {
      expect(ex.filename).toBeTruthy();
      expect(ex.hasTable).toBe(true);
      const parsed = parseFilename(ex.filename as string);
      expect(parsed).not.toBeNull();
      expect(ex.fields.get("Photo ID")).toBe(
        (ex.filename as string).replace(/\.[A-Za-z0-9]+$/, ""),
      );
      expect(ex.fields.get("photo_date")).toBe(parsed?.date);
    }
    expect(checkFilenameExamples(REAL_TEXT)).toEqual([]);
  });

  it("flags an example whose photo_date disagrees with its filename", () => {
    const broken = REAL_TEXT.replace(
      "| photo_date | 2026-06-26                                              |",
      "| photo_date | 2025-01-01                                              |",
    );
    expect(broken).not.toBe(REAL_TEXT);
    const v = checkFilenameExamples(broken);
    expect(
      v.some((x) =>
        /photo_date '2025-01-01' does not match the date in its example/.test(x.message),
      ),
    ).toBe(true);
  });

  it("flags an example whose Photo ID disagrees with its filename", () => {
    const broken = REAL_TEXT.replace(
      "| Photo ID   | `SDxBD_SDxBD-F1-04_flower-wk6_top-canopy_2026-06-26_01` |",
      "| Photo ID   | `SDxBD_SDxBD-F1-04_flower-wk6_top-canopy_2026-06-27_01` |",
    );
    expect(broken).not.toBe(REAL_TEXT);
    const v = checkFilenameExamples(broken);
    expect(v.some((x) => /Photo ID '.*' does not match its example filename/.test(x.message))).toBe(
      true,
    );
  });

  it("cross-check failures surface through toStructuredFailures with distinct check names", () => {
    const dateBroken = REAL_TEXT.replace(
      "| photo_date | 2026-06-26                                              |",
      "| photo_date | 2025-01-01                                              |",
    );
    expect(toStructuredFailures(dateBroken, "doc.md").map((f) => f.check)).toContain(
      "filename-example-photo-date",
    );
    const idBroken = REAL_TEXT.replace(
      "| Photo ID   | `SDxBD_SDxBD-F1-04_flower-wk6_top-canopy_2026-06-26_01` |",
      "| Photo ID   | `SDxBD_SDxBD-F1-04_flower-wk6_top-canopy_2026-06-27_01` |",
    );
    expect(toStructuredFailures(idBroken, "doc.md").map((f) => f.check)).toContain(
      "filename-example-photo-id",
    );
  });

  it("cross-check reads parsed structure, not character distance to the next table", () => {
    // Padding the gap between the filename and its mapping table must not
    // disable the check the way a distance heuristic would.
    const padded = REAL_TEXT.replace(
      "`SDxBD_SDxBD-F1-04_flower-wk6_top-canopy_2026-06-26_01.jpg`\n",
      "`SDxBD_SDxBD-F1-04_flower-wk6_top-canopy_2026-06-26_01.jpg`\n\n" +
        `${"Filler prose that pushes the table far past any character-distance gate. ".repeat(6)}\n`,
    ).replace(
      "| photo_date | 2026-06-26                                              |",
      "| photo_date | 2025-01-01                                              |",
    );
    const v = checkFilenameExamples(padded);
    expect(v.some((x) => /photo_date '2025-01-01' does not match/.test(x.message))).toBe(true);
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
      "| Low        | external_tool      | Needs human review              |                   |",
      "| Low        | external_tool      | Needs human review              | 55                |",
    );
    const v = checkSampleOutputLog(broken);
    expect(v.some((x) => /must be blank/.test(x.message))).toBe(true);
  });

  it("flags filename / photo_date mismatch in sample log", () => {
    const broken = REAL_TEXT.replace(
      "| 2026-06-26 | flower-wk6 | side-view      | PlantCV 4.x (manual run) | estimated_height_cm",
      "| 2025-01-01 | flower-wk6 | side-view      | PlantCV 4.x (manual run) | estimated_height_cm",
    );
    const v = checkSampleOutputLog(broken);
    expect(v.some((x) => /does not match date in filename/.test(x.message))).toBe(true);
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
