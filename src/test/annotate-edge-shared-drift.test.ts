import { describe, it, expect } from "vitest";
import {
  parseDrift,
  escapeWorkflowCommand,
  formatAnnotation,
  collectFindings,
  locateSubstring,
  firstDifferingLine,
  enrichFinding,
} from "../../scripts/lib/annotate-edge-shared-drift-parse.mjs";


const MANIFEST = "supabase/functions/_shared/lib/.sync-manifest.json";

describe("parseDrift", () => {
  it("parses MISSING committed mirror lines", () => {
    const f = parseDrift(
      "MISSING committed mirror: supabase/functions/_shared/lib/foo.ts",
    );
    expect(f).toEqual({
      file: "supabase/functions/_shared/lib/foo.ts",
      title: "Edge mirror file missing",
      message: expect.stringContaining(
        "Mirror file supabase/functions/_shared/lib/foo.ts is expected",
      ),
    });
    expect(f?.message).toContain("bun run sync-edge-shared");
  });

  it("parses DRIFT: <file> differs lines", () => {
    const f = parseDrift(
      "DRIFT: supabase/functions/_shared/lib/bar.ts differs from generator output",
    );
    expect(f?.file).toBe("supabase/functions/_shared/lib/bar.ts");
    expect(f?.title).toBe("Edge mirror drift");
    expect(f?.message).toContain("src/ origin");
  });

  it("parses STALE committed mirror lines", () => {
    const f = parseDrift(
      "STALE committed mirror: supabase/functions/_shared/lib/baz.ts — not referenced by any entry file",
    );
    expect(f?.file).toBe("supabase/functions/_shared/lib/baz.ts");
    expect(f?.title).toBe("Stale edge mirror file");
    expect(f?.message).toContain("no edge function references it");
  });

  it("parses manifest sourceHashes drift as manifest file target", () => {
    const f = parseDrift(
      "DRIFT: .sync-manifest.json sourceHashes differ from generator",
    );
    expect(f?.file).toBe(MANIFEST);
    expect(f?.title).toBe("Edge mirror manifest drift");
  });

  it("parses MISSING .sync-manifest.json as manifest file target", () => {
    const f = parseDrift("MISSING .sync-manifest.json");
    expect(f?.file).toBe(MANIFEST);
    expect(f?.title).toBe("Edge mirror manifest missing");
  });

  it("parses ENTRY not rewritten with the offending specifier", () => {
    const f = parseDrift(
      `ENTRY not rewritten: supabase/functions/ai-doctor-review/index.ts still imports "../../../src/lib/foo"`,
    );
    expect(f?.file).toBe("supabase/functions/ai-doctor-review/index.ts");
    expect(f?.title).toBe("Edge entry not rewritten");
    expect(f?.message).toContain(`"../../../src/lib/foo"`);
    expect(f?.message).toContain("bun run sync-edge-shared");
  });

  it("strips a leading bullet ('- ') so bulleted checker output still parses", () => {
    const f = parseDrift(
      "  - MISSING committed mirror: supabase/functions/_shared/lib/qux.ts",
    );
    expect(f?.file).toBe("supabase/functions/_shared/lib/qux.ts");
  });

  it("returns null for unrelated / empty lines", () => {
    expect(parseDrift("")).toBeNull();
    expect(parseDrift("   ")).toBeNull();
    expect(parseDrift("OK — 81 mirrored files in sync with src/.")).toBeNull();
    expect(parseDrift("some random log line")).toBeNull();
    expect(parseDrift(null)).toBeNull();
    expect(parseDrift(undefined)).toBeNull();
  });
});

describe("escapeWorkflowCommand", () => {
  it("percent-encodes %, CR, LF so annotations don't truncate", () => {
    expect(escapeWorkflowCommand("100% done\r\nnext")).toBe(
      "100%25 done%0D%0Anext",
    );
  });

  it("escapes % before newlines so the encoded %0A is not re-encoded", () => {
    // If % were escaped after \n, "\n" -> "%0A" -> "%250A" (wrong).
    expect(escapeWorkflowCommand("\n")).toBe("%0A");
  });

  it("coerces non-string input", () => {
    expect(escapeWorkflowCommand(42)).toBe("42");
  });
});

