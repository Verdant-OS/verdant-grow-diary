/**
 * ggs-csv-parse-rules — pure helper tests for GGS CSV-row normalization.
 *
 * Guards Verdant V0 canonical rules:
 *  - canonical source is `csv` (never `ggs_csv` / `ggs_live`)
 *  - vendor identity in `raw_payload.source_app = "spider_farmer_ggs"`
 *  - only `soil_moisture_pct` and `ec` are emitted as drafts
 *  - soil temperature is parsed + preserved but never emitted
 *  - no silent clamping; NaN/Infinity/impossible values rejected
 */
import { describe, it, expect } from "vitest";
import {
  GGS_CSV_SOURCE_APP,
  parseGgsCsvRow,
} from "@/lib/ggsCsvParseRules";

const NOW = new Date("2026-06-17T12:00:00.000Z");
const TS = "2026-06-17T10:15:00.000Z";

describe("parseGgsCsvRow — happy path", () => {
  it("emits canonical csv drafts for a well-formed metric row", () => {
    const r = parseGgsCsvRow(
      {
        timestamp: TS,
        sensor_id: "GGS_SOIL_001",
        tent_id: "tent-1",
        moisture_vwc: 42.5,
        ec_ms_cm: 0.85,
        soil_temp_c: 22.3,
      },
      { now: NOW },
    );
    expect(r.source).toBe("csv");
    expect(r.tent_id).toBe("tent-1");
    expect(r.device_id).toBe("GGS_SOIL_001");
    expect(r.captured_at).toBe(TS);
    expect(r.drafts).toHaveLength(3);
    for (const d of r.drafts) {
      expect(d.source).toBe("csv");
      expect(d.raw_payload.source_app).toBe(GGS_CSV_SOURCE_APP);
      expect(d.tent_id).toBe("tent-1");
      expect(d.captured_at).toBe(TS);
    }
    const moisture = r.drafts.find((d) => d.metric === "soil_moisture_pct")!;
    expect(moisture.value).toBeCloseTo(42.5);
    const ec = r.drafts.find((d) => d.metric === "ec")!;
    expect(ec.value).toBeCloseTo(0.85);
    const soilTemp = r.drafts.find((d) => d.metric === "soil_temp_c")!;
    expect(soilTemp.value).toBeCloseTo(22.3);
    expect(r.skippedMetrics).toEqual([]);
  });


  it("accepts camelCase aliases", () => {
    const r = parseGgsCsvRow(
      {
        capturedAt: TS,
        tentId: "t",
        sensorId: "p1",
        moistureVwc: 38,
        ecMsCm: 1.2,
      },
      { now: NOW },
    );
    expect(r.source).toBe("csv");
    expect(r.tent_id).toBe("t");
    expect(r.device_id).toBe("p1");
    expect(r.drafts.map((d) => d.metric).sort()).toEqual(["ec", "soil_moisture_pct"]);
  });
});

describe("parseGgsCsvRow — unit normalization", () => {
  it("VWC fraction 0..1 converts to percent and records original_units", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", vwc: 0.425 },
      { now: NOW },
    );
    const d = r.drafts.find((x) => x.metric === "soil_moisture_pct")!;
    expect(d.value).toBeCloseTo(42.5);
    expect(d.raw_payload.original_units.soil_moisture_pct).toBe("fraction_0_1");
  });

  it("VWC percent 0..100 stays percent", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", vwc: 42.5 },
      { now: NOW },
    );
    const d = r.drafts.find((x) => x.metric === "soil_moisture_pct")!;
    expect(d.value).toBeCloseTo(42.5);
    expect(d.raw_payload.original_units.soil_moisture_pct).toBe("percent_0_100");
  });

  it("µS/cm divides by 1000 → mS/cm", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", ec_us_cm: 850 },
      { now: NOW },
    );
    const d = r.drafts.find((x) => x.metric === "ec")!;
    expect(d.value).toBeCloseTo(0.85);
    expect(d.raw_payload.original_units.ec).toBe("us_cm");
  });

  it("mS/cm stays mS/cm", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", ec_ms_cm: 1.4 },
      { now: NOW },
    );
    const d = r.drafts.find((x) => x.metric === "ec")!;
    expect(d.value).toBeCloseTo(1.4);
    expect(d.raw_payload.original_units.ec).toBe("ms_cm");
  });

  it("generic suspiciously-large EC is flagged and not silently converted", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", ec: 1450 },
      { now: NOW },
    );
    expect(r.drafts.find((d) => d.metric === "ec")).toBeUndefined();
    expect(r.warnings).toContain("soil_ec_unit_mismatch_suspected");
    expect(r.raw_payload.original_units.ec).toBe("unknown_large");
  });

  it("°F converts to °C and is emitted as a soil_temp_c draft", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", soil_temp_f: 72.14, vwc: 40 },
      { now: NOW },
    );
    const soilTemp = r.drafts.find((d) => d.metric === "soil_temp_c")!;
    expect(soilTemp).toBeDefined();
    expect(soilTemp.value).toBeCloseTo(22.3, 1);
    expect(r.raw_payload.parsed_soil_temp_c).toBeCloseTo(22.3, 1);
    expect(r.raw_payload.original_units.soil_temp_c).toBe("fahrenheit");
    expect(r.skippedMetrics).toEqual([]);
  });

  it("soil_temp_c below -20 is rejected as out-of-range, not emitted", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", soil_temp_c: -40, vwc: 40 },
      { now: NOW },
    );
    expect(r.drafts.find((d) => d.metric === "soil_temp_c")).toBeUndefined();
    expect(r.warnings).toContain("soil_temp_out_of_range");
    expect(r.skippedMetrics).toContain("soil_temp_c");
    expect(r.raw_payload.parsed_soil_temp_c).toBe(-40);
  });

  it("soil_temp_c above 80 is rejected as out-of-range, not emitted", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", soil_temp_c: 120, vwc: 40 },
      { now: NOW },
    );
    expect(r.drafts.find((d) => d.metric === "soil_temp_c")).toBeUndefined();
    expect(r.warnings).toContain("soil_temp_out_of_range");
    expect(r.skippedMetrics).toContain("soil_temp_c");
  });
});

