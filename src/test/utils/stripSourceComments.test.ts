/**
 * Unit tests for the test-only stripSourceComments helper used by static
 * provenance/safety scanners.
 *
 * Goal: prove the helper survives tricky comment shapes that previously
 * tripped the provenance scan with harmless `[alert:<id>]` / `[session:<id>]`
 * mentions in docstrings.
 */
import { describe, it, expect } from "vitest";
import { stripSourceComments } from "./stripSourceComments";

describe("stripSourceComments — comment removal", () => {
  it("removes single-line comments containing [alert:]", () => {
    const src = `const a = 1; // mentions [alert:xyz] safely\nconst b = 2;`;
    const out = stripSourceComments(src);
    expect(out).not.toContain("[alert:");
    expect(out).toContain("const a = 1;");
    expect(out).toContain("const b = 2;");
  });

  it("removes block comments containing [alert:] and [session:]", () => {
    const src = `/* [alert:abc] and [session:def] */ const x = 42;`;
    const out = stripSourceComments(src);
    expect(out).not.toContain("[alert:");
    expect(out).not.toContain("[session:");
    expect(out).toContain("const x = 42;");
  });

  it("removes JSDoc comments containing [alert:]", () => {
    const src = [
      "/**",
      " * Parses the `[alert:<id>]` token from action.reason.",
      " * Never leaks `[session:<id>]` to the UI.",
      " */",
      "export function foo() { return 1; }",
    ].join("\n");
    const out = stripSourceComments(src);
    expect(out).not.toContain("[alert:");
    expect(out).not.toContain("[session:");
    expect(out).toContain("export function foo()");
  });

  it("removes inline trailing comments after executable code", () => {
    const src = `const href = "/alerts/" + id; // back-link, mentions [alert:<id>] token`;
    const out = stripSourceComments(src);
    expect(out).not.toContain("[alert:");
    expect(out).toContain('const href = "/alerts/" + id;');
  });

  it("removes comments placed next to JSX", () => {
    const src = [
      "return (",
      "  <div>",
      "    {/* row carries [alert:<id>] in reason — never render raw */}",
      "    <Badge label=\"Source\" />",
      "  </div>",
      ");",
    ].join("\n");
    const out = stripSourceComments(src);
    expect(out).not.toContain("[alert:");
    expect(out).toContain("<Badge");
  });

  it("removes comments near event handlers", () => {
    const src = [
      "const onClick = () => {",
      "  // navigates back to source alert; uses [alert:<id>] only via helper",
      "  navigate(alertDetailPath(id));",
      "};",
    ].join("\n");
    const out = stripSourceComments(src);
    expect(out).not.toContain("[alert:");
    expect(out).toContain("navigate(alertDetailPath(id));");
  });

  it("handles multiple comments of different kinds in one file", () => {
    const src = [
      "// header [alert:1]",
      "/* mid [alert:2] */",
      "const z = 9; // trailing [alert:3]",
      "/**",
      " * doc [session:4]",
      " */",
      "function g() { return z; }",
    ].join("\n");
    const out = stripSourceComments(src);
    expect(out).not.toContain("[alert:");
    expect(out).not.toContain("[session:");
    expect(out).toContain("const z = 9;");
    expect(out).toContain("function g()");
  });

  it("preserves real executable code verbatim", () => {
    const src = `const a = 1;\nconst b = a + 2;\nexport { a, b };`;
    expect(stripSourceComments(src)).toBe(src);
  });

  it("does NOT strip string literals that look like comments", () => {
    const src = `const url = "https://example.com/x"; const tag = "// not a comment";`;
    const out = stripSourceComments(src);
    expect(out).toContain('"https://example.com/x"');
    expect(out).toContain('"// not a comment"');
  });

  it("does NOT strip [alert:] embedded inside a string literal in executable code", () => {
    // Important: if a real string literal contained the raw token, the scan
    // SHOULD still flag it. The stripper must therefore leave string
    // contents intact so the downstream scan can catch it.
    const src = `const bad = "[alert:leak]";`;
    const out = stripSourceComments(src);
    expect(out).toContain("[alert:leak]");
  });

  it("handles template literals safely", () => {
    const src = "const t = `keep // this and /* this */ intact`;";
    const out = stripSourceComments(src);
    expect(out).toContain("`keep // this and /* this */ intact`");
  });

  it("handles escaped quotes inside strings", () => {
    const src = `const s = "a \\"// not a comment\\" b"; const y = 1;`;
    const out = stripSourceComments(src);
    expect(out).toContain('"a \\"// not a comment\\" b"');
    expect(out).toContain("const y = 1;");
  });

  it("is null/empty safe and deterministic", () => {
    expect(stripSourceComments("")).toBe("");
    // @ts-expect-error — defensive runtime guard
    expect(stripSourceComments(null)).toBe("");
    // @ts-expect-error — defensive runtime guard
    expect(stripSourceComments(undefined)).toBe("");
    const src = `const a = 1; // [alert:x]`;
    expect(stripSourceComments(src)).toBe(stripSourceComments(src));
  });
});
