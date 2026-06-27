/**
 * Self-tests for the AI Doctor output safety scanner utility.
 *
 * Covers warning-framing rules, action-queue strictness, dosing
 * imperatives, certainty word-boundaries, recursive path reporting,
 * grouped formatting, and defensive handling of non-string nodes.
 *
 * No model calls, no schema, no Action Queue writes — pure unit tests
 * over the test utility under src/test/utils/.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it, expect } from "vitest";

import {
  scanDiagnosisForUnsafePhrases,
  formatUnsafePhraseReport,
  formatUnsafePhraseGitHubAnnotations,
  type UnsafePhraseFinding,
} from "./utils/aiDoctorOutputSafetyScanner";

describe("aiDoctorOutputSafetyScanner — unsafe phrase detection", () => {
  it("flags unsafe phrase in summary", () => {
    const v = scanDiagnosisForUnsafePhrases({ summary: "We guarantee fix." });
    expect(v.length).toBeGreaterThan(0);
    expect(v[0].path).toBe("result.summary");
  });

  it("flags unsafe phrase nested in safety_notes when not warning-framed", () => {
    const v = scanDiagnosisForUnsafePhrases({
      safety_notes: ["Turn on pump to recover."],
    });
    expect(v.some((x) => x.path === "result.safety_notes[0]")).toBe(true);
  });

  it("passes warning-framed entry in what_not_to_do", () => {
    const v = scanDiagnosisForUnsafePhrases({
      what_not_to_do: ["Do not turn on pump to force recovery."],
    });
    expect(v).toEqual([]);
  });

  it("passes warning-framed entry in safety_notes", () => {
    const v = scanDiagnosisForUnsafePhrases({
      safety_notes: ["Avoid increase feed during recovery."],
    });
    expect(v).toEqual([]);
  });

  it("flags unsafe phrase in action_queue_suggestion.reason even with 'review' wording", () => {
    const v = scanDiagnosisForUnsafePhrases({
      action_queue_suggestion: {
        reason: "Please review and turn on fan to balance VPD.",
      },
    });
    expect(
      v.some((x) => x.path === "result.action_queue_suggestion.reason"),
    ).toBe(true);
  });

  it("flags dosing phrase in immediate_action", () => {
    const v = scanDiagnosisForUnsafePhrases({
      immediate_action: "Dose nutrients at 1.4 EC now.",
    });
    expect(v.some((x) => x.path === "result.immediate_action")).toBe(true);
  });

  it("flags certainty word boundary 'certain' but not 'uncertain'", () => {
    const bad = scanDiagnosisForUnsafePhrases({ summary: "We are certain." });
    const ok = scanDiagnosisForUnsafePhrases({
      summary: "Cause is uncertain pending data.",
    });
    expect(bad.length).toBeGreaterThan(0);
    expect(ok).toEqual([]);
  });

  it("reports exact nested array path", () => {
    const v = scanDiagnosisForUnsafePhrases({
      what_not_to_do: ["Do not over-water.", "Guaranteed cure once watered."],
    });
    expect(v.some((x) => x.path === "result.what_not_to_do[1]")).toBe(true);
  });

  it("reports exact nested object path", () => {
    const v = scanDiagnosisForUnsafePhrases({
      action_queue_suggestion: { reason: "Send command to controller." },
    });
    expect(v[0].path).toBe("result.action_queue_suggestion.reason");
  });
});

describe("aiDoctorOutputSafetyScanner — defensive walking", () => {
  it("handles null, undefined, numbers, booleans, and empty arrays/objects", () => {
    expect(scanDiagnosisForUnsafePhrases(null)).toEqual([]);
    expect(scanDiagnosisForUnsafePhrases(undefined)).toEqual([]);
    expect(scanDiagnosisForUnsafePhrases(42)).toEqual([]);
    expect(scanDiagnosisForUnsafePhrases(true)).toEqual([]);
    expect(scanDiagnosisForUnsafePhrases([])).toEqual([]);
    expect(scanDiagnosisForUnsafePhrases({})).toEqual([]);
    expect(
      scanDiagnosisForUnsafePhrases({
        confidence: 0.5,
        is_safe: true,
        evidence: [],
        action_queue_suggestion: null,
      }),
    ).toEqual([]);
  });

  it("respects custom rootPath via options", () => {
    const v = scanDiagnosisForUnsafePhrases(
      { summary: "Guaranteed result." },
      { rootPath: "case_xyz" },
    );
    expect(v[0].path).toBe("case_xyz.summary");
  });

  it("respects rootPath when passed as plain string", () => {
    const v = scanDiagnosisForUnsafePhrases(
      { summary: "Guaranteed result." },
      "case_xyz",
    );
    expect(v[0].path).toBe("case_xyz.summary");
  });

  it("attaches caseId from options to every finding", () => {
    const v = scanDiagnosisForUnsafePhrases(
      { summary: "Guaranteed result." },
      { caseId: "case-a" },
    );
    expect(v[0].caseId).toBe("case-a");
  });
});

describe("aiDoctorOutputSafetyScanner — formatUnsafePhraseReport", () => {
  it("returns empty string when there are no findings", () => {
    expect(formatUnsafePhraseReport([])).toBe("");
  });

  it("groups findings by case id and includes path, phrase, text", () => {
    const findings: UnsafePhraseFinding[] = [
      {
        caseId: "case-a",
        path: "result.action_queue_suggestion.reason",
        phrase: "set fan",
        text: "Review and set fan speed higher.",
      },
      {
        caseId: "case-b",
        path: "result.immediate_action",
        phrase: "dose nutrients",
        text: "Dose nutrients immediately.",
      },
      {
        caseId: "case-a",
        path: "result.summary",
        phrase: "guarantee",
        text: "We guarantee recovery.",
      },
    ];
    const report = formatUnsafePhraseReport(findings);
    expect(report).toContain("AI Doctor output safety scan failed");
    expect(report).toContain("Case: case-a");
    expect(report).toContain("Case: case-b");
    expect(report).toContain("Path: result.action_queue_suggestion.reason");
    expect(report).toContain('Phrase: "set fan"');
    expect(report).toContain('Text: "Review and set fan speed higher."');
    // case-a appears before case-b (sorted)
    expect(report.indexOf("Case: case-a")).toBeLessThan(
      report.indexOf("Case: case-b"),
    );
  });

  it("uses '(uncategorized)' when caseId is missing", () => {
    const report = formatUnsafePhraseReport([
      { path: "result.summary", phrase: "guarantee", text: "We guarantee." },
    ]);
    expect(report).toContain("Case: (uncategorized)");
  });
});

describe("aiDoctorOutputSafetyScanner — formatUnsafePhraseGitHubAnnotations", () => {
  const sample: UnsafePhraseFinding = {
    caseId: "case-a",
    path: "result.action_queue_suggestion.reason",
    phrase: "set fan",
    text: "Review and set fan speed higher.",
  };

  it("returns empty string when there are no findings", () => {
    expect(formatUnsafePhraseGitHubAnnotations([])).toBe("");
  });

  it("emits one ::error annotation per finding with case id, path, and phrase", () => {
    const out = formatUnsafePhraseGitHubAnnotations([sample]);
    expect(out.startsWith("::error ")).toBe(true);
    expect(out).toContain("case-a");
    expect(out).toContain("result.action_queue_suggestion.reason");
    expect(out).toContain('"set fan"');
    expect(out).toContain("title=AI Doctor unsafe phrase");
  });

  it("omits line= when no line is provided", () => {
    const out = formatUnsafePhraseGitHubAnnotations([sample]);
    expect(out).not.toMatch(/,line=/);
  });

  it("includes line= when provided", () => {
    const out = formatUnsafePhraseGitHubAnnotations([sample], { line: 42 });
    expect(out).toContain(",line=42,");
  });

  it("uses default test file path when none is supplied", () => {
    const out = formatUnsafePhraseGitHubAnnotations([sample]);
    expect(out).toContain(
      "file=src/test/ai-doctor-output-safety-scanner.test.ts",
    );
  });

  it("sanitizes newline and `::` characters in offending text", () => {
    const out = formatUnsafePhraseGitHubAnnotations([
      {
        ...sample,
        text: "Line one\nLine two with ::error injection",
      },
    ]);
    // Single annotation line only.
    expect(out.split("\n").length).toBe(1);
    expect(out).not.toContain("\n");
    expect(out).not.toMatch(/::error injection/);
  });

  it("falls back to (uncategorized) when caseId is missing", () => {
    const out = formatUnsafePhraseGitHubAnnotations([
      { path: "result.summary", phrase: "guarantee", text: "We guarantee." },
    ]);
    expect(out).toContain("(uncategorized)");
  });

  it("truncates very long offending text", () => {
    const long = "x".repeat(500);
    const out = formatUnsafePhraseGitHubAnnotations(
      [{ ...sample, text: long }],
      { maxTextLength: 40 },
    );
    expect(out).toContain("…");
    // Annotation line should be well below the raw text length.
    expect(out.length).toBeLessThan(400);
  });
});

describe("aiDoctorOutputSafetyScanner — README", () => {
  const readmePath = resolve(
    process.cwd(),
    "src/test/utils/README.ai-doctor-output-safety-scanner.md",
  );

  it("exists at the documented path", () => {
    expect(existsSync(readmePath)).toBe(true);
  });

  it("documents warning-framing exceptions and strict Action Queue mode", () => {
    const md = readFileSync(readmePath, "utf8");
    expect(md).toMatch(/warning[- ]?fram/i);
    expect(md).toContain("what_not_to_do");
    expect(md).toContain("safety_notes");
    expect(md).toContain("action_queue_suggestion");
    expect(md.toLowerCase()).toContain("strict");
  });

  it("states that certainty phrases are never allowed, even in warning fields", () => {
    const md = readFileSync(readmePath, "utf8").toLowerCase();
    expect(md).toContain("certainty");
    expect(md).toMatch(/never allowed|never permitted/);
  });

  it("documents the scan-only and complete Phase 1 commands", () => {
    const md = readFileSync(readmePath, "utf8");
    expect(md).toContain("bun run test:ai-doctor-output-safety-scan");
    expect(md).toContain("bun run test:ai-doctor-phase1");
    expect(md).toContain("node scripts/sensor-safety-check.mjs");
  });
});
