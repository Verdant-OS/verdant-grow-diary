/**
 * CSV per-row validation hints — pure-helper tests.
 *
 * Covers field states, timestamp policy, severity precedence, suspicious
 * telemetry detection, EC unit-mismatch warning copy, mapping collisions,
 * deterministic output, and null-row safety.
 */
import { describe, it, expect } from "vitest";

import {
  emptyRepresentativeMapping,
  normalizeRepresentativeRow,
  planFromMapping,
  type RepresentativeColumnMapping,
  type RepresentativeDraftReading,
} from "@/lib/representativeCsvSensorPreviewRules";
import {
  deriveCsvRowValidationHints,
  detectMappingCollisions,
} from "@/lib/csvRowValidationRules";
import {
  PH_REALISTIC_RANGE,
  EC_SUSPICIOUS_MSCM_MAX,
} from "@/constants/csvValidationRanges";

const HEADERS = ["Timestamp", "RH", "EC", "PH", "Temp", "CO2"];

function makeMapping(
  overrides: Partial<RepresentativeColumnMapping> = {},
): RepresentativeColumnMapping {
  return {
    ...emptyRepresentativeMapping(),
    timestamp: "Timestamp",
    humidity: { column: "RH" },
    substrate_ec: { column: "EC", unit: "mS/cm" },
    air_temp: { column: "Temp", unit: "C" },
    co2: { column: "CO2" },
    ...overrides,
  };
}

function buildRow(
  cells: string[],
  mapping = makeMapping(),
): RepresentativeDraftReading {
  return normalizeRepresentativeRow({
    headers: HEADERS,
    cells,
    plan: planFromMapping(HEADERS, mapping),
    rowIndex: 0,
    units: {
      airTempUnit: mapping.air_temp.unit,
      ecUnit: mapping.substrate_ec.unit,
    },
  });
}

// ---------- timestamp ----------

