import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/csvSensorImportRules";

const assetRoot = resolve(__dirname, "../../public/downloads");
const readAsset = (name: string) => readFileSync(resolve(assetRoot, name));
const fields = [
  "date",
  "local_time",
  "time_zone",
  "record_identifier",
  "observation",
  "photo_file_reference",
  "source_reference",
  "follow_up_note",
];
const labels = [
  "Date",
  "Local time",
  "Time zone",
  "Record identifier",
  "Observation",
  "Photo/file reference",
  "Source/reference",
  "Follow-up note",
];
const localRecordNotice = "These are local records, not automatic Verdant imports.";

describe("blank observation record downloadable assets", () => {
  it("ships the named UTF-8 CSV with the approved fields and a blank row", () => {
    const csv = readAsset("blank-observation-record.csv").toString("utf8");
    const parsed = parseCsv(csv);
    expect(csv).toBe(`${fields.join(",")}\r\n${",".repeat(fields.length - 1)}\r\n`);
    expect(parsed.headers).toEqual(fields);
    expect(parsed.rows).toEqual([fields.map(() => "")]);
    expect(parsed.rows.every((row) => row.length === fields.length)).toBe(true);
  });

  it("ships a real single-page PDF at the matching basename", () => {
    const pdf = readAsset("blank-observation-record.pdf").toString("latin1");
    expect(pdf.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(pdf.match(/<<[^>]*\/Type \/Pages\b[^>]*>>/)?.[0]).toMatch(/\/Count 1\b/);
    expect(pdf.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(pdf).toMatch(/\/MediaBox\s*\[\s*0 0 612 792\s*\]/);
    const xrefOffset = Number(pdf.match(/startxref\s+(\d+)/)?.[1]);
    expect(pdf.slice(xrefOffset, xrefOffset + 4)).toBe("xref");
  });

  it("keeps PDF text selectable with all eight blank field labels and the notice", () => {
    // This asset deliberately uses uncompressed literal text and embedded fonts.
    // These are artifact-shape assertions; rendered-page inspection checks legibility.
    const pdf = readAsset("blank-observation-record.pdf").toString("latin1");
    for (const label of labels) expect(pdf).toContain(`(${label}) Tj`);
    expect(pdf).toContain(`(${localRecordNotice}) Tj`);
    expect(pdf).toContain("/FontFile2");
    expect(pdf).not.toMatch(/\/OpenAction\b|\/JavaScript\b|\/URI\b|\/AcroForm\b/);
  });

  it("contains only the approved neutral PDF copy, with no prefilled observations", () => {
    const pdf = readAsset("blank-observation-record.pdf").toString("latin1");
    const text = [...pdf.matchAll(/\(([^()]*)\) Tj/g)].map((match) => match[1]);
    expect(text).toEqual([
      "VERDANT / LOCAL RECORDS",
      "Blank observation record",
      localRecordNotice,
      "Use one sheet per record. Leave unknown details blank.",
      ...labels,
      "Keep the sheet and any referenced files together in your own records.",
      "Blank template | Print at actual size or fit to page",
    ]);
  });

  it("provides concise local-use instructions for the exact download filenames", () => {
    const instructions = readAsset("blank-observation-record-instructions.txt").toString("utf8");
    expect(instructions).toContain(localRecordNotice);
    expect(instructions).toContain("blank-observation-record.csv");
    expect(instructions).toContain("blank-observation-record.pdf");
    expect(instructions).toContain("Leave unknown details blank");
    expect(instructions).toContain("one row per record");
    expect(instructions).toContain("time zone");
    expect(instructions.replace(/\s+/g, " ")).toContain("record identifier");
    expect(instructions.split(/\s+/).length).toBeLessThan(200);
    expect(instructions).not.toMatch(
      /https?:|sensor|nutrient|watering|breeding|cultivat|threshold/i,
    );
  });
});
