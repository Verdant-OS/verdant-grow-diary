/**
 * CSV mapping config serializer tests.
 */
import { describe, it, expect } from "vitest";

import {
  buildCsvMappingConfig,
  csvMappingConfigFileName,
  CSV_MAPPING_CONFIG_DATA_CONTEXT,
  CSV_MAPPING_CONFIG_SCHEMA_VERSION,
} from "@/lib/csvMappingConfig";
import { emptyRepresentativeMapping } from "@/lib/representativeCsvSensorPreviewRules";

describe("csvMappingConfig — buildCsvMappingConfig", () => {
  it("includes schema_version, data_context, selected units, ignored headers", () => {
    const mapping = emptyRepresentativeMapping();
    mapping.timestamp = "Timestamp";
    mapping.air_temp = { column: "Air_F", unit: "F" };
    mapping.substrate_ec = { column: "EC", unit: "uS/cm" };
    const config = buildCsvMappingConfig({
      mapping,
      headers: ["Timestamp", "Air_F", "EC", "Notes"],
      templateId: "generic_env",
      templateName: "Generic environment CSV",
      now: () => new Date("2026-06-02T00:00:00Z"),
    });
    expect(config.schema_version).toBe(CSV_MAPPING_CONFIG_SCHEMA_VERSION);
    expect(config.data_context).toBe(CSV_MAPPING_CONFIG_DATA_CONTEXT);
    expect(config.source_label).toBe("representative_csv");
    expect(config.template_id).toBe("generic_env");
    expect(config.template_name).toBe("Generic environment CSV");
    expect(config.created_at).toBe("2026-06-02T00:00:00.000Z");
    expect(config.units.air_temp).toBe("F");
    expect(config.units.substrate_ec).toBe("uS/cm");
    expect(config.mapping.timestamp).toBe("Timestamp");
    expect(config.mapping.air_temp).toBe("Air_F");
    expect(config.ignored_headers).toEqual(["Notes"]);
  });

  it("template_name is null when no template applied", () => {
    const config = buildCsvMappingConfig({
      mapping: emptyRepresentativeMapping(),
      headers: [],
    });
    expect(config.template_name).toBeNull();
    expect(config.template_id).toBeNull();
  });

  it("lists unmapped canonical fields", () => {
    const config = buildCsvMappingConfig({
      mapping: emptyRepresentativeMapping(),
      headers: ["x"],
    });
    expect(config.unmapped_fields).toContain("timestamp");
    expect(config.unmapped_fields).toContain("humidity");
  });

  it("forwards caller-provided warnings", () => {
    const config = buildCsvMappingConfig({
      mapping: emptyRepresentativeMapping(),
      headers: [],
      warnings: [
        {
          code: "missing_required_header",
          field: "timestamp",
          message: "timestamp required",
        },
      ],
    });
    expect(config.warnings).toHaveLength(1);
    expect(config.warnings[0].code).toBe("missing_required_header");
  });

  it("excludes parsed row values, raw CSV row data, user/internal IDs, tokens, secrets", () => {
    const config = buildCsvMappingConfig({
      mapping: emptyRepresentativeMapping(),
      headers: ["a", "b"],
    });
    const s = JSON.stringify(config);
    expect(s).not.toMatch(/raw_payload/);
    expect(s).not.toMatch(/rowIndex/);
    expect(s).not.toMatch(/captured_at/);
    expect(s).not.toMatch(/parsed/);
    expect(s).not.toMatch(/user_id/);
    expect(s).not.toMatch(/grow_id/);
    expect(s).not.toMatch(/tent_id/);
    expect(s).not.toMatch(/plant_id/);
    expect(s).not.toMatch(/token/i);
    expect(s).not.toMatch(/secret/i);
    expect(s).not.toMatch(/service_role/);
  });

  it("never labels the config as live data", () => {
    const config = buildCsvMappingConfig({
      mapping: emptyRepresentativeMapping(),
      headers: [],
    });
    expect(JSON.stringify(config)).not.toMatch(/"live"/);
    expect(config.source_label).not.toBe("live" as unknown);
  });

  it("file name is verdant-csv-mapping-preset.json", () => {
    expect(csvMappingConfigFileName()).toBe("verdant-csv-mapping-preset.json");
  });
});