describe("timestamp policy", () => {
  it("missing timestamp mapping marks row invalid but visible", () => {
    const mapping = makeMapping({ timestamp: null });
    const row = buildRow(["2026-05-01T10:00:00Z", "60", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.severity).toBe("invalid");
    expect(out.canonicalPreviewable).toBe(false);
    expect(out.fieldStates.timestamp).toBe("not_mapped");
    expect(out.hints.find((h) => h.code === "timestamp_not_mapped")?.severity).toBe("invalid");
  });

  it("unparseable timestamp marks row invalid but visible", () => {
    const mapping = makeMapping();
    const row = buildRow(["bad-date", "60", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.severity).toBe("invalid");
    expect(out.canonicalPreviewable).toBe(false);
    expect(out.fieldStates.timestamp).toBe("mapped_unparseable");
    const h = out.hints.find((x) => x.code === "timestamp_unparseable")!;
    expect(h.header).toBe("Timestamp");
    expect(h.rawValue).toBe("bad-date");
  });

  it("ISO 8601 with timezone is valid without timestamp warning", () => {
    const mapping = makeMapping();
    const row = buildRow(["2026-05-01T10:00:00Z", "60", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.fieldStates.timestamp).toBe("mapped_parsed");
    expect(out.hints.some((h) => h.field === "timestamp")).toBe(false);
  });

  it("common datetime without timezone is preview-valid but warns about timezone", () => {
    const mapping = makeMapping();
    const row = buildRow(["2026-05-01 10:00:00", "60", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.fieldStates.timestamp).toBe("mapped_parsed");
    expect(out.canonicalPreviewable).toBe(true);
    const tsHint = out.hints.find((h) => h.code === "timestamp_no_timezone");
    expect(tsHint?.severity).toBe("warn");
  });

  it('year-only string like "2026" is invalid', () => {
    const mapping = makeMapping();
    const row = buildRow(["2026", "60", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.severity).toBe("invalid");
    expect(out.canonicalPreviewable).toBe(false);
    expect(out.hints.find((h) => h.code === "timestamp_year_only")?.severity).toBe("invalid");
  });
});

// ---------- field states ----------

describe("field states", () => {
  it("unmapped optional field returns not_mapped state + warning hint, row stays previewable", () => {
    const mapping = makeMapping({ humidity: { column: null } });
    const row = buildRow(["2026-05-01T10:00:00Z", "", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.fieldStates.humidity).toBe("not_mapped");
    expect(out.canonicalPreviewable).toBe(true);
    expect(out.hints.find((h) => h.code === "humidity_not_mapped")?.severity).toBe("warn");
  });

  it("mapped field with unparseable value returns mapped_unparseable", () => {
    const mapping = makeMapping();
    const row = buildRow(["2026-05-01T10:00:00Z", "abc", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.fieldStates.humidity).toBe("mapped_unparseable");
    const h = out.hints.find((x) => x.code === "humidity_unparseable")!;
    expect(h.header).toBe("RH");
    expect(h.rawValue).toBe("abc");
  });

  it("mapped field with valid value returns mapped_parsed", () => {
    const mapping = makeMapping();
    const row = buildRow(["2026-05-01T10:00:00Z", "55", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.fieldStates.humidity).toBe("mapped_parsed");
  });
});

// ---------- suspicious telemetry ----------

describe("suspicious telemetry", () => {
  it("humidity 0 returns suspicious warning", () => {
    const mapping = makeMapping();
    const row = buildRow(["2026-05-01T10:00:00Z", "0", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.hints.some((h) => h.code === "humidity_stuck")).toBe(true);
  });

  it("humidity 100 returns suspicious warning", () => {
    const mapping = makeMapping();
    const row = buildRow(["2026-05-01T10:00:00Z", "100", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.hints.some((h) => h.code === "humidity_stuck")).toBe(true);
  });

  it("pH outside realistic cultivation range returns warning", () => {
    const mapping = makeMapping();
    const bad = String(PH_REALISTIC_RANGE.max + 2);
    const row = buildRow(["2026-05-01T10:00:00Z", "55", "2.5", bad, "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    const ph = out.hints.find((h) => h.code === "ph_out_of_range")!;
    expect(ph.severity).toBe("warn");
    expect(ph.rawValue).toBe(bad);
  });

  it("EC likely µS/cm while mS/cm selected returns warning, not invalid", () => {
    const mapping = makeMapping();
    const ec = String(EC_SUSPICIOUS_MSCM_MAX + 1000);
    const row = buildRow(["2026-05-01T10:00:00Z", "55", ec, "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    const ecHint = out.hints.find((h) => h.code === "ec_suspicious_units")!;
    expect(ecHint.severity).toBe("warn");
    expect(out.severity).not.toBe("invalid");
  });

  it("EC unit warning copy is suggestive, not certain", () => {
    const mapping = makeMapping();
    const row = buildRow(["2026-05-01T10:00:00Z", "55", "1450", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    const ecHint = out.hints.find((h) => h.code === "ec_suspicious_units")!;
    expect(ecHint.message).toMatch(/looks like|may be/);
    expect(ecHint.message).not.toMatch(/definitely|is in µS|is uS/i);
  });
});

// ---------- mapping collisions ----------

describe("mapping collisions", () => {
  it("two headers mapped to one canonical field returns collision warning naming both", () => {
    const mapping = makeMapping();
    const out = deriveCsvRowValidationHints({
      row: buildRow(["2026-05-01T10:00:00Z", "55", "2.5", "6.2", "24", "900"], mapping),
      mapping,
      ambiguousMappings: { air_temp: ["Temp 1", "Temp 2"] },
    });
    const collision = out.hints.find((h) => h.code === "multiple_headers_for_field")!;
    expect(collision.message).toContain("Temp 1");
    expect(collision.message).toContain("Temp 2");
    expect(collision.severity).toBe("warn");
  });

  it("detectMappingCollisions flags one header mapped to multiple canonical fields", () => {
    const mapping = makeMapping({
      air_temp: { column: "Temp", unit: "C" },
      substrate_temp: { column: "Temp", unit: "C" },
    });
    const hints = detectMappingCollisions(mapping);
    expect(hints.length).toBe(1);
    expect(hints[0].code).toBe("header_mapped_to_multiple_fields");
    expect(hints[0].message).toContain("air_temp");
    expect(hints[0].message).toContain("substrate_temp");
  });
});

// ---------- severity precedence ----------

describe("row severity", () => {
  it("invalid timestamp + suspicious humidity → severity invalid, both hints render", () => {
    const mapping = makeMapping();
    const row = buildRow(["bad-date", "100", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.severity).toBe("invalid");
    expect(out.hints.some((h) => h.code === "timestamp_unparseable")).toBe(true);
    expect(out.hints.some((h) => h.code === "humidity_stuck")).toBe(true);
  });

  it("severity follows invalid > warning > ok", () => {
    const fullMapping = makeMapping({
      substrate_temp: { column: "Temp", unit: "C" },
      vpd: { column: "RH" },
      ppfd: { column: "CO2" },
      vwc: { column: "RH" },
    });
    const okRow = buildRow(["2026-05-01T10:00:00Z", "55", "2.5", "6.2", "24", "900"], fullMapping);
    const warnRow = buildRow(["2026-05-01T10:00:00Z", "100", "2.5", "6.2", "24", "900"], fullMapping);
    const badRow = buildRow(["bad", "100", "2.5", "6.2", "24", "900"], fullMapping);
    expect(deriveCsvRowValidationHints({ row: okRow, mapping: fullMapping }).severity).toBe("ok");
    expect(deriveCsvRowValidationHints({ row: warnRow, mapping: fullMapping }).severity).toBe("warning");
    expect(deriveCsvRowValidationHints({ row: badRow, mapping: fullMapping }).severity).toBe("invalid");
  });

  it("fully clean row with everything mapped + in-range returns ok", () => {
    const fullMapping = makeMapping({
      substrate_temp: { column: "Temp", unit: "C" },
      vpd: { column: "RH" },
      ppfd: { column: "CO2" },
      vwc: { column: "RH" },
    });
    const row = buildRow(["2026-05-01T10:00:00Z", "55", "2.5", "6.2", "24", "900"], fullMapping);
    const out = deriveCsvRowValidationHints({ row, mapping: fullMapping });
    expect(out.severity).toBe("ok");
    expect(out.hints).toEqual([]);
  });

  it("unknown / bad fields never produce healthy copy", () => {
    const mapping = makeMapping();
    const row = buildRow(["bad", "abc", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.severity).not.toBe("ok");
    const allCopy = out.hints.map((h) => h.message).join(" ");
    expect(allCopy).not.toMatch(/\bhealthy\b/i);
    expect(allCopy).not.toMatch(/\bclean\b/i);
    expect(allCopy).not.toMatch(/\blooks good\b/i);
  });
});

// ---------- parse-only fields ----------

describe("CO2 / VPD / PPFD are parse-only this slice", () => {
  it("does not emit range warnings for CO2/VPD/PPFD; only unparseable numeric hints", () => {
    const mapping = makeMapping();
    mapping.vpd = { column: "RH" };
    mapping.ppfd = { column: "CO2" };
    const row = buildRow(["2026-05-01T10:00:00Z", "55", "2.5", "6.2", "24", "99999"], mapping);
    const out = deriveCsvRowValidationHints({ row, mapping });
    expect(out.hints.some((h) => h.code === "co2_out_of_range")).toBe(false);
    expect(out.hints.some((h) => h.code === "vpd_out_of_range")).toBe(false);
    expect(out.hints.some((h) => h.code === "ppfd_out_of_range")).toBe(false);
  });
});

// ---------- determinism + safety ----------

describe("determinism + safety", () => {
  it("output is deterministic across repeated calls", () => {
    const mapping = makeMapping();
    const row = buildRow(["2026-05-01 10:00:00", "100", "1450", "9.5", "24", "900"], mapping);
    const a = deriveCsvRowValidationHints({ row, mapping });
    const b = deriveCsvRowValidationHints({ row, mapping });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not crash on empty/null-shaped row input", () => {
    const mapping = makeMapping({ timestamp: null });
    const emptyRow: RepresentativeDraftReading = {
      rowIndex: 0,
      captured_at: null,
      source: "csv",
      data_context: "representative_sample",
      raw_payload: {},
      facility: null,
      room: null,
      zone: null,
      sensor: null,
      air_temp_c: null,
      substrate_temp_c: null,
      humidity_pct: null,
      vpd_kpa: null,
      co2_ppm: null,
      ppfd: null,
      vwc_pct: null,
      substrate_ec_mscm: null,
      state: "invalid",
      reasons: [],
    };
    const out = deriveCsvRowValidationHints({ row: emptyRow, mapping });
    expect(out.severity).toBe("invalid");
    expect(out.canonicalPreviewable).toBe(false);
  });
});
