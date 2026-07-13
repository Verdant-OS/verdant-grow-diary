import { describe, expect, it } from "vitest";
import {
  comparePhenoCandidatesByNumberThenLabel,
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
        base({
          candidateNumber: 3,
          candidateLabel: "Sour Zebra",
          plantName: "Plant A",
        }),
      ),
    ).toBe("#3 · Sour Zebra");
  });

  it("falls back to plant name with a valid number and no label", () => {
    expect(formatPhenoCandidateLabel(base({ candidateNumber: 7, plantName: "Plant A" }))).toBe(
      "#7 · Plant A",
    );
  });

  it("renders bare number when neither label nor name present", () => {
    expect(formatPhenoCandidateLabel(base({ candidateNumber: 42 }))).toBe("#42");
  });

  it("accepts boundary value 1", () => {
    expect(formatPhenoCandidateLabel(base({ candidateNumber: 1, candidateLabel: "First" }))).toBe(
      "#1 · First",
    );
  });

  it("treats null candidate number as absent and falls back to label", () => {
    expect(
      formatPhenoCandidateLabel(base({ candidateNumber: null, candidateLabel: "Legacy" })),
    ).toBe("Legacy");
  });

  it("treats undefined candidate number as absent and falls back to name", () => {
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
  ])("rejects %s candidate number and falls back", (_label, n) => {
    const out = formatPhenoCandidateLabel(
      base({ candidateNumber: n as number, candidateLabel: "Fallback" }),
    );
    expect(out).toBe("Fallback");
    expect(out).not.toContain("#0");
    expect(out).not.toContain("NaN");
    expect(out).not.toContain("Infinity");
  });

  it("falls back to plant name when no label and number invalid", () => {
    expect(formatPhenoCandidateLabel(base({ candidateNumber: 0, plantName: "Beta" }))).toBe("Beta");
  });

  it("falls back to short id prefix when nothing else present", () => {
    expect(formatPhenoCandidateLabel(base({ plantId: "abcdef1234567890" }))).toBe("#abcdef12");
  });

  it("returns #unknown when plant id is blank", () => {
    expect(formatPhenoCandidateLabel(base({ plantId: "   " }))).toBe("#unknown");
  });

  it("trims whitespace on label, name, and id", () => {
    expect(
      formatPhenoCandidateLabel(base({ candidateNumber: 5, candidateLabel: "   Trimmed   " })),
    ).toBe("#5 · Trimmed");
    expect(formatPhenoCandidateLabel(base({ plantName: "  Named  " }))).toBe("Named");
    expect(formatPhenoCandidateLabel(base({ plantId: "   xyz12345extra   " }))).toBe("#xyz12345");
  });

  it("treats blank strings as missing", () => {
    expect(
      formatPhenoCandidateLabel(base({ candidateNumber: 4, candidateLabel: "   ", plantName: "" })),
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

describe("comparePhenoCandidatesByNumberThenLabel", () => {
  const mk = (n: number, id = "id-x"): PhenoCandidateLabelInput => ({
    candidateNumber: n,
    candidateLabel: null,
    plantName: null,
    plantId: id,
  });

  it("orders valid numbers ascending (1, 2, 10)", () => {
    const arr = [mk(10, "a"), mk(1, "b"), mk(2, "c")];
    const sorted = [...arr].sort(comparePhenoCandidatesByNumberThenLabel);
    expect(sorted.map((x) => x.candidateNumber)).toEqual([1, 2, 10]);
  });

  it("places numbered candidates before unnumbered ones", () => {
    const numbered = mk(9, "num");
    const unnumbered: PhenoCandidateLabelInput = {
      candidateNumber: null,
      candidateLabel: "AAA",
      plantName: null,
      plantId: "u",
    };
    expect(comparePhenoCandidatesByNumberThenLabel(numbered, unnumbered)).toBeLessThan(0);
    expect(comparePhenoCandidatesByNumberThenLabel(unnumbered, numbered)).toBeGreaterThan(0);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["zero", 0],
    ["negative", -3],
    ["fractional", 2.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
  ])("treats %s as unnumbered", (_label, n) => {
    const invalid: PhenoCandidateLabelInput = {
      candidateNumber: n as number | null | undefined,
      candidateLabel: "Zzz",
      plantName: null,
      plantId: "i",
    };
    const numbered = mk(100, "n");
    expect(comparePhenoCandidatesByNumberThenLabel(numbered, invalid)).toBeLessThan(0);
  });

  it("prefers candidate label over plant name for unnumbered text", () => {
    const a: PhenoCandidateLabelInput = {
      candidateNumber: null,
      candidateLabel: "Apple",
      plantName: "Zebra",
      plantId: "a",
    };
    const b: PhenoCandidateLabelInput = {
      candidateNumber: null,
      candidateLabel: null,
      plantName: "Banana",
      plantId: "b",
    };
    // "apple" < "banana"
    expect(comparePhenoCandidatesByNumberThenLabel(a, b)).toBeLessThan(0);
  });

  it("sorts unnumbered alphabetically case-insensitively", () => {
    const arr: PhenoCandidateLabelInput[] = [
      { candidateNumber: null, candidateLabel: "cherry", plantName: null, plantId: "1" },
      { candidateNumber: null, candidateLabel: "Apple", plantName: null, plantId: "2" },
      { candidateNumber: null, candidateLabel: "banana", plantName: null, plantId: "3" },
    ];
    const sorted = [...arr].sort(comparePhenoCandidatesByNumberThenLabel);
    expect(sorted.map((x) => x.candidateLabel)).toEqual(["Apple", "banana", "cherry"]);
  });

  it("treats blank/whitespace label as missing", () => {
    const blank: PhenoCandidateLabelInput = {
      candidateNumber: null,
      candidateLabel: "   ",
      plantName: null,
      plantId: "blank-id",
    };
    const withText: PhenoCandidateLabelInput = {
      candidateNumber: null,
      candidateLabel: "Text",
      plantName: null,
      plantId: "text-id",
    };
    // blank -> category 2, withText -> category 1
    expect(comparePhenoCandidatesByNumberThenLabel(withText, blank)).toBeLessThan(0);
  });

  it("sorts id-only / unknown fallbacks last, by trimmed plant id", () => {
    const numbered = mk(1, "num");
    const named: PhenoCandidateLabelInput = {
      candidateNumber: null,
      candidateLabel: "Named",
      plantName: null,
      plantId: "z",
    };
    const idOnlyA: PhenoCandidateLabelInput = {
      candidateNumber: null,
      candidateLabel: null,
      plantName: null,
      plantId: "  aaa  ",
    };
    const idOnlyB: PhenoCandidateLabelInput = {
      candidateNumber: null,
      candidateLabel: null,
      plantName: null,
      plantId: "bbb",
    };
    const sorted = [idOnlyB, named, idOnlyA, numbered].sort(
      comparePhenoCandidatesByNumberThenLabel,
    );
    expect(sorted).toEqual([numbered, named, idOnlyA, idOnlyB]);
  });

  it("breaks duplicate-number ties by label, then name, then id", () => {
    const a: PhenoCandidateLabelInput = {
      candidateNumber: 5,
      candidateLabel: "Beta",
      plantName: null,
      plantId: "z",
    };
    const b: PhenoCandidateLabelInput = {
      candidateNumber: 5,
      candidateLabel: "Alpha",
      plantName: null,
      plantId: "a",
    };
    expect(comparePhenoCandidatesByNumberThenLabel(a, b)).toBeGreaterThan(0);

    const c: PhenoCandidateLabelInput = {
      candidateNumber: 5,
      candidateLabel: null,
      plantName: "Same",
      plantId: "y",
    };
    const d: PhenoCandidateLabelInput = {
      candidateNumber: 5,
      candidateLabel: null,
      plantName: "Same",
      plantId: "x",
    };
    expect(comparePhenoCandidatesByNumberThenLabel(c, d)).toBeGreaterThan(0);
  });

  it("returns 0 when every normalized key is equal", () => {
    const a: PhenoCandidateLabelInput = {
      candidateNumber: 3,
      candidateLabel: "  Same  ",
      plantName: "  Name  ",
      plantId: "  pid  ",
    };
    const b: PhenoCandidateLabelInput = {
      candidateNumber: 3,
      candidateLabel: "Same",
      plantName: "Name",
      plantId: "pid",
    };
    expect(comparePhenoCandidatesByNumberThenLabel(a, b)).toBe(0);
  });

  it("is antisymmetric", () => {
    const samples: PhenoCandidateLabelInput[] = [
      { candidateNumber: 1, candidateLabel: "A", plantName: null, plantId: "1" },
      { candidateNumber: 2, candidateLabel: null, plantName: "B", plantId: "2" },
      { candidateNumber: null, candidateLabel: "cherry", plantName: null, plantId: "3" },
      { candidateNumber: null, candidateLabel: null, plantName: "Zed", plantId: "4" },
      { candidateNumber: null, candidateLabel: null, plantName: null, plantId: "5" },
      { candidateNumber: Number.NaN, candidateLabel: "x", plantName: null, plantId: "6" },
    ];
    for (const a of samples) {
      for (const b of samples) {
        const ab = comparePhenoCandidatesByNumberThenLabel(a, b);
        const ba = comparePhenoCandidatesByNumberThenLabel(b, a);
        expect(Math.sign(ab)).toBe(-Math.sign(ba));
      }
    }
  });

  it("is deterministic across repeated sorts", () => {
    const arr: PhenoCandidateLabelInput[] = [
      { candidateNumber: 3, candidateLabel: "c", plantName: null, plantId: "3" },
      { candidateNumber: 1, candidateLabel: "a", plantName: null, plantId: "1" },
      { candidateNumber: null, candidateLabel: "beta", plantName: null, plantId: "b" },
      { candidateNumber: null, candidateLabel: null, plantName: null, plantId: "zzz" },
      { candidateNumber: 2, candidateLabel: "b", plantName: null, plantId: "2" },
      { candidateNumber: null, candidateLabel: "alpha", plantName: null, plantId: "a" },
    ];
    const first = [...arr].sort(comparePhenoCandidatesByNumberThenLabel);
    for (let i = 0; i < 25; i++) {
      const next = [...arr].sort(comparePhenoCandidatesByNumberThenLabel);
      expect(next).toEqual(first);
    }
  });

  it("does not mutate frozen inputs", () => {
    const a: PhenoCandidateLabelInput = Object.freeze({
      candidateNumber: 1,
      candidateLabel: "A",
      plantName: null,
      plantId: "a",
    });
    const b: PhenoCandidateLabelInput = Object.freeze({
      candidateNumber: 2,
      candidateLabel: "B",
      plantName: null,
      plantId: "b",
    });
    const snapA = { ...a };
    const snapB = { ...b };
    comparePhenoCandidatesByNumberThenLabel(a, b);
    comparePhenoCandidatesByNumberThenLabel(b, a);
    expect(a).toEqual(snapA);
    expect(b).toEqual(snapB);
  });

  it("sorting a copied array does not mutate the original", () => {
    const arr: PhenoCandidateLabelInput[] = [
      { candidateNumber: 3, candidateLabel: null, plantName: null, plantId: "3" },
      { candidateNumber: 1, candidateLabel: null, plantName: null, plantId: "1" },
      { candidateNumber: 2, candidateLabel: null, plantName: null, plantId: "2" },
    ];
    const snapshot = arr.map((x) => ({ ...x }));
    const copy = [...arr];
    copy.sort(comparePhenoCandidatesByNumberThenLabel);
    expect(arr).toEqual(snapshot);
  });
});
