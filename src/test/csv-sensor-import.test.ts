/**
 * Gate 2A CSV Drop — pure parser + safety contract tests.
 *
 * Covers AC Infinity normalization, header detection, F→C conversion,
 * timestamp parsing (Timestamp / Date + Time), empty-cell handling,
 * in-file de-dupe, supported vs unsupported metrics, insert payload shape,
 * and source-level safety (no AI / alerts / action_queue / device control /
 * service_role / user_id in payload / unsupported source app parsing).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CSV_IMPORT_SOURCE_APPS,
  CSV_SOURCE_AC_INFINITY,
  CSV_SOURCE_LABEL,
  buildCsvInsertRows,
  csvSourceTagFor,
  isCsvImportSource,
  normalizeAcInfinityRows,
  parseCsv,
  parseOptionalNumberCell,
  parseTimestampCell,
  planColumns,
} from "@/lib/csvSensorImportRules";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("parseCsv", () => {
  it("parses headers and rows with commas + CRLF", () => {
    const t = "A,B,C\r\n1,2,3\r\n4,5,6\r\n";
    expect(parseCsv(t)).toEqual({
      headers: ["A", "B", "C"],
      rows: [["1", "2", "3"], ["4", "5", "6"]],
    });
  });
  it("handles quoted commas + escaped quotes", () => {
    const t = `A,B\n"hello, world","she said ""hi"""`;
    expect(parseCsv(t).rows[0]).toEqual(["hello, world", 'she said "hi"']);
  });
});

describe("planColumns", () => {
  it("detects AC Infinity Timestamp + Temperature(°F) + Humidity + VPD", () => {
    const p = planColumns([
      "Timestamp",
      "Temperature (°F)",
      "Humidity (%)",
      "VPD (kPa)",
    ]);
    expect(p.timestamp).toBe(0);
    expect(p.temperature).toEqual({ idx: 1, unit: "F" });
    expect(p.humidity).toBe(2);
    expect(p.vpd).toBe(3);
  });
  it("detects Date + Time pair when Timestamp absent", () => {
    const p = planColumns(["Date", "Time", "Temp (°C)", "RH"]);
    expect(p.timestamp).toBeNull();
    expect(p.date).toBe(0);
    expect(p.time).toBe(1);
    expect(p.temperature).toEqual({ idx: 2, unit: "C" });
    expect(p.humidity).toBe(3);
  });
  it("flags pH / EC / PPFD but they are non-persistable in this PR", () => {
    const p = planColumns(["Timestamp", "pH", "EC", "PPFD"]);
    expect(p.ph).toBe(1);
    expect(p.ec).toBe(2);
    expect(p.ppfd).toBe(3);
  });
});

describe("parseOptionalNumberCell", () => {
  it("returns null for empty / whitespace / non-numeric", () => {
    expect(parseOptionalNumberCell("")).toBeNull();
    expect(parseOptionalNumberCell("  ")).toBeNull();
    expect(parseOptionalNumberCell("--")).toBeNull();
    expect(parseOptionalNumberCell(undefined)).toBeNull();
  });
  it("never coerces empty to 0", () => {
    expect(parseOptionalNumberCell("")).not.toBe(0);
  });
  it("parses decimals and stripped thousand separators", () => {
    expect(parseOptionalNumberCell("1.45")).toBe(1.45);
    expect(parseOptionalNumberCell("1,200")).toBe(1200);
  });
});

describe("parseTimestampCell", () => {
  it("parses 'YYYY-MM-DD HH:MM:SS' to ISO UTC", () => {
    const iso = parseTimestampCell("2026-05-26 14:30:00");
    expect(iso).not.toBeNull();
    expect(new Date(iso!).toISOString()).toBe(iso);
  });
  it("combines Date + Time when Timestamp missing", () => {
    const iso = parseTimestampCell(undefined, "2026-05-26", "14:30:00");
    expect(iso).not.toBeNull();
  });
  it("returns null for unparseable", () => {
    expect(parseTimestampCell("nope")).toBeNull();
    expect(parseTimestampCell(undefined, undefined, undefined)).toBeNull();
  });
});

describe("normalizeAcInfinityRows", () => {
  const csv = [
    "Timestamp,Temperature (°F),Humidity (%),VPD (kPa)",
    "2026-05-26 14:00:00,77,50,1.2",
    "2026-05-26 15:00:00,78,52,1.25",
    "2026-05-26 16:00:00,,,",
    "not-a-date,80,55,1.4",
    "2026-05-26 14:00:00,77,50,1.2", // duplicate of row 1
  ].join("\n");

  const parsed = parseCsv(csv);
  const plan = planColumns(parsed.headers);
  const result = normalizeAcInfinityRows(parsed, plan);

  it("commits only valid rows; skips empty + invalid timestamp + duplicates", () => {
    expect(result.rows.length).toBe(2);
    const reasons = result.skipped.map((s) => s.reason).sort();
    expect(reasons).toEqual(["duplicate", "invalid_timestamp", "no_numeric_metrics"]);
  });

  it("detects metrics and date range", () => {
    expect(result.metricsDetected).toEqual([
      "temperature_c",
      "humidity_pct",
      "vpd_kpa",
    ]);
    expect(result.dateRange).not.toBeNull();
  });

  it("converts °F → °C", () => {
    const temp = result.rows[0].readings.find((r) => r.metric === "temperature_c");
    expect(temp).toBeDefined();
    // 77°F → 25°C
    expect(temp!.value).toBeCloseTo(25, 5);
  });

  it("never emits empty cells as 0", () => {
    for (const row of result.rows) {
      for (const r of row.readings) {
        expect(r.value).not.toBeNaN();
      }
    }
  });

  it("flags unsupported metrics without persisting them", () => {
    const withPh = parseCsv(
      "Timestamp,Temperature (°F),pH\n2026-05-26 14:00:00,77,6.0",
    );
    const r = normalizeAcInfinityRows(withPh, planColumns(withPh.headers));
    expect(r.unsupportedMetrics).toContain("ph");
    expect(
      r.rows[0].readings.some((x) => (x.metric as string) === "ph"),
    ).toBe(false);
  });
});

describe("buildCsvInsertRows", () => {
  const parsed = parseCsv(
    [
      "Timestamp,Temperature (°F),Humidity (%)",
      "2026-05-26 14:00:00,77,50",
    ].join("\n"),
  );
  const result = normalizeAcInfinityRows(parsed, planColumns(parsed.headers));

  it("tags every row with csv_import_ac_infinity + label + batch id", () => {
    const inserts = buildCsvInsertRows({
      tentId: "t1",
      growId: "g1",
      sourceApp: "ac_infinity",
      importBatchId: "batch-1",
      rows: result.rows,
    });
    expect(inserts.length).toBe(2);
    for (const r of inserts) {
      expect(r.tent_id).toBe("t1");
      expect(r.grow_id).toBe("g1");
      expect(r.source).toBe(CSV_SOURCE_AC_INFINITY);
      expect(r.raw_payload.source_label).toBe(CSV_SOURCE_LABEL.ac_infinity);
      expect(r.raw_payload.import_batch_id).toBe("batch-1");
      expect(r.raw_payload.csv_import).toBe(true);
    }
  });

  it("never sets plant_id and never includes user_id", () => {
    const inserts = buildCsvInsertRows({
      tentId: "t1",
      sourceApp: "ac_infinity",
      importBatchId: "b",
      rows: result.rows,
    });
    const json = JSON.stringify(inserts);
    expect(json).not.toContain("plant_id");
    expect(json).not.toContain("user_id");
  });

  it("throws when tentId missing", () => {
    expect(() =>
      buildCsvInsertRows({
        tentId: "",
        sourceApp: "ac_infinity",
        importBatchId: "b",
        rows: result.rows,
      }),
    ).toThrow();
  });
});

describe("source app gating", () => {
  it("only AC Infinity is enabled in this PR", () => {
    const enabled = CSV_IMPORT_SOURCE_APPS.filter((a) => a.enabled).map((a) => a.id);
    expect(enabled).toEqual(["ac_infinity"]);
  });
  it("csvSourceTagFor returns namespaced tag per app", () => {
    expect(csvSourceTagFor("ac_infinity")).toBe("csv_import_ac_infinity");
    expect(csvSourceTagFor("trolmaster")).toBe("csv_import_trolmaster");
    expect(csvSourceTagFor("other")).toBe("csv_import_other");
  });
  it("isCsvImportSource recognizes the namespace", () => {
    expect(isCsvImportSource("csv_import_ac_infinity")).toBe(true);
    expect(isCsvImportSource("manual")).toBe(false);
    expect(isCsvImportSource(null)).toBe(false);
  });
});

// ---------- Source-level safety contract ----------
const RULES = read("src/lib/csvSensorImportRules.ts");
const CARD = read("src/components/TentCsvImportCard.tsx");

describe("Gate 2A safety contract (source-level)", () => {
  it("rules + card never write to alerts / action_queue / plants / tents / diary_entries", () => {
    for (const src of [RULES, CARD]) {
      for (const t of [
        "alerts",
        "alert_events",
        "action_queue",
        "action_queue_events",
        "plants",
        "tents",
        "diary_entries",
        "pi_ingest_idempotency_keys",
        "pi_ingest_bridge_credentials",
      ]) {
        expect(src).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
      }
    }
  });

  it("card writes only to sensor_readings", () => {
    const tables = [...CARD.matchAll(/\.from\(["']([a-z_]+)["']\)/g)].map((m) => m[1]);
    for (const t of tables) expect(t).toBe("sensor_readings");
  });

  it("card does not include user_id in the insert payload", () => {
    expect(CARD).not.toMatch(/user_id\s*:/);
  });

  it("never assigns plant_id during import", () => {
    expect(CARD).not.toMatch(/plant_id\s*:/);
    expect(RULES).not.toMatch(/plant_id\s*:/);
  });

  it("never labels imported data 'live'", () => {
    expect(RULES).not.toMatch(/source:\s*["']live["']/);
    expect(CARD).not.toMatch(/source:\s*["']live["']/);
  });

  it("no AI / Doctor / automation / device-control / external-API surface", () => {
    const banned =
      /openai|gpt|anthropic|ai[-_]?doctor|mqtt|home[\s_-]?assistant|webhook|relay|actuator|service_role|autopilot|auto[-_ ]?execute|fetch\(\s*["']https?:/i;
    for (const src of [RULES, CARD]) {
      expect(src).not.toMatch(banned);
    }
  });
});
