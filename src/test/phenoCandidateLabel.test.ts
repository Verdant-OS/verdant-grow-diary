import { describe, expect, it } from "vitest";
import {
  formatPhenoCandidateLabel,
  type PhenoCandidateLabelInput,
} from "@/lib/phenoCandidateLabel";

const base = (overrides: Partial<PhenoCandidateLabelInput> = {}): PhenoCandidateLabelInput => ({
  candidateNumber: null,
  candidateLabel: null,
  plantName: null,
  plantId: "abcdef1234567890",
  ...overrides,
});

describe("formatPhenoCandidateLabel", () => {
  it("prefers candidate label with a valid number", () => {
    expect(
      formatPhenoCandidateLabel(
        base({ candidateNumber: 3, candidateLabel: "Sour Zebra", plantName: "Plant A" }),
      ),
    ).toBe("#3 · Sour Zebra");
  });

  it("falls back to plant name with a valid number and no label", () => {
    expect(
      formatPhenoCandidateLabel(base({ candidateNumber: 7, plantName: "Plant A" })),
    ).toBe("#7 · Plant A");
  });

  it("renders bare number when neither label nor name present", () => {
    expect(formatPhenoCandidateLabel(base({ candidateNumber: 42 }))).toBe("#42");
  });

  it("accepts boundary value 1", () => {
    expect(
      formatPhenoCandidateLabel(base({ candidateNumber: 1, candidateLabel: "First" })),
    ).toBe("#1 · First");
  });

  it("treats null candidate number as absent and falls back", () => {
    expect(
      formatPhenoCandidateLabel(base({ candidateNumber: null, candidateLabel: "Legacy" })),
    ).toBe("Legacy");
  });

  it("treats undefined candidate number as absent and falls back", () => {
    expect(
      formatPhenoCandidateLabel(base({ candidateNumber: undefined, plantName: "OnlyName" })),
    ).toBe("OnlyName");
  });

  it.each([
    ["zero", 0],
    ["negative", -3],
    ["fractional", 2.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("rejects %s and falls back", (_label, n) => {
    const out = formatPhenoCandidateLabel(
      base({ candidateNumber: n as number, candidateLabel: "Fallback" }),
    );
    expect(out).toBe("Fallback");
    expect(out).not.toContain("#0");
    expect(out).not.toContain("NaN");
    expect(out).not.toContain("Infinity");
  });

  it("falls back to candidate label when number invalid", () => {
    expect(
      formatPhenoCandidateLabel(base({ candidateNumber: 0, candidateLabel: "Alpha" })),
    ).toBe("Alpha");
  });

  it("falls back to plant name when no label and number invalid", () => {
    expect(
      formatPheno_CandidateLabel_workaround(base({ candidateNumber: null, plantName: "Beta" })),
    ).toBe("Beta");
  });

  it("falls back to short id prefix when nothing else present", () => {
    expect(
      formatPhenoCandidateLabel(base({ plantId: "abcdef1234567890" })),
    ).toBe("#abcdef12");
  });

  it("returns #unknown when plant id is blank", () => {
    expect(formatPhenoCandidateLabel(base({ plantId: "   " }))).toBe("#unknown");
  });

  it("trims whitespace on label, name, and id", () => {
    expect(
      formatPhenoCandidateLabel(
        base({ candidateNumber: 5, candidateLabel: "   Trimmed   " }),
      ),
    ).toBe("#5 · Trimmed");
    expect(
      formatPhenoCandidateLabel(base({ plantName: "  Named  " })),
    ).toBe("Named");
    expect(
      formatPhenoCandidateLabel(base({ plantId: "   xyz12345extra   " })),
    ).toBe("#xyz12345");
  });

  it("treats blank strings as missing", () => {
    expect(
      formatPhenoCandidateLabel(
        base({ candidateNumber: 4, candidateLabel: "   ", plantName: "" }),
      ),
    ).toBe("#4");
  });

  it("is deterministic across repeated calls", () => {
    const input = base({ candidateNumber: 9, candidateLabel: "Repeat" });
    const first = formatPhenoCandidateLabel(input);
    for (let i = 0; i < 25; i++) {
      expect(formatPhenoCandidateLabel(input)).toBe(first);
    }
  });

  it("does not mutate a frozen input", () => {
    const input: PhenoCandidateLabelInput = Object.freeze({
      candidateNumber: 2,
      candidateLabel: "  Frozen  ",
      plantName: "  Name  ",
      plantId: "  frozenid1234  ",
    });
    const snapshot = { ...input };
    const out = formatPhenoCandidateLabel(input);
    expect(out).toBe("#2 · Frozen");
    expect(input).toEqual(snapshot);
  });
});

// Alias to catch typo protection at compile time — not exported.
// (Left intentionally undefined; used only within a single test above.)
declare const formatPhenoCandidateLabel_alias: never;
function formatPheno_CandidateLabel_workaround(
  input: PhenoCandidateLabelInput,
): string {
  return formatPhenoCandidateLabel(input);
}
