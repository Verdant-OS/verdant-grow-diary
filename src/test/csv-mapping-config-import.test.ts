/**
 * CSV Mapping Config Import — validator tests.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  importCsvMappingConfig,
  CSV_MAPPING_CONFIG_SUPPORTED_VERSIONS,
} from "@/lib/csvMappingConfigImport";
import {
  buildCsvMappingConfig,
  CSV_MAPPING_CONFIG_DATA_CONTEXT,
  CSV_MAPPING_CONFIG_SCHEMA_VERSION,
} from "@/lib/csvMappingConfig";
import {
  emptyRepresentativeMapping,
  type RepresentativeColumnMapping,
} from "@/lib/representativeCsvSensorPreviewRules";
import { detectMappingCollisions, deriveCsvRowValidationHints } from "@/lib/csvRowValidationRules";
import { previewRepresentativeCsv } from "@/lib/representativeCsvSensorPreviewRules";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");

function validConfigJson(overrides: Record<string, unknown> = {}): string {
  const mapping = emptyRepresentativeMapping();
  mapping.timestamp = "Timestamp";
  mapping.sensor = "Sensor";
  mapping.air_temp = { column: "Air_F", unit: "F" };
  mapping.humidity = { column: "RH" };
  mapping.substrate_ec = { column: "EC", unit: "uS/cm" };
  const cfg = buildCsvMappingConfig({
    mapping,
    headers: ["Timestamp", "Sensor", "Air_F", "RH", "EC"],
  });
  return JSON.stringify({ ...cfg, ...overrides });
}

const HEADERS = ["Timestamp", "Sensor", "Air_F", "RH", "EC"];

describe("importCsvMappingConfig — happy path", () => {
  it("imports valid mapping_config with matching headers", () => {
    const result = importCsvMappingConfig({ input: validConfigJson(), headers: HEADERS });
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    expect(result.mapping.timestamp).toBe("Timestamp");
    expect(result.mapping.sensor).toBe("Sensor");
    expect(result.mapping.air_temp.column).toBe("Air_F");
    expect(result.mapping.humidity.column).toBe("RH");
    expect(result.mapping.substrate_ec.column).toBe("EC");
    expect(result.missingHeaders).toEqual([]);
  });

  it("restores selected units (F + uS/cm)", () => {
    const result = importCsvMappingConfig({ input: validConfigJson(), headers: HEADERS });
    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.mapping.air_temp.unit).toBe("F");
    expect(result.mapping.substrate_ec.unit).toBe("uS/cm");
  });

  it("applies matching fields and warns about missing headers (no guessing)", () => {
    const result = importCsvMappingConfig({
      input: validConfigJson(),
      headers: ["Timestamp", "Sensor", "RH"], // Air_F + EC missing
    });
    if (result.status !== "applied") throw new Error("expected applied");
    expect(result.mapping.timestamp).toBe("Timestamp");
    expect(result.mapping.humidity.column).toBe("RH");
    expect(result.mapping.air_temp.column).toBeNull();
    expect(result.mapping.substrate_ec.column).toBeNull();
    const fields = result.missingHeaders.map((m) => m.field).sort();
    expect(fields).toEqual(["air_temp", "substrate_ec"]);
    const headersDropped = result.missingHeaders.map((m) => m.header).sort();
    expect(headersDropped).toEqual(["Air_F", "EC"]);
  });
});

describe("importCsvMappingConfig — blocking cases", () => {
  it("blocks malformed JSON", () => {
    const r = importCsvMappingConfig({ input: "{not json", headers: HEADERS });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.code).toBe("malformed_json");
  });

  it("blocks unsupported schema_version", () => {
    const r = importCsvMappingConfig({
      input: validConfigJson({ schema_version: 999 }),
      headers: HEADERS,
    });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") {
      expect(r.code).toBe("unsupported_schema_version");
      expect(r.message).toMatch(/not supported/i);
    }
  });

  it("blocks wrong data_context", () => {
    const r = importCsvMappingConfig({
      input: validConfigJson({ data_context: "live" }),
      headers: HEADERS,
    });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.code).toBe("wrong_data_context");
  });

  it("blocks missing mapping object", () => {
    const r = importCsvMappingConfig({
      input: JSON.stringify({
        schema_version: CSV_MAPPING_CONFIG_SCHEMA_VERSION,
        data_context: CSV_MAPPING_CONFIG_DATA_CONTEXT,
        units: { air_temp: "C", substrate_temp: "C", substrate_ec: "mS/cm" },
      }),
      headers: HEADERS,
    });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.code).toBe("missing_mapping_object");
  });

  it("blocks missing units object", () => {
    const r = importCsvMappingConfig({
      input: JSON.stringify({
        schema_version: CSV_MAPPING_CONFIG_SCHEMA_VERSION,
        data_context: CSV_MAPPING_CONFIG_DATA_CONTEXT,
        mapping: {},
      }),
      headers: HEADERS,
    });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.code).toBe("missing_units_object");
  });

  it("blocks invalid unit value", () => {
    const r = importCsvMappingConfig({
      input: validConfigJson({
        units: { air_temp: "K", substrate_temp: "C", substrate_ec: "mS/cm" },
      }),
      headers: HEADERS,
    });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.code).toBe("invalid_unit_value");
  });

  it("blocks non-object payload (array)", () => {
    const r = importCsvMappingConfig({ input: "[]", headers: HEADERS });
    expect(r.status).toBe("blocked");
    if (r.status === "blocked") expect(r.code).toBe("not_an_object");
  });
});

describe("importCsvMappingConfig — security: never trust the import", () => {
  it("never produces a 'live' label, even if source_label says live", () => {
    const r = importCsvMappingConfig({
      input: validConfigJson({ source_label: "live" }),
      headers: HEADERS,
    });
    if (r.status !== "applied") throw new Error("expected applied");
    expect(JSON.stringify(r)).not.toMatch(/"live"/);
  });

  it("ignores user_id, grow_id, plant_id, tent_id, tokens, secrets, service_role at top level", () => {
    const r = importCsvMappingConfig({
      input: validConfigJson({
        user_id: "u-1",
        grow_id: "g-1",
        plant_id: "p-1",
        tent_id: "t-1",
        token: "secret-token",
        secret: "shh",
        service_role: "leaked",
      }),
      headers: HEADERS,
    });
    if (r.status !== "applied") throw new Error("expected applied");
    expect(r.ignoredKeys.sort()).toEqual(
      ["grow_id", "plant_id", "secret", "service_role", "tent_id", "token", "user_id"].sort(),
    );
    const s = JSON.stringify(r);
    expect(s).not.toMatch(/u-1/);
    expect(s).not.toMatch(/g-1/);
    expect(s).not.toMatch(/p-1/);
    expect(s).not.toMatch(/t-1/);
    expect(s).not.toMatch(/secret-token/);
  });

  it("does not import row data / raw payload even if present", () => {
    const r = importCsvMappingConfig({
      input: validConfigJson({
        rows: [{ Timestamp: "2026-05-01", RH: "60" }],
        raw_payload: { foo: "bar" },
      }),
      headers: HEADERS,
    });
    if (r.status !== "applied") throw new Error("expected applied");
    const s = JSON.stringify(r);
    expect(s).not.toMatch(/raw_payload/);
    expect(s).not.toMatch(/"rows"/);
    expect(s).not.toMatch(/"foo"/);
    expect(r.ignoredKeys).toContain("rows");
    expect(r.ignoredKeys).toContain("raw_payload");
  });

  it("supported version list contains the current schema version", () => {
    expect(CSV_MAPPING_CONFIG_SUPPORTED_VERSIONS).toContain(CSV_MAPPING_CONFIG_SCHEMA_VERSION);
  });
});

describe("importCsvMappingConfig — downstream integration", () => {
  it("collision checks still fire on imported mapping", () => {
    const mapping = emptyRepresentativeMapping();
    mapping.air_temp = { column: "X", unit: "C" };
    mapping.substrate_temp = { column: "X", unit: "C" };
    const cfg = buildCsvMappingConfig({ mapping, headers: ["X"] });
    const r = importCsvMappingConfig({ input: JSON.stringify(cfg), headers: ["X"] });
    if (r.status !== "applied") throw new Error("expected applied");
    const collisions = detectMappingCollisions(r.mapping);
    expect(collisions.length).toBeGreaterThan(0);
  });

  it("per-row validation runs against imported mapping", () => {
    const mapping = emptyRepresentativeMapping();
    mapping.timestamp = "Timestamp";
    mapping.humidity = { column: "RH" };
    const cfg = buildCsvMappingConfig({ mapping, headers: ["Timestamp", "RH"] });
    const r = importCsvMappingConfig({
      input: JSON.stringify(cfg),
      headers: ["Timestamp", "RH"],
    });
    if (r.status !== "applied") throw new Error("expected applied");
    const csv = "Timestamp,RH\n2026-05-01 12:00:00,100";
    const preview = previewRepresentativeCsv(csv, { mapping: r.mapping });
    const outcome = deriveCsvRowValidationHints({ row: preview.rows[0], mapping: r.mapping });
    expect(outcome.hints.some((h) => /stuck|humidity/i.test(h.message))).toBe(true);
  });

  it("blocked import lets the caller preserve previous mapping", () => {
    const previous: RepresentativeColumnMapping = emptyRepresentativeMapping();
    previous.timestamp = "PrevTs";
    const r = importCsvMappingConfig({ input: "garbage", headers: HEADERS });
    // Caller pattern: only swap on applied. Here, "previous" stays untouched.
    const next = r.status === "applied" ? r.mapping : previous;
    expect(next.timestamp).toBe("PrevTs");
  });
});

describe("csvMappingConfigImport — static safety scan", () => {
  const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
  const src = stripSourceComments(read("src/lib/csvMappingConfigImport.ts"));
  it("no DB writes / functions.invoke / service_role", () => {
    expect(src).not.toMatch(/\.insert\(/);
    expect(src).not.toMatch(/\.upsert\(/);
    expect(src).not.toMatch(/\.update\(/);
    expect(src).not.toMatch(/\.delete\(/);
    expect(src).not.toMatch(/\.rpc\(/);
    expect(src).not.toMatch(/functions\.invoke/);
    expect(src).not.toMatch(/service_role/);
  });
  it("no action_queue / alerts / ai_doctor_sessions / sensor_readings writes", () => {
    expect(src).not.toMatch(/\baction_queue\b/);
    expect(src).not.toMatch(/from\(["']alerts["']\)/);
    expect(src).not.toMatch(/ai_doctor_sessions/);
    expect(src).not.toMatch(/from\(["']sensor_readings["']\)/);
  });
  it("never labels imports as live data", () => {
    expect(src).not.toMatch(/=\s*['"]live['"]/);
  });
  it("page does not duplicate import validation logic", () => {
    const page = stripSourceComments(read("src/pages/RepresentativeCsvPreview.tsx"));
    expect(page).not.toMatch(/CSV_MAPPING_CONFIG_SUPPORTED_VERSIONS/);
    expect(page).not.toMatch(/wrong_data_context/);
    expect(page).not.toMatch(/unsupported_schema_version/);
  });
});
