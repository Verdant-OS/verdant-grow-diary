import { describe, it, expect } from "vitest";
import {
  applySensorMappingOverrides,
  buildCsvPreview,
  buildCsvPreviewReport,
  buildCsvTimelinePreviewRows,
  buildFullCsvTimelineRows,
  CSV_PREVIEW_SOURCE_LABEL,
  CSV_PREVIEW_STATUS_LABEL,
  detectDelimitedSensorFile,
  detectFlags,
  filterPreviewTimelineByWindow,
  parseCsvText,
  parseDelimitedSensorPreview,
  parseDelimitedText,
  samplePreviewTimeline,
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
    expect(r.delimiter).toBe(",");
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

// ---------------------------------------------------------------------------
// v2 additions
// ---------------------------------------------------------------------------

describe("csvSensorPreviewRules v2 — delimiter detection", () => {
  it("detects CSV delimiter", () => {
    const d = detectDelimitedSensorFile("a,b,c\n1,2,3\n");
    expect(d.delimiter).toBe(",");
    expect(d.sourceLabel).toBe("csv");
  });

  it("detects TSV delimiter", () => {
    const d = detectDelimitedSensorFile("a\tb\tc\n1\t2\t3\n");
    expect(d.delimiter).toBe("\t");
    expect(d.sourceLabel).toBe("tsv");
  });

  it("parses TSV via parseDelimitedSensorPreview and labels source=tsv", () => {
    const r = parseDelimitedSensorPreview(
      "timestamp\ttemperature\thumidity\n2026-06-01T10:00\t24.1\t55\n",
      { fileName: "export.tsv" },
    );
    expect(r.ok).toBe(true);
    expect(r.sourceLabel).toBe("tsv");
    expect(r.delimiter).toBe("\t");
    expect(r.headers).toEqual(["timestamp", "temperature", "humidity"]);
    expect(r.rows[0]).toEqual(["2026-06-01T10:00", "24.1", "55"]);
  });

  it("rejects empty input safely", () => {
    const r = parseDelimitedSensorPreview("", { fileName: "x.tsv" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/empty/i);
    expect(r.sourceLabel).toBe("csv"); // empty input defaults to csv detection
  });

  it("rejects malformed (header-only) input safely", () => {
    const r = parseDelimitedSensorPreview("a\tb\tc\n", { fileName: "x.tsv" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no data rows/i);
  });

  it("parseDelimitedText splits tabs correctly", () => {
    const { headers, rows } = parseDelimitedText("a\tb\n1\t2\n", "\t");
    expect(headers).toEqual(["a", "b"]);
    expect(rows[0]).toEqual(["1", "2"]);
  });
});

describe("csvSensorPreviewRules v2 — window filter", () => {
  const now = new Date("2026-06-10T12:00:00Z");
  const timeline = [
    { capturedAt: "2026-06-10T11:00:00Z", values: {}, sourceLabel: "csv" as const },
    { capturedAt: "2026-06-09T12:00:00Z", values: {}, sourceLabel: "csv" as const },
    { capturedAt: "2026-06-01T12:00:00Z", values: {}, sourceLabel: "csv" as const },
    { capturedAt: "2026-04-01T12:00:00Z", values: {}, sourceLabel: "csv" as const },
  ];

  it("'all' returns everything", () => {
    expect(filterPreviewTimelineByWindow(timeline, { kind: "all", now }).length).toBe(4);
  });

  it("'24h' limits to last 24 hours (inclusive cutoff)", () => {
    // 11:00 today and 12:00 yesterday both fall inside [now - 24h, now].
    expect(filterPreviewTimelineByWindow(timeline, { kind: "24h", now }).length).toBe(2);
  });

  it("'7d' limits to last 7 days", () => {
    expect(filterPreviewTimelineByWindow(timeline, { kind: "7d", now }).length).toBe(2);
  });

  it("'30d' limits to last 30 days", () => {
    expect(filterPreviewTimelineByWindow(timeline, { kind: "30d", now }).length).toBe(3);
  });

  it("'custom' honors start/end", () => {
    const out = filterPreviewTimelineByWindow(timeline, {
      kind: "custom",
      start: "2026-06-05T00:00:00Z",
      end: "2026-06-09T23:00:00Z",
    });
    expect(out.length).toBe(1);
    expect(out[0].capturedAt).toBe("2026-06-09T12:00:00Z");
  });
});

describe("csvSensorPreviewRules v2 — sampling", () => {
  const arr = Array.from({ length: 1000 }, (_, i) => i);

  it("returns deterministic Nth sampling", () => {
    const a = samplePreviewTimeline(arr, "nth10");
    const b = samplePreviewTimeline(arr, "nth10");
    expect(a).toEqual(b);
    expect(a[0]).toBe(0);
    expect(a[1]).toBe(10);
    expect(a.length).toBe(100);
  });

  it("caps to 100 points deterministically", () => {
    const a = samplePreviewTimeline(arr, "cap100");
    const b = samplePreviewTimeline(arr, "cap100");
    expect(a.length).toBe(100);
    expect(a[0]).toBe(0);
    expect(a).toEqual(b);
  });

  it("caps to 500 points", () => {
    const a = samplePreviewTimeline(arr, "cap500");
    expect(a.length).toBe(500);
  });

  it("'every' returns all rows", () => {
    expect(samplePreviewTimeline([1, 2, 3], "every")).toEqual([1, 2, 3]);
  });

  it("handles empty input", () => {
    expect(samplePreviewTimeline([], "cap100")).toEqual([]);
  });
});

describe("csvSensorPreviewRules v2 — mapping overrides", () => {
  const csv =
    "timestamp,foo,humidity\n2026-06-01T10:00,1,55\n2026-06-01T11:00,2,54\n";
  const base = buildCsvPreview(csv);

  it("override changes canonical mapping locally", () => {
    const r = applySensorMappingOverrides(base, { foo: "temperature" });
    const fooMapping = r.mappings.find((m) => m.header === "foo");
    expect(fooMapping?.field).toBe("temperature");
    expect(r.unmapped).not.toContain("foo");
    // Original preview untouched.
    expect(base.mappings.find((m) => m.header === "foo")?.field).toBeNull();
  });

  it("override → null marks column unmapped", () => {
    const r = applySensorMappingOverrides(base, { humidity: null });
    expect(r.unmapped).toContain("humidity");
  });

  it("override updates preview timeline fields", () => {
    const r = applySensorMappingOverrides(base, { foo: "temperature" });
    const tl = buildFullCsvTimelineRows(r);
    expect(tl[0].values.temperature).toBe("1");
  });

  it("override is pure — does not mutate input or invoke writes", () => {
    const before = JSON.stringify(base);
    applySensorMappingOverrides(base, { foo: "temperature" });
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe("csvSensorPreviewRules v2 — report builder", () => {
  it("includes headers, mappings, overrides, flags, timeline, source, status", () => {
    const csv =
      "timestamp,temperature,humidity,foo\n" +
      "2026-06-10T11:00:00Z,24.1,55,1\n" +
      "2026-06-10T11:05:00Z,24.2,55,2\n";
    const preview = buildCsvPreview(csv, "demo.csv");
    const report = buildCsvPreviewReport(preview, {
      overrides: { foo: "vpd" },
      timeWindow: { kind: "all" },
      sampling: "every",
      generatedAt: "2026-06-10T12:00:00Z",
    });
    expect(report.fileName).toBe("demo.csv");
    expect(report.sourceLabel).toBe("csv");
    expect(report.delimiter).toBe("csv");
    expect(report.statusLabel).toBe("Preview only — not saved");
    expect(report.headers).toEqual(["timestamp", "temperature", "humidity", "foo"]);
    expect(report.rowCount).toBe(2);
    expect(report.proposedMappings.length).toBe(4);
    expect(report.userOverrides).toEqual([{ header: "foo", field: "vpd" }]);
    expect(
      report.effectiveMappings.find((m) => m.header === "foo")?.field,
    ).toBe("vpd");
    expect(report.timelinePreview.length).toBe(2);
    expect(report.notes.join(" ")).toMatch(/no database writes/i);
    expect(report.notes.join(" ")).toMatch(/preview only/i);
  });

  it("applies window + sampling to timeline preview", () => {
    const rows = Array.from(
      { length: 200 },
      (_, i) =>
        `2026-06-10T${String(i % 24).padStart(2, "0")}:00:00Z,${i}`,
    ).join("\n");
    const preview = buildCsvPreview("timestamp,temperature\n" + rows);
    const report = buildCsvPreviewReport(preview, {
      sampling: "cap100",
      timeWindow: { kind: "all" },
    });
    expect(report.timelinePreview.length).toBeLessThanOrEqual(100);
  });
});
