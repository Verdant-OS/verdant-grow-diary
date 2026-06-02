/**
 * CSV mapping templates + JSON download — pure-helper tests.
 */
import { describe, it, expect } from "vitest";

import {
  applyCsvMappingTemplate,
  buildMappingDownloadPayload,
  csvMappingDownloadFileName,
  CSV_MAPPING_PRESET_SCHEMA_VERSION,
  CSV_MAPPING_PRESET_SOURCE,
  CSV_MAPPING_TEMPLATES,
  getCsvMappingTemplate,
} from "@/lib/csvMappingTemplates";
import { emptyRepresentativeMapping } from "@/lib/representativeCsvSensorPreviewRules";

const genericEnv = getCsvMappingTemplate("generic_env")!;
const acInfinity = getCsvMappingTemplate("ac_infinity")!;
const sensorLogger = getCsvMappingTemplate("generic_sensor_logger")!;

describe("csv mapping templates — apply", () => {
  it("generic env template maps timestamp/temp/humidity/co2 from common headers", () => {
    const headers = ["timestamp", "temperature", "humidity", "co2"];
    const result = applyCsvMappingTemplate(genericEnv, headers);
    expect(result.mapping.timestamp).toBe("timestamp");
    expect(result.mapping.air_temp.column).toBe("temperature");
    expect(result.mapping.humidity.column).toBe("humidity");
    expect(result.mapping.co2.column).toBe("co2");
    expect(result.ambiguousFields).toEqual([]);
  });

  it("AC Infinity-style template maps time/temperature/humidity/VPD", () => {
    const headers = ["time", "temperature", "humidity", "vpd"];
    const result = applyCsvMappingTemplate(acInfinity, headers);
    expect(result.mapping.timestamp).toBe("time");
    expect(result.mapping.air_temp.column).toBe("temperature");
    expect(result.mapping.humidity.column).toBe("humidity");
    expect(result.mapping.vpd.column).toBe("vpd");
  });

  it("generic sensor logger template maps captured_at/EC/PPFD/soil_moisture", () => {
    const headers = ["captured_at", "air_temp", "rh", "vpd", "ppfd", "ec", "soil_moisture"];
    const result = applyCsvMappingTemplate(sensorLogger, headers);
    expect(result.mapping.timestamp).toBe("captured_at");
    expect(result.mapping.substrate_ec.column).toBe("ec");
    expect(result.mapping.substrate_ec.unit).toBe("mS/cm");
    expect(result.mapping.ppfd.column).toBe("ppfd");
    expect(result.mapping.vwc.column).toBe("soil_moisture");
  });

  it("does not silently pick between duplicate temperature headers", () => {
    const headers = ["timestamp", "temp_c", "temp_f", "humidity"];
    const result = applyCsvMappingTemplate(genericEnv, headers);
    expect(result.ambiguousFields).toContain("air_temp");
    expect(result.mapping.air_temp.column).toBeNull();
  });

  it("leaves ambiguous fields review-needed (still unmapped)", () => {
    const headers = ["timestamp", "temp", "temperature", "humidity"];
    const result = applyCsvMappingTemplate(genericEnv, headers);
    expect(result.ambiguousFields).toContain("air_temp");
    expect(result.mapping.air_temp.column).toBeNull();
  });

  it("applying a template never creates a live source label", () => {
    const headers = ["timestamp", "temperature", "humidity", "co2"];
    const result = applyCsvMappingTemplate(genericEnv, headers);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toMatch(/"live"/);
    expect(serialized).not.toMatch(/"source"\s*:\s*"live"/);
  });

  it("CSV_MAPPING_TEMPLATES exposes the documented set", () => {
    const ids = CSV_MAPPING_TEMPLATES.map((t) => t.id).sort();
    expect(ids).toEqual([
      "ac_infinity",
      "aroya_representative",
      "blank_reset",
      "generic_env",
      "generic_sensor_logger",
    ]);
  });
});

describe("csv mapping templates — download JSON payload", () => {
  it("includes canonical mapping + selected units", () => {
    const mapping = emptyRepresentativeMapping();
    mapping.timestamp = "Timestamp";
    mapping.air_temp = { column: "Air_F", unit: "F" };
    mapping.substrate_ec = { column: "EC", unit: "uS/cm" };
    const payload = buildMappingDownloadPayload({
      mapping,
      headers: ["Timestamp", "Air_F", "EC", "Notes"],
      templateId: "generic_env",
      templateName: "Generic environment CSV",
      now: () => new Date("2026-06-02T00:00:00Z"),
    });
    expect(payload.mapping.timestamp).toBe("Timestamp");
    expect(payload.mapping.air_temp).toBe("Air_F");
    expect(payload.units.air_temp).toBe("F");
    expect(payload.units.substrate_ec).toBe("uS/cm");
    expect(payload.template_id).toBe("generic_env");
    expect(payload.template_name).toBe("Generic environment CSV");
    expect(payload.schema_version).toBe(CSV_MAPPING_PRESET_SCHEMA_VERSION);
    expect(payload.source).toBe(CSV_MAPPING_PRESET_SOURCE);
    expect(payload.created_at).toBe("2026-06-02T00:00:00.000Z");
    expect(payload.ignored_headers).toContain("Notes");
  });

  it("excludes row data by default", () => {
    const mapping = emptyRepresentativeMapping();
    mapping.timestamp = "Timestamp";
    const payload = buildMappingDownloadPayload({
      mapping,
      headers: ["Timestamp"],
    });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/raw_payload/);
    expect(serialized).not.toMatch(/rowIndex/);
    expect(serialized).not.toMatch(/captured_at/);
  });

  it("excludes user_id, internal IDs, tokens, and secrets", () => {
    const mapping = emptyRepresentativeMapping();
    const payload = buildMappingDownloadPayload({ mapping, headers: [] });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toMatch(/user_id/);
    expect(serialized).not.toMatch(/grow_id/);
    expect(serialized).not.toMatch(/tent_id/);
    expect(serialized).not.toMatch(/plant_id/);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/secret/i);
    expect(serialized).not.toMatch(/service_role/);
  });

  it("download payload + filename are produced without Supabase", () => {
    const mapping = emptyRepresentativeMapping();
    const payload = buildMappingDownloadPayload({ mapping, headers: ["a"] });
    expect(payload).toBeTruthy();
    expect(csvMappingDownloadFileName()).toBe("verdant-csv-mapping-preset.json");
  });
});