describe("parseGgsCsvRow — soil temperature draft emission", () => {
  it("emits soil_temp_c draft alongside other metrics", () => {
    const r = parseGgsCsvRow(
      {
        timestamp: TS,
        tent_id: "t",
        vwc: 40,
        ec_ms_cm: 1,
        soil_temp_c: 21,
      },
      { now: NOW },
    );
    const metrics = r.drafts.map((d) => d.metric).sort();
    expect(metrics).toEqual(["ec", "soil_moisture_pct", "soil_temp_c"]);
    expect(r.skippedMetrics).toEqual([]);
    expect(r.raw_payload.parsed_soil_temp_c).toBe(21);
  });
});


describe("parseGgsCsvRow — bad data is never healthy", () => {
  it("rejects malformed timestamp", () => {
    const r = parseGgsCsvRow(
      { timestamp: "not-a-date", tent_id: "t", vwc: 40 },
      { now: NOW },
    );
    expect(r.source).toBe("invalid");
    expect(r.warnings).toContain("malformed_timestamp");
    expect(r.drafts).toEqual([]);
  });

  it("rejects missing tent_id", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, vwc: 40, ec_ms_cm: 1 },
      { now: NOW },
    );
    expect(r.source).toBe("invalid");
    expect(r.warnings).toContain("tent_id_missing");
    expect(r.drafts).toEqual([]);
  });

  it("rejects non-numeric moisture/EC", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", vwc: "hello", ec_ms_cm: "world" },
      { now: NOW },
    );
    expect(r.warnings).toContain("soil_moisture_non_numeric");
    expect(r.warnings).toContain("ec_non_numeric");
    expect(r.drafts).toEqual([]);
  });

  it("rejects NaN and Infinity", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", vwc: Number.NaN, ec_ms_cm: Number.POSITIVE_INFINITY },
      { now: NOW },
    );
    expect(r.warnings).toContain("soil_moisture_non_numeric");
    expect(r.warnings).toContain("ec_non_numeric");
    expect(r.drafts).toEqual([]);
  });

  it("rejects impossible moisture (>100) without clamping", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", vwc: 150 },
      { now: NOW },
    );
    expect(r.warnings).toContain("soil_moisture_out_of_range");
    expect(r.drafts).toEqual([]);
  });

  it("rejects negative EC", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", ec_ms_cm: -1 },
      { now: NOW },
    );
    expect(r.warnings).toContain("ec_negative");
    expect(r.drafts).toEqual([]);
  });

  it("non-object payload is invalid", () => {
    const r = parseGgsCsvRow("nope", { now: NOW });
    expect(r.source).toBe("invalid");
    expect(r.warnings).toContain("payload_not_object");
  });
});

describe("parseGgsCsvRow — canonical labels and vendor identity", () => {
  it("never emits ggs_live or ggs_csv", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", vwc: 40, ec_ms_cm: 1 },
      { now: NOW },
    );
    const json = JSON.stringify(r);
    expect(json).not.toContain("ggs_live");
    expect(json).not.toContain("ggs_csv");
    for (const d of r.drafts) {
      expect(d.source).toBe("csv");
    }
  });

  it("vendor identity preserved as raw_payload.source_app", () => {
    const r = parseGgsCsvRow(
      { timestamp: TS, tent_id: "t", vwc: 40 },
      { now: NOW },
    );
    expect(r.raw_payload.source_app).toBe("spider_farmer_ggs");
    for (const d of r.drafts) {
      expect(d.raw_payload.source_app).toBe("spider_farmer_ggs");
    }
  });

  it("preserves original CSV row verbatim for audit", () => {
    const input = { timestamp: TS, tent_id: "t", vwc: 40, extra_field: "keep-me" };
    const r = parseGgsCsvRow(input, { now: NOW });
    expect(r.raw_payload.original_row).toBe(input);
  });
});

describe("parseGgsCsvRow — static safety", () => {
  it("module source has no DB writes, no edge invokes, no AI, no device control", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const src = fs.readFileSync(
      path.resolve(process.cwd(), "src/lib/ggsCsvParseRules.ts"),
      "utf8",
    );
    // No client-side DB writes.
    expect(src).not.toMatch(/\.insert\s*\(/);
    expect(src).not.toMatch(/\.update\s*\(/);
    expect(src).not.toMatch(/\.delete\s*\(/);
    expect(src).not.toMatch(/\.upsert\s*\(/);
    expect(src).not.toMatch(/\.rpc\s*\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    // No AI / alerts / Action Queue / device control hints.
    expect(src).not.toMatch(/openai|anthropic|gemini|lovable-ai/i);
    expect(src).not.toMatch(/from\s+["'][^"']*action_queue/);
    expect(src).not.toMatch(/from\s+["'][^"']*\/alerts/);
    expect(src).not.toMatch(/relay_on|valve_open|light_on|device_command/);
    // No spreadsheet/upload UI.
    expect(src).not.toMatch(/xlsx|sheetjs|FileReader|input\s+type=["']file/i);
    // No secret/token surface.
    expect(src).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|bridge_token/i);
    // Forbidden source labels.
    expect(src).not.toMatch(/["']ggs_live["']|["']ggs_csv["']/);
  });
});
