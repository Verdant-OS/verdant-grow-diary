/**
 * Unit tests for the Contextual Pheno Comparison static-safety utility.
 * Scans synthetic fixture strings (not real repo files) to prove the
 * scanner detects each forbidden category, ignores comments, preserves
 * line numbers, and formats local + GitHub Actions output safely.
 */
import { describe, expect, it } from "vitest";
import {
  filterChangedContextualPhenoFiles,
  formatFindingsJson,
  formatGithubAnnotation,
  formatGithubAnnotations,
  formatLocalReport,
  groupByFile,
  sanitizeAnnotationMessage,
  scanSource,
  type Finding,
} from "@/test/utils/contextualPhenoComparisonStaticSafety";


describe("contextualPhenoComparisonStaticSafety — scanner", () => {
  it("detects write/API operations", () => {
    const src = [
      "const a = 1;",
      "await supabase.functions.invoke('x');",
      "await client.from('t').insert({});",
      "await client.from('t').update({});",
      "await client.from('t').delete();",
      "await client.from('t').upsert({});",
      "await fetch('/api');",
    ].join("\n");
    const findings = scanSource("fake.ts", src);
    const categories = new Set(findings.map((f) => f.category));
    expect(categories.has("write/API operation")).toBe(true);
    const phrases = findings.map((f) => f.phrase);
    expect(phrases).toEqual(
      expect.arrayContaining([
        "functions-invoke",
        "supabase-insert",
        "supabase-update",
        "supabase-delete",
        "supabase-upsert",
        "fetch-call",
      ]),
    );
  });

  it("detects ranking/selection wording", () => {
    const src = "const label = 'Winner'; // ranks plants\nconst x = autoSelect();";
    const findings = scanSource("fake.ts", src);
    const phrases = findings.map((f) => f.phrase);
    expect(phrases).toEqual(expect.arrayContaining(["winner", "auto-select"]));
    expect(findings.every((f) => f.category === "ranking/selection")).toBe(true);
  });

  it("detects certainty/overclaiming wording", () => {
    const src = "// safe comment about certainty\nconst msg = 'This is guaranteed to work';";
    const findings = scanSource("fake.ts", src);
    expect(findings.map((f) => f.phrase)).toContain("guaranteed");
    // comment-only mention should be stripped
    expect(findings.map((f) => f.phrase)).not.toContain("certain");
  });

  it("detects device-control/dosing wording", () => {
    const src = "const msg = 'dose nutrients now'; set fan on; device command issued;";
    const findings = scanSource("fake.ts", src);
    expect(findings.every((f) => f.category === "device-control/dosing")).toBe(true);
    expect(findings.map((f) => f.phrase)).toEqual(
      expect.arrayContaining(["dose-nutrients", "set-fan", "device-command"]),
    );
  });

  it("detects unsafe healthy-near-degraded wording", () => {
    const src = "const label = 'Healthy (demo data)';";
    const findings = scanSource("fake.ts", src);
    expect(findings.some((f) => f.phrase === "healthy-near-degraded")).toBe(true);
    expect(findings[0].category).toBe("unsafe degraded-data wording");
  });

  it("ignores forbidden phrases inside comments", () => {
    const src = [
      "// winner is forbidden",
      "/* functions.invoke is also blocked here */",
      "const ok = true;",
    ].join("\n");
    const findings = scanSource("fake.ts", src);
    expect(findings).toEqual([]);
  });

  it("reports the original line number for violations", () => {
    const src = ["// header", "const ok = true;", "", "const label = 'winner';"].join("\n");
    const findings = scanSource("fake.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].line).toBe(4);
  });
});

describe("contextualPhenoComparisonStaticSafety — formatters", () => {
  const findings: Finding[] = [
    {
      file: "src/components/ContextualPhenoComparisonPanel.tsx",
      line: 42,
      category: "ranking/selection",
      phrase: "winner",
      excerpt: "const label = \"Winner\";",
    },
    {
      file: "src/pages/ContextualPhenoComparisonDemo.tsx",
      line: 88,
      category: "write/API operation",
      phrase: "functions-invoke",
      excerpt: "await supabase.functions.invoke('x')",
    },
  ];

  it("groups findings by file", () => {
    const grouped = groupByFile(findings);
    expect([...grouped.keys()]).toEqual([
      "src/components/ContextualPhenoComparisonPanel.tsx",
      "src/pages/ContextualPhenoComparisonDemo.tsx",
    ]);
  });

  it("formats a grouped local report", () => {
    const report = formatLocalReport(findings);
    expect(report).toContain("Contextual Pheno Comparison static safety failed");
    expect(report).toContain("src/components/ContextualPhenoComparisonPanel.tsx");
    expect(report).toContain("- line 42 [ranking/selection] \"winner\"");
    expect(report).toContain("- line 88 [write/API operation] \"functions-invoke\"");
  });

  it("returns empty local report for no findings", () => {
    expect(formatLocalReport([])).toBe("");
  });

  it("formats sanitised GitHub annotations", () => {
    const lines = formatGithubAnnotations(findings).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(
      /^::error file=src\/components\/ContextualPhenoComparisonPanel\.tsx,line=42,title=Contextual Pheno Comparison safety::/,
    );
    expect(lines[0]).toContain("[ranking/selection]");
    expect(lines[0]).toContain("\"winner\"");
  });

  it("sanitises newlines and :: in annotation messages", () => {
    const msg = sanitizeAnnotationMessage("bad\nthing :: with :: marker");
    expect(msg).not.toContain("\n");
    expect(msg).not.toMatch(/(^|[^:\u200b]):(?!\u200b)/);
    expect(msg).toContain(":\u200b:");
  });

  it("truncates long offending lines in annotations", () => {
    const long = "x".repeat(500);
    const ann = formatGithubAnnotation({
      file: "f.ts",
      line: 1,
      category: "ranking/selection",
      phrase: "winner",
      excerpt: long,
    });
    expect(ann.length).toBeLessThan(300);
    expect(ann.endsWith("…")).toBe(true);
  });

  it("omits line= when line is unknown (<=0)", () => {
    const ann = formatGithubAnnotation({
      file: "f.ts",
      line: 0,
      category: "ranking/selection",
      phrase: "winner",
      excerpt: "x",
    });
    expect(ann).not.toContain("line=");
  });
});
