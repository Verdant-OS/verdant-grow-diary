/**
 * v0.6 — multiline / template-literal scanner coverage.
 *
 * These tests assert that the Contextual Pheno Comparison static safety
 * scanner correctly handles forbidden phrases inside multiline strings,
 * template literals, and multiline JSX text — and that comment stripping
 * preserves accurate line numbers.
 *
 * Unsafe phrases live ONLY in these synthetic test inputs. They are
 * never written to runtime files.
 */
import { describe, expect, it } from "vitest";
import { scanSource } from "@/test/utils/contextualPhenoComparisonStaticSafety";

describe("contextualPhenoComparisonStaticSafety — multiline / template literal", () => {
  it("flags forbidden phrase inside a multiline string", () => {
    const src = [
      "const a = 'first line' +",
      "  ' winner of the round';",
    ].join("\n");
    const findings = scanSource("fake.ts", src);
    expect(findings.some((f) => f.phrase === "winner")).toBe(true);
    expect(findings.find((f) => f.phrase === "winner")?.line).toBe(2);
  });

  it("flags forbidden phrase inside a single-line template literal", () => {
    const src = "const t = `please rank these plants`;";
    const findings = scanSource("fake.ts", src);
    expect(findings.some((f) => f.phrase === "rank")).toBe(true);
    expect(findings.find((f) => f.phrase === "rank")?.line).toBe(1);
  });

  it("flags forbidden phrase on second line of a template literal", () => {
    const src = [
      "const t = `header text",
      "winner of the comparison",
      "footer text`;",
    ].join("\n");
    const findings = scanSource("fake.ts", src);
    const winner = findings.find((f) => f.phrase === "winner");
    expect(winner).toBeDefined();
    expect(winner?.line).toBe(2);
  });

  it("flags forbidden phrase on third line of a template literal", () => {
    const src = [
      "const t = `line1",
      "line2",
      "scoreboard goes here",
      "line4`;",
    ].join("\n");
    const findings = scanSource("fake.ts", src);
    const sb = findings.find((f) => f.phrase === "scoreboard");
    expect(sb).toBeDefined();
    expect(sb?.line).toBe(3);
  });

  it("flags forbidden phrase inside multiline JSX text", () => {
    const src = [
      "function C() {",
      "  return (",
      "    <p>",
      "      this view will automatically select",
      "      the top pheno",
      "    </p>",
      "  );",
      "}",
    ].join("\n");
    const findings = scanSource("fake.tsx", src);
    const hit = findings.find((f) => f.phrase === "automatically-select");
    expect(hit).toBeDefined();
    expect(hit?.line).toBe(4);
  });

  it("ignores forbidden phrases inside line and block comments", () => {
    const src = [
      "// winner appears only in this comment",
      "/* scoreboard mentioned",
      "   across multiple comment lines",
      "   guaranteed safe */",
      "const ok = true;",
    ].join("\n");
    const findings = scanSource("fake.ts", src);
    expect(findings).toEqual([]);
  });

  it("preserves accurate line numbers after multiline comment stripping", () => {
    const src = [
      "/* block",
      "   comment",
      "   spans three lines */",
      "const ok = true;",
      "const label = 'winner';",
    ].join("\n");
    const findings = scanSource("fake.ts", src);
    expect(findings).toHaveLength(1);
    expect(findings[0].phrase).toBe("winner");
    expect(findings[0].line).toBe(5);
  });

  it("flags healthy-near-degraded wording on a single line", () => {
    const src = "const label = 'healthy (demo only)';";
    const findings = scanSource("fake.ts", src);
    expect(findings.some((f) => f.phrase === "healthy-near-degraded")).toBe(
      true,
    );
  });

  it("does not flag 'healthy' on its own line without degraded terms", () => {
    const src = [
      "const a = 'plant looks healthy';",
      "const b = 'all good';",
    ].join("\n");
    const findings = scanSource("fake.ts", src);
    expect(findings.some((f) => f.phrase === "healthy-near-degraded")).toBe(
      false,
    );
  });

  it("does not flag 'healthy' when degraded term sits on a different line (per-line heuristic)", () => {
    // The current heuristic is per-line. Healthy on line 1 with
    // 'demo' on line 3 must NOT cross-trigger.
    const src = [
      "const a = 'plant looks healthy';",
      "const b = 'unrelated';",
      "const c = 'demo only';",
    ].join("\n");
    const findings = scanSource("fake.ts", src);
    expect(findings.some((f) => f.phrase === "healthy-near-degraded")).toBe(
      false,
    );
  });
});
