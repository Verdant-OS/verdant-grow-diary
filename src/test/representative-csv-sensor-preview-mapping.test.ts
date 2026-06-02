/**
 * Representative CSV Preview — explicit column + unit mapping.
 *
 * Covers the explicit mapping API added on top of the synonym-based
 * auto-detect. Verifies arbitrary headers can be mapped, units normalize
 * to canonical Celsius / mS-per-cm, missing optional fields don't fail
 * the whole preview, and the safety contract still holds.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  defaultMappingFromHeaders,
  emptyRepresentativeMapping,
  parseCsv,
  planFromMapping,
  previewRepresentativeCsv,
  REPRESENTATIVE_CSV_DATA_CONTEXT,
  REPRESENTATIVE_CSV_SOURCE,
  REPRESENTATIVE_MAPPING_FIELDS,
  type RepresentativeColumnMapping,
} from "@/lib/representativeCsvSensorPreviewRules";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const CUSTOM_HEADERS = [
  "captured",
  "probe",
  "site",
  "zone_name",
  "air_t",
  "sub_t",
  "rh",
  "vpd",
  "co2",
  "par",
  "wc",
  "ec",
];

function customRowText(rows: string[][]): string {
  return [CUSTOM_HEADERS.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

function mappingForCustom(
  overrides: Partial<RepresentativeColumnMapping> = {},
): RepresentativeColumnMapping {
  const base: RepresentativeColumnMapping = {
    ...emptyRepresentativeMapping(),
    timestamp: "captured",
    sensor: "probe",
    facility: "site",
    room: null,
    zone: "zone_name",
    air_temp: { column: "air_t", unit: "C" },
    substrate_temp: { column: "sub_t", unit: "C" },
    humidity: { column: "rh" },
    vpd: { column: "vpd" },
    co2: { column: "co2" },
    ppfd: { column: "par" },
    vwc: { column: "wc" },
    substrate_ec: { column: "ec", unit: "mS/cm" },
  };
  return { ...base, ...overrides };
}

describe("representative csv preview — explicit mapping", () => {
  it("detects headers from uploaded CSV", () => {
    const text = customRowText([]);
    const result = previewRepresentativeCsv(text);
    expect(result.headers).toEqual(CUSTOM_HEADERS);
  });

  it("maps a custom timestamp header to captured_at", () => {
    const text = customRowText([
      ["2026-05-01 12:00:00", "P1", "F", "Z", "24", "22", "60", "1.2", "900", "650", "55", "2.5"],
    ]);
    const result = previewRepresentativeCsv(text, { mapping: mappingForCustom() });
    expect(result.rows[0].captured_at).toBe(new Date("2026-05-01T12:00:00").toISOString());
    expect(result.rows[0].state).toBe("valid");
  });

  it("maps a custom air-temp header with °C unit (no conversion)", () => {
    const text = customRowText([
      ["2026-05-01 12:00:00", "P1", "F", "Z", "24.5", "", "", "", "", "", "", ""],
    ]);
    const result = previewRepresentativeCsv(text, {
      mapping: mappingForCustom({ air_temp: { column: "air_t", unit: "C" } }),
    });
    expect(result.rows[0].air_temp_c).toBe(24.5);
  });

  it("maps a custom air-temp header with °F unit and normalizes to Celsius", () => {
    const text = customRowText([
      ["2026-05-01 12:00:00", "P1", "F", "Z", "76.1", "", "", "", "", "", "", ""],
    ]);
    const result = previewRepresentativeCsv(text, {
      mapping: mappingForCustom({ air_temp: { column: "air_t", unit: "F" } }),
    });
    const expected = (76.1 - 32) * (5 / 9);
    expect(result.rows[0].air_temp_c).toBeCloseTo(expected, 5);
    // Raw payload still preserves the original °F string verbatim.
    expect(result.rows[0].raw_payload.air_t).toBe("76.1");
  });

  it("maps EC from mS/cm without converting", () => {
    const text = customRowText([
      ["2026-05-01 12:00:00", "P1", "F", "Z", "", "", "", "", "", "", "", "2.5"],
    ]);
    const result = previewRepresentativeCsv(text, {
      mapping: mappingForCustom({ substrate_ec: { column: "ec", unit: "mS/cm" } }),
    });
    expect(result.rows[0].substrate_ec_mscm).toBe(2.5);
  });

  it("maps EC from uS/cm and normalizes safely to mS/cm", () => {
    const text = customRowText([
      ["2026-05-01 12:00:00", "P1", "F", "Z", "", "", "", "", "", "", "", "2500"],
    ]);
    const result = previewRepresentativeCsv(text, {
      mapping: mappingForCustom({ substrate_ec: { column: "ec", unit: "uS/cm" } }),
    });
    expect(result.rows[0].substrate_ec_mscm).toBeCloseTo(2.5, 5);
    expect(result.rows[0].raw_payload.ec).toBe("2500");
  });

  it("missing optional fields do not fail the whole preview", () => {
    const text = customRowText([
      ["2026-05-01 12:00:00", "P1", "F", "Z", "", "", "60", "", "", "", "", ""],
    ]);
    const result = previewRepresentativeCsv(text, {
      mapping: mappingForCustom({
        air_temp: { column: null, unit: "C" },
        substrate_temp: { column: null, unit: "C" },
        vpd: { column: null },
        co2: { column: null },
        ppfd: { column: null },
        vwc: { column: null },
        substrate_ec: { column: null, unit: "mS/cm" },
      }),
    });
    expect(result.rows[0].state).toBe("valid");
    expect(result.rows[0].air_temp_c).toBeNull();
    expect(result.rows[0].humidity_pct).toBe(60);
  });

  it("missing or unparseable timestamp marks the row invalid", () => {
    const missing = customRowText([
      ["", "P1", "F", "Z", "24", "22", "60", "1.2", "900", "650", "55", "2.5"],
    ]);
    expect(previewRepresentativeCsv(missing, { mapping: mappingForCustom() }).rows[0].state).toBe(
      "invalid",
    );

    const garbled = customRowText([
      ["nope", "P1", "F", "Z", "24", "22", "60", "1.2", "900", "650", "55", "2.5"],
    ]);
    const r = previewRepresentativeCsv(garbled, { mapping: mappingForCustom() }).rows[0];
    expect(r.state).toBe("invalid");
    expect(r.reasons).toContain("invalid_timestamp");
  });

  it("preserves Facility/Room/Zone but never infers Verdant IDs", () => {
    const text = customRowText([
      ["2026-05-01 12:00:00", "P1", "Flower-A", "Zone-3", "24", "22", "60", "1.2", "900", "650", "55", "2.5"],
    ]);
    const result = previewRepresentativeCsv(text, { mapping: mappingForCustom() });
    const row = result.rows[0];
    expect(row.facility).toBe("Flower-A");
    expect(row.zone).toBe("Zone-3");
    expect(row).not.toHaveProperty("tent_id");
    expect(row).not.toHaveProperty("grow_id");
    expect(row).not.toHaveProperty("plant_id");
  });

  it("preserves raw_payload exactly", () => {
    const text = customRowText([
      ["2026-05-01 12:00:00", "P1", "Flower-A", "Zone-3", "76.1", "70.0", "60", "1.2", "900", "650", "55", "2500"],
    ]);
    const result = previewRepresentativeCsv(text, {
      mapping: mappingForCustom({
        air_temp: { column: "air_t", unit: "F" },
        substrate_temp: { column: "sub_t", unit: "F" },
        substrate_ec: { column: "ec", unit: "uS/cm" },
      }),
    });
    expect(result.rows[0].raw_payload).toEqual({
      captured: "2026-05-01 12:00:00",
      probe: "P1",
      site: "Flower-A",
      zone_name: "Zone-3",
      air_t: "76.1",
      sub_t: "70.0",
      rh: "60",
      vpd: "1.2",
      co2: "900",
      par: "650",
      wc: "55",
      ec: "2500",
    });
  });

  it("preview labels source=csv and data_context=representative_sample and never live", () => {
    const text = customRowText([
      ["2026-05-01 12:00:00", "P1", "F", "Z", "24", "22", "60", "1.2", "900", "650", "55", "2.5"],
    ]);
    const result = previewRepresentativeCsv(text, { mapping: mappingForCustom() });
    expect(result.rows[0].source).toBe(REPRESENTATIVE_CSV_SOURCE);
    expect(result.rows[0].data_context).toBe(REPRESENTATIVE_CSV_DATA_CONTEXT);
    expect(JSON.stringify(result)).not.toMatch(/"live"/);
  });

  it("defaultMappingFromHeaders returns canonical fields for the synthetic shape", () => {
    const parsed = parseCsv(
      "Timestamp,Sensor,Air_Temp_C,Substrate_EC_mS/cm\n2026-05-01 12:00:00,P,24,2.5",
    );
    const mapping = defaultMappingFromHeaders(parsed.headers);
    expect(mapping.timestamp).toBe("Timestamp");
    expect(mapping.sensor).toBe("Sensor");
    expect(mapping.air_temp.column).toBe("Air_Temp_C");
    expect(mapping.air_temp.unit).toBe("C");
    expect(mapping.substrate_ec.column).toBe("Substrate_EC_mS/cm");
    expect(mapping.substrate_ec.unit).toBe("mS/cm");
  });

  it("planFromMapping resolves header indices (case-insensitive)", () => {
    const headers = ["Captured", "Probe", "Air_T"];
    const mapping: RepresentativeColumnMapping = {
      ...emptyRepresentativeMapping(),
      timestamp: "captured",
      sensor: "PROBE",
      air_temp: { column: "air_t", unit: "C" },
    };
    const plan = planFromMapping(headers, mapping);
    expect(plan.timestamp).toBe(0);
    expect(plan.sensor).toBe(1);
    expect(plan.air_temp_c).toBe(2);
    expect(plan.humidity_pct).toBeNull();
  });

  it("exposes the canonical mapping field list to the UI", () => {
    expect(REPRESENTATIVE_MAPPING_FIELDS).toContain("timestamp");
    expect(REPRESENTATIVE_MAPPING_FIELDS).toContain("air_temp");
    expect(REPRESENTATIVE_MAPPING_FIELDS).toContain("substrate_ec");
  });
});

describe("representative csv preview — static safety scan (mapping page)", () => {
  const helper = stripSourceComments(read("src/lib/representativeCsvSensorPreviewRules.ts"));
  const page = stripSourceComments(read("src/pages/RepresentativeCsvPreview.tsx"));
  const pageRaw = read("src/pages/RepresentativeCsvPreview.tsx");

  for (const [name, src] of [["helper", helper], ["page", page]] as const) {
    it(`${name}: no sensor_readings insert/update/upsert/delete/rpc`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/sensor_readings/);
    });

    it(`${name}: no alerts / action_queue / ai_doctor / functions.invoke / service_role`, () => {
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/\bai_doctor\b/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/service_role/);
    });

    it(`${name}: never labels rows as live`, () => {
      expect(src).not.toMatch(/=\s*['"]live['"]/);
    });
  }

  it("page surfaces preview-only copy and never-saved messaging", () => {
    expect(pageRaw).toMatch(/Preview only/);
    expect(pageRaw).toMatch(/Nothing is saved/);
    expect(pageRaw).toMatch(/Not live data/);
    expect(pageRaw).toMatch(/Map columns/);
  });
});