describe("formatAnnotation", () => {
  it("defaults to line=1,col=1 when the finding has no location", () => {
    const line = formatAnnotation({
      file: "supabase/functions/_shared/lib/foo.ts",
      title: "Edge mirror drift",
      message: "foo.ts does not match its src/ origin.",
    });
    expect(line).toBe(
      "::error file=supabase/functions/_shared/lib/foo.ts,line=1,col=1,title=Edge mirror drift::foo.ts does not match its src/ origin.",
    );
  });

  it("uses finding.line / finding.col when provided", () => {
    const line = formatAnnotation({
      file: "a.ts",
      title: "t",
      message: "m",
      line: 42,
      col: 7,
    });
    expect(line).toBe("::error file=a.ts,line=42,col=7,title=t::m");
  });

  it("ignores non-integer or non-positive line/col values", () => {
    const line = formatAnnotation({
      file: "a.ts",
      title: "t",
      message: "m",
      line: 0,
      col: -3,
    });
    expect(line).toBe("::error file=a.ts,line=1,col=1,title=t::m");
  });

  it("escapes newlines in the message so a multi-line message stays on one annotation", () => {
    const line = formatAnnotation({
      file: "a.ts",
      title: "t",
      message: "line1\nline2",
    });
    expect(line).toBe("::error file=a.ts,line=1,col=1,title=t::line1%0Aline2");
  });
});


describe("collectFindings", () => {
  it("parses a full checker stderr block covering every drift shape", () => {
    const stderr = [
      "Checking mirror against src/…",
      "MISSING committed mirror: supabase/functions/_shared/lib/a.ts",
      "DRIFT: supabase/functions/_shared/lib/b.ts differs from generator output",
      "STALE committed mirror: supabase/functions/_shared/lib/c.ts — not referenced by any entry file",
      "DRIFT: .sync-manifest.json sourceHashes differ",
      "MISSING .sync-manifest.json",
      `ENTRY not rewritten: supabase/functions/foo/index.ts still imports "@/lib/thing"`,
      "", // blank
      "Done.",
    ].join("\n");

    const findings = collectFindings(stderr);
    expect(findings).toHaveLength(6);
    expect(findings.map((f) => f.title)).toEqual([
      "Edge mirror file missing",
      "Edge mirror drift",
      "Stale edge mirror file",
      "Edge mirror manifest drift",
      "Edge mirror manifest missing",
      "Edge entry not rewritten",
    ]);
    // Manifest findings retarget to the manifest file, not the raw text token.
    expect(findings[3].file).toBe(MANIFEST);
    expect(findings[4].file).toBe(MANIFEST);
  });

  it("handles CRLF line endings", () => {
    const stderr =
      "MISSING committed mirror: a.ts\r\nDRIFT: b.ts differs from generator output\r\n";
    expect(collectFindings(stderr).map((f) => f.file)).toEqual(["a.ts", "b.ts"]);
  });

  it("returns [] for clean output", () => {
    expect(collectFindings("OK — 81 mirrored files in sync with src/.")).toEqual(
      [],
    );
    expect(collectFindings("")).toEqual([]);
    expect(collectFindings(null)).toEqual([]);
  });
});

describe("locateSubstring", () => {
  it("returns 1-based line/col of first occurrence", () => {
    const text = "alpha\nbeta gamma\ndelta";
    expect(locateSubstring(text, "gamma")).toEqual({ line: 2, col: 6 });
  });

  it("returns line 1 col 1 for a needle at the very start", () => {
    expect(locateSubstring("hello world", "hello")).toEqual({ line: 1, col: 1 });
  });

  it("handles a match on the very first char of a later line", () => {
    expect(locateSubstring("a\nb\ncdef", "cdef")).toEqual({ line: 3, col: 1 });
  });

  it("returns null when the needle is missing", () => {
    expect(locateSubstring("abc", "xyz")).toBeNull();
  });

  it("returns null for invalid inputs", () => {
    expect(locateSubstring(null as unknown as string, "x")).toBeNull();
    expect(locateSubstring("abc", "")).toBeNull();
  });
});

describe("firstDifferingLine", () => {
  it("returns null when strings match", () => {
    expect(firstDifferingLine("a\nb\nc", "a\nb\nc")).toBeNull();
  });

  it("normalizes CRLF vs LF before comparing", () => {
    expect(firstDifferingLine("a\r\nb\r\nc", "a\nb\nc")).toBeNull();
  });

  it("finds the first differing line (1-based)", () => {
    expect(firstDifferingLine("a\nb\nc", "a\nB\nc")).toBe(2);
  });

  it("reports the extra trailing line when one side is longer", () => {
    expect(firstDifferingLine("a\nb", "a\nb\nc")).toBe(3);
  });

  it("returns null for non-string inputs", () => {
    expect(firstDifferingLine(null as unknown as string, "x")).toBeNull();
  });
});

