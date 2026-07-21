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
