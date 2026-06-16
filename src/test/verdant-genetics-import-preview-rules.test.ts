import { describe, expect, it } from "vitest";
import {
  buildGeneticsImportPreview,
  selectImportableRows,
} from "@/lib/verdantGeneticsImportPreviewRules";

const HEADER = ["Strain", "Breeder", "Seed Type", "Lineage", "Flowering Time", "Notes"];

describe("buildGeneticsImportPreview", () => {
  it("returns file-level error on empty grid", () => {
    const r = buildGeneticsImportPreview([]);
    expect(r.fileLevelError).toMatch(/does not contain a recognizable genetics sheet/);
    expect(r.rows).toEqual([]);
  });

  it("returns file-level error when headers are unrecognizable", () => {
    const r = buildGeneticsImportPreview([
      ["foo", "bar", "baz"],
      ["a", "b", "c"],
    ]);
    expect(r.fileLevelError).toMatch(/does not contain a recognizable genetics sheet/);
  });

  it("parses a valid row", () => {
    const r = buildGeneticsImportPreview([
      HEADER,
      ["Blueberry", "Dutch Passion", "feminized", "DJ Short BB x ?", "8", "indica-dominant"],
    ]);
    expect(r.fileLevelError).toBeNull();
    expect(r.rows).toHaveLength(1);
    const row = r.rows[0];
    expect(row.rowNumber).toBe(2);
    expect(row.strain).toBe("Blueberry");
    expect(row.breeder).toBe("Dutch Passion");
    expect(row.seedType).toBe("feminized");
    expect(row.floweringWeeks).toBe(8);
    expect(row.status).toBe("valid");
    expect(row.missingRequired).toEqual([]);
    expect(row.issues).toEqual([]);
  });

  it("row-numbers missing-strain errors using spreadsheet numbering", () => {
    const r = buildGeneticsImportPreview([
      HEADER,
      ["OK Strain", "Breeder A", "auto", null, null, null],
      ["OK Strain 2", "Breeder B", "feminized", null, null, null],
      ["", "Breeder C", "feminized", null, null, null], // row 4
    ]);
    const blocked = r.rows.find((x) => x.rowNumber === 4)!;
    expect(blocked.status).toBe("blocked");
    expect(blocked.missingRequired).toContain("strain");
    expect(blocked.issues.some((i) => i.message === "Row 4 is missing strain name.")).toBe(
      true,
    );
  });

  it("flags invalid seed type per row", () => {
    const r = buildGeneticsImportPreview([
      HEADER,
      ["A", "B", "auto", null, null, null],
      ["B", "C", "wat", null, null, null],
      ["C", "D", "feminized", null, null, null],
    ]);
    const bad = r.rows.find((x) => x.rowNumber === 3)!;
    expect(bad.status).toBe("blocked");
    expect(
      bad.issues.some((i) => i.message === "Row 3 has an invalid seed type."),
    ).toBe(true);
  });

  it("flags missing breeder", () => {
    const r = buildGeneticsImportPreview([
      HEADER,
      ["A", "B", "auto", null, null, null],
      ["A2", "", "auto", null, null, null], // row 3
    ]);
    expect(
      r.rows[1].issues.some((i) => i.message === "Row 3 is missing breeder."),
    ).toBe(true);
    expect(r.rows[1].status).toBe("blocked");
  });

  it("flags warning on unrecognized flowering time", () => {
    const r = buildGeneticsImportPreview([
      HEADER,
      ["A", "B", "auto", null, "soon", null],
    ]);
    expect(r.rows[0].status).toBe("warning");
    expect(
      r.rows[0].issues.some((i) => i.severity === "warning" && /flowering time/.test(i.message)),
    ).toBe(true);
  });

  it("skips empty rows", () => {
    const r = buildGeneticsImportPreview([
      HEADER,
      ["A", "B", "auto", null, null, null],
      [null, null, null, null, null, null],
      ["", "", "", "", "", ""],
      ["C", "D", "feminized", null, null, null],
    ]);
    expect(r.rows.map((x) => x.rowNumber)).toEqual([2, 5]);
  });

  it("computes totals", () => {
    const r = buildGeneticsImportPreview([
      HEADER,
      ["A", "B", "auto", null, null, null],
      ["", "B", "auto", null, null, null],
      ["C", "D", "auto", null, "soon", null],
    ]);
    expect(r.totals).toEqual({ total: 3, valid: 1, warning: 1, blocked: 1 });
  });

  it("selectImportableRows omits blocked rows only", () => {
    const r = buildGeneticsImportPreview([
      HEADER,
      ["A", "B", "auto", null, null, null],
      ["", "B", "auto", null, null, null],
      ["C", "D", "auto", null, "soon", null],
    ]);
    const importable = selectImportableRows(r);
    expect(importable.map((x) => x.rowNumber)).toEqual([2, 4]);
  });

  it("is deterministic across repeated calls", () => {
    const grid = [
      HEADER,
      ["A", "B", "auto", null, null, null],
      ["", "B", "auto", null, null, null],
    ];
    expect(buildGeneticsImportPreview(grid)).toEqual(buildGeneticsImportPreview(grid));
  });
});
