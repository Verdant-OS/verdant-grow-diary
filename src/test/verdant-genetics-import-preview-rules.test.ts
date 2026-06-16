import { describe, expect, it } from "vitest";
import {
  buildGeneticsImportPreview,
  buildGeneticsTemplateCsv,
  buildGeneticsValidationReportCsv,
  GENETICS_TEMPLATE_REQUIRED_COLUMNS,
  GENETICS_VALIDATION_REPORT_COLUMNS,
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
    expect(blocked.issues.some((i) => i.message === "Row 4 is missing strain name.")).toBe(true);
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
    expect(bad.issues.some((i) => i.message === "Row 3 has an invalid seed type.")).toBe(true);
  });

  it("flags missing breeder", () => {
    const r = buildGeneticsImportPreview([
      HEADER,
      ["A", "B", "auto", null, null, null],
      ["A2", "", "auto", null, null, null], // row 3
    ]);
    expect(r.rows[1].issues.some((i) => i.message === "Row 3 is missing breeder.")).toBe(true);
    expect(r.rows[1].status).toBe("blocked");
  });

  it("flags warning on unrecognized flowering time", () => {
    const r = buildGeneticsImportPreview([HEADER, ["A", "B", "auto", null, "soon", null]]);
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

describe("header alias detection", () => {
  const baseRow = ["My Strain", "Dutch Passion", "feminized"];
  it.each([
    ["strain", "strain"],
    ["Strain Name", "strain name"],
    ["Variety", "variety"],
    ["Cultivar Name", "cultivar name"],
    ["GENETICS", "genetics"],
    ["name", "name"],
  ])("recognizes %s as strain", (header) => {
    const r = buildGeneticsImportPreview([[header, "Breeder", "Seed Type"], baseRow]);
    expect(r.fileLevelError).toBeNull();
    expect(r.rows[0].strain).toBe("My Strain");
  });

  it.each(["breeder", "Breeder Name", "Seed Bank", "seedbank", "company", "source"])(
    "recognizes %s as breeder",
    (header) => {
      const r = buildGeneticsImportPreview([["Strain", header, "Seed Type"], baseRow]);
      expect(r.rows[0].breeder).toBe("Dutch Passion");
    },
  );

  it.each(["seed type", "type", "Category", "Genetics Type", "Seed Class"])(
    "recognizes %s as seed_type",
    (header) => {
      const r = buildGeneticsImportPreview([["Strain", "Breeder", header], baseRow]);
      expect(r.rows[0].seedType).toBe("feminized");
    },
  );

  it("recognizes flowering time as flowering_weeks", () => {
    const r = buildGeneticsImportPreview([
      ["Strain", "Breeder", "Seed Type", "Flowering Time"],
      ["A", "B", "auto", "9"],
    ]);
    expect(r.rows[0].floweringWeeks).toBe(9);
  });

  it("normalizes punctuation, hyphens, and underscores in headers", () => {
    const r = buildGeneticsImportPreview([
      ["strain-name", "seed_bank", "seed type"],
      ["A", "B", "auto"],
    ]);
    expect(r.fileLevelError).toBeNull();
    expect(r.rows[0].strain).toBe("A");
    expect(r.rows[0].breeder).toBe("B");
  });

  it("warns when two columns map to the same canonical field, using first detected", () => {
    const r = buildGeneticsImportPreview([
      ["Strain", "Variety", "Breeder", "Seed Type"],
      ["First", "Second", "B", "auto"],
    ]);
    const w = r.fileWarnings.find((x) => x.field === "strain");
    expect(w).toBeDefined();
    expect(r.rows[0].strain).toBe("First");
    expect(w!.usedColumn?.header).toBe("Strain");
    expect(w!.ignoredColumns?.map((c) => c.header)).toEqual(["Variety"]);
    expect(w!.message).toContain('Field "strain"');
    expect(w!.message).toContain('used column "Strain"');
    expect(w!.message).toContain('"Variety"');
  });

  it("still produces row-numbered errors when required fields are missing", () => {
    const r = buildGeneticsImportPreview([
      ["Variety", "Seed Bank", "Type"],
      ["", "B", "auto"],
    ]);
    expect(r.rows[0].issues.some((i) => i.message === "Row 2 is missing strain name.")).toBe(true);
  });

  it("first column wins for multiple duplicate aliases across strain/breeder/seed_type", () => {
    const r = buildGeneticsImportPreview([
      ["variety", "strain", "seed bank", "breeder", "type", "seed type"],
      ["VarietyVal", "StrainVal", "SeedBankVal", "BreederVal", "auto", "feminized"],
      ["", "X", "", "Y", "", "auto"], // row 3: missing strain/breeder via WINNING columns
    ]);
    expect(r.fileLevelError).toBeNull();
    // First column wins
    expect(r.rows[0].strain).toBe("VarietyVal");
    expect(r.rows[0].breeder).toBe("SeedBankVal");
    expect(r.rows[0].seedType).toBe("autoflower");
    // Duplicate warnings per affected canonical field
    const fields = r.fileWarnings.map((w) => w.field).sort();
    expect(fields).toEqual(["breeder", "seed_type", "strain"]);
    const strainW = r.fileWarnings.find((w) => w.field === "strain")!;
    expect(strainW.usedColumn?.header).toBe("variety");
    expect(strainW.ignoredColumns?.map((c) => c.header)).toEqual(["strain"]);
    const breederW = r.fileWarnings.find((w) => w.field === "breeder")!;
    expect(breederW.usedColumn?.header).toBe("seed bank");
    expect(breederW.ignoredColumns?.map((c) => c.header)).toEqual(["breeder"]);
    const seedW = r.fileWarnings.find((w) => w.field === "seed_type")!;
    expect(seedW.usedColumn?.header).toBe("type");
    expect(seedW.ignoredColumns?.map((c) => c.header)).toEqual(["seed type"]);
    // Row-numbered errors still align to spreadsheet row 3
    const r3 = r.rows.find((x) => x.rowNumber === 3)!;
    expect(r3.issues.some((i) => i.message === "Row 3 is missing strain name.")).toBe(true);
    expect(r3.issues.some((i) => i.message === "Row 3 is missing breeder.")).toBe(true);
  });

  it("duplicate strain aliases do not overwrite valid first-column values", () => {
    const r = buildGeneticsImportPreview([
      ["variety", "strain", "breeder", "seed type"],
      ["Keep Me", "Should Be Ignored", "B", "auto"],
    ]);
    expect(r.rows[0].strain).toBe("Keep Me");
  });

  it("duplicate breeder aliases do not overwrite valid first-column values", () => {
    const r = buildGeneticsImportPreview([
      ["strain", "seed bank", "breeder", "seed type"],
      ["A", "Keep Bank", "Ignored", "auto"],
    ]);
    expect(r.rows[0].breeder).toBe("Keep Bank");
  });

  it("duplicate seed_type aliases do not overwrite valid first-column values", () => {
    const r = buildGeneticsImportPreview([
      ["strain", "breeder", "type", "seed type"],
      ["A", "B", "auto", "feminized"],
    ]);
    expect(r.rows[0].seedType).toBe("autoflower");
  });
});

describe("buildGeneticsValidationReportCsv", () => {
  it("emits header row and includes all statuses with row numbers and messages", () => {
    const r = buildGeneticsImportPreview([
      ["Strain", "Breeder", "Seed Type", "Lineage", "Flowering Time", "Notes"],
      ["A", "B", "auto", null, null, null],
      ["", "B", "auto", null, null, null], // blocked
      ["C", "D", "auto", null, "soon", null], // warning
    ]);
    const csv = buildGeneticsValidationReportCsv(r);
    const lines = csv.trim().split("\r\n");
    expect(lines[0]).toBe(GENETICS_VALIDATION_REPORT_COLUMNS.join(","));
    expect(lines.length).toBe(4);
    expect(lines[1]).toContain("valid");
    expect(lines[2]).toContain("blocked");
    expect(lines[2]).toContain("Row 3 is missing strain name.");
    expect(lines[3]).toContain("warning");
    expect(lines[3]).toContain("flowering time");
  });

  it("CSV-escapes fields containing commas, quotes, and newlines", () => {
    const r = buildGeneticsImportPreview([
      ["Strain", "Breeder", "Seed Type", "Notes"],
      ["Has, comma", 'Quote "Co"', "auto", "line1\nline2"],
    ]);
    const csv = buildGeneticsValidationReportCsv(r);
    expect(csv).toContain('"Has, comma"');
    expect(csv).toContain('"Quote ""Co"""');
  });
});

describe("buildGeneticsTemplateCsv", () => {
  it("includes required columns and example rows", () => {
    const csv = buildGeneticsTemplateCsv();
    const lines = csv.trim().split("\r\n");
    for (const col of GENETICS_TEMPLATE_REQUIRED_COLUMNS) {
      expect(lines[0]).toContain(col);
    }
    expect(lines[0]).toContain("lineage");
    expect(lines[0]).toContain("flowering_weeks");
    expect(lines[0]).toContain("notes");
    expect(csv).toContain("Example Auto");
    expect(csv).toContain("autoflower");
    expect(csv).toContain("Example Fem");
    expect(csv).toContain("feminized");
    expect(csv).toContain("Example Regular");
    expect(csv).toContain("regular");
  });
});

describe("selectImportableRows", () => {
  it("excludes blocked rows but includes warnings", () => {
    const r = buildGeneticsImportPreview([
      ["Strain", "Breeder", "Seed Type", "Flowering Time"],
      ["A", "B", "auto", "8"],
      ["", "B", "auto", "8"],
      ["C", "D", "auto", "soon"],
    ]);
    const importable = selectImportableRows(r);
    expect(importable.map((x) => x.rowNumber)).toEqual([2, 4]);
  });
});
