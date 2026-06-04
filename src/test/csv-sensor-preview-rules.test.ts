import { describe, it, expect } from "vitest";
import {
  buildCsvPreview,
  buildCsvTimelinePreviewRows,
  CSV_PREVIEW_SOURCE_LABEL,
  CSV_PREVIEW_STATUS_LABEL,
  detectFlags,
  parseCsvText,
  suggestMapping,
  suggestMappings,
} from "@/lib/csvSensorPreviewRules";

describe("csvSensorPreviewRules — parsing", () => {
  it("parses headers and rows", () => {
    const { headers, rows } = parseCsvText(
      "timestamp,temp_c,humidity\n2026-06-01T10:00,24.1,55\n2026-06-01T11:00,24.5,54\n",
    );
    expect(headers).toEqual(["timestamp", "temp_c", "humidity"]);
    expect(rows.length).toBe(2);
    expect(rows[0]).toEqual(["2026-06-01T10:00", "24.1", "55"]);
  });

  it("returns safe error for empty input", () => {
    const r = buildCsvPreview("");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/empty/i);
    expect(r.sourceLabel).toBe(CSV_PREVIEW_SOURCE_LABEL);
    expect(r.statusLabel).toBe(CSV_PREVIEW_STATUS_LABEL);
  });

  it("returns safe error when only headers are present", () => {
    const r = buildCsvPreview("a,b,c\n");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no data rows/i);
  });
});

describe("csvSensorPreviewRules — mapping suggestions", () => {
  it("maps common field names", () => {
    const m = suggestMappings([
      "timestamp",
      "Air Temp (C)",
      "Relative Humidity",
      "VPD",
      "CO2",
      "Soil Moisture",
      "EC mS/cm",
      "pH",
      "PPFD",
    ]);
    const get = (h: string) => m.find((x) => x.header === h)?.field;
    expect(get("timestamp")).toBe("captured_at");
    expect(get("Air Temp (C)")).toBe("temperature");
    expect(get("Relative Humidity")).toBe("humidity");
    expect(get("VPD")).toBe("vpd");
    expect(get("CO2")).toBe("co2");
    expect(get("Soil Moisture")).toBe("vwc");
    expect(get("EC mS/cm")).toBe("ec");
    expect(get("pH")).toBe("ph");
    expect(get("PPFD")).toBe("ppfd");
  });

  it("leaves unknown columns unmapped", () => {
    const m = suggestMapping("RandomColumn123");
    expect(m.field).toBeNull();
    expect(m.reason).toMatch(/no canonical field/i);
  });

  it("rejects lux as PPFD", () => {
    const m = suggestMapping("Lux");
    expect(m.field).toBeNull();
    expect(m.reason).toMatch(/lux/i);
  });
});

describe("csvSensorPreviewRules — suspicious flags", () => {
  it("flags lux as not PPFD", () => {
    const headers = ["timestamp", "Lux"];
    const rows = [["2026-06-01T10:00", "20000"]];
    const flags = detectFlags(headers, rows, suggestMappings(headers));
    expect(flags.some((f) => f.code === "lux_not_ppfd")).toBe(true);
  });

  it("flags EC values that look like wrong unit", () => {
    const headers = ["EC mS/cm"];
    const rows = [["1500"], ["1600"], ["1700"]];
    const flags = detectFlags(headers, rows, suggestMappings(headers));
    expect(flags.some((f) => f.code === "ec_unit_ambiguous")).toBe(true);
  });

  it("flags impossible pH", () => {
    const headers = ["pH"];
    const rows = [["15.2"], ["6.1"]];
    const flags = detectFlags(headers, rows, suggestMappings(headers));
    expect(
      flags.some((f) => f.code === "ph_out_of_range" && f.severity === "error"),
    ).toBe(true);
  });

  it("flags stuck humidity at 0", () => {
    const headers = ["humidity"];
    const rows = [["0"], ["0"], ["0"]];
    const flags = detectFlags(headers, rows, suggestMappings(headers));
    expect(flags.some((f) => f.code === "humidity_stuck")).toBe(true);
  });

  it("flags stuck soil moisture at 100", () => {
    const headers = ["Soil Moisture"];
    const rows = [["100"], ["100"]];
    const flags = detectFlags(headers, rows, suggestMappings(headers));
    expect(flags.some((f) => f.code === "vwc_stuck")).toBe(true);
  });

  it("flags ambiguous temperature unit", () => {
    const headers = ["Temperature"];
    const rows = [["75"], ["78"], ["80"]];
    const flags = detectFlags(headers, rows, suggestMappings(headers));
    expect(flags.some((f) => f.code === "temp_unit_ambiguous")).toBe(true);
  });
});

describe("csvSensorPreviewRules — buildCsvPreview", () => {
  it("labels result as csv source with preview-only status", () => {
    const r = buildCsvPreview(
      "timestamp,temperature\n2026-06-01T10:00,24.1\n",
      "export.csv",
    );
    expect(r.ok).toBe(true);
    expect(r.sourceLabel).toBe("csv");
    expect(r.statusLabel).toBe("Preview only — not saved");
    expect(r.fileName).toBe("export.csv");
    expect(r.totalRows).toBe(1);
    expect(r.unmapped).toEqual([]);
  });

  it("builds a timeline preview when timestamp + values exist", () => {
    const r = buildCsvPreview(
      "timestamp,temperature,humidity\n2026-06-01T10:00,24.1,55\n2026-06-01T11:00,24.5,54\n",
    );
    const tl = buildCsvTimelinePreviewRows(r);
    expect(tl.length).toBe(2);
    expect(tl[0].sourceLabel).toBe("csv");
    expect(tl[0].values.temperature).toBe("24.1");
  });
});