describe("enrichFinding", () => {
  const MIRROR = "supabase/functions/_shared/lib";

  it("locates the real line/col of an offending import in an ENTRY finding", () => {
    const entryText =
      "// header comment\n" +
      "import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';\n" +
      'import { thing } from "@/lib/thing";\n' +
      "export const x = 1;\n";
    const finding = parseDrift(
      `ENTRY not rewritten: supabase/functions/foo/index.ts still imports "@/lib/thing"`,
    )!;
    const enriched = enrichFinding(finding, {
      readFile: (rel) =>
        rel === "supabase/functions/foo/index.ts" ? entryText : null,
    });
    // Line 3 = the `import { thing } from "@/lib/thing"` line.
    expect(enriched.line).toBe(3);
    // Col points at the start of the matched `from "..."` clause
    // (char 18 = the `f` in `from`, 1-based).
    expect(enriched.col).toBe(18);

  });

  it("prefers an actual import over a stray string literal in a comment", () => {
    const entryText =
      `// note: was previously "@/lib/thing" — kept for history\n` +
      `import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';\n` +
      `import { thing } from "@/lib/thing";\n`;
    const finding = parseDrift(
      `ENTRY not rewritten: supabase/functions/foo/index.ts still imports "@/lib/thing"`,
    )!;
    const enriched = enrichFinding(finding, {
      readFile: () => entryText,
    });
    expect(enriched.line).toBe(3);
  });

  it("falls back to bare-quoted specifier location when no import stmt matches", () => {
    const entryText = `const x = "@/lib/thing";\n`;
    const finding = parseDrift(
      `ENTRY not rewritten: supabase/functions/foo/index.ts still imports "@/lib/thing"`,
    )!;
    const enriched = enrichFinding(finding, { readFile: () => entryText });
    expect(enriched.line).toBe(1);
    expect(enriched.col).toBe(11); // char position of the leading '"'
  });

  it("returns the finding unchanged when the entry file can't be read", () => {
    const finding = parseDrift(
      `ENTRY not rewritten: supabase/functions/foo/index.ts still imports "@/lib/thing"`,
    )!;
    const enriched = enrichFinding(finding, { readFile: () => null });
    expect(enriched).toEqual(finding);
    expect(enriched.line).toBeUndefined();
  });

  it("returns first differing line for a DRIFT mirror finding when expected content is provided", () => {
    const actual =
      "// @generated by scripts/sync-edge-shared.mjs — DO NOT EDIT.\n" +
      "// Source: src/lib/foo.ts\n" +
      "// sha256: abc\n" +
      "// To regenerate: bun run sync-edge-shared\n" +
      "\n" +
      "export const value = 1;\n";
    const expected = actual.replace("value = 1", "value = 2");
    const finding = parseDrift(
      `DRIFT: ${MIRROR}/foo.ts differs from generator output`,
    )!;
    const enriched = enrichFinding(finding, {
      readFile: (rel) => (rel === `${MIRROR}/foo.ts` ? actual : null),
      readExpected: (rel) => (rel === "foo.ts" ? expected : null),
      mirrorRel: MIRROR,
    });
    expect(enriched.line).toBe(6);
    expect(enriched.col).toBe(1);
  });

  it("leaves DRIFT unchanged when expected content is unavailable", () => {
    const finding = parseDrift(
      `DRIFT: ${MIRROR}/foo.ts differs from generator output`,
    )!;
    const enriched = enrichFinding(finding, {
      readFile: () => "actual content",
      readExpected: () => null,
      mirrorRel: MIRROR,
    });
    expect(enriched.line).toBeUndefined();
  });

  it("leaves MISSING / STALE / manifest findings unchanged (no meaningful body line)", () => {
    const missing = parseDrift(`MISSING committed mirror: ${MIRROR}/x.ts`)!;
    const stale = parseDrift(`STALE committed mirror: ${MIRROR}/y.ts`)!;
    const manifest = parseDrift("MISSING .sync-manifest.json")!;
    const ctx = { readFile: () => "irrelevant", readExpected: () => "irrelevant" };
    expect(enrichFinding(missing, ctx)).toEqual(missing);
    expect(enrichFinding(stale, ctx)).toEqual(stale);
    expect(enrichFinding(manifest, ctx)).toEqual(manifest);
  });

  it("emits an annotation with the enriched line/col via formatAnnotation", () => {
    const entryText = `import x from "@/lib/thing";\n`;
    const finding = parseDrift(
      `ENTRY not rewritten: supabase/functions/foo/index.ts still imports "@/lib/thing"`,
    )!;
    const enriched = enrichFinding(finding, { readFile: () => entryText });
    const annotation = formatAnnotation(enriched);
    expect(annotation).toContain("line=1,col=1");
    expect(annotation).toContain("file=supabase/functions/foo/index.ts");
  });
});
