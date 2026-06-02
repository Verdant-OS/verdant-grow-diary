/**
 * CSV row validation hints — pure helper tests.
 */
import { describe, it, expect } from "vitest";

import {
  emptyRepresentativeMapping,
  normalizeRepresentativeRow,
  planFromMapping,
  type RepresentativeColumnMapping,
} from "@/lib/representativeCsvSensorPreviewRules";
import { deriveCsvRowValidationHints } from "@/lib/csvRowValidationRules";

const HEADERS = ["timestamp", "rh", "ec", "ph", "temp", "co2"];

function makeMapping(): RepresentativeColumnMapping {
  return {
    ...emptyRepresentativeMapping(),
    timestamp: "timestamp",
    humidity: { column: "rh" },
    substrate_ec: { column: "ec", unit: "mS/cm" },
    air_temp: { column: "temp", unit: "C" },
    co2: { column: "co2" },
  };
}

function row(cells: string[], mapping = makeMapping()) {
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

describe("deriveCsvRowValidationHints", () => {
  it("missing timestamp produces block hint", () => {
    const mapping = makeMapping();
    const r = row(["", "60", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row: r, mapping });
    expect(out.canonicalPreviewable).toBe(false);
    expect(out.hints.some((h) => h.code === "missing_timestamp" && h.severity === "block")).toBe(true);
  });

  it("unparseable timestamp produces block hint", () => {
    const mapping = makeMapping();
    const r = row(["not-a-date", "60", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row: r, mapping });
    expect(out.canonicalPreviewable).toBe(false);
    expect(out.hints.some((h) => h.code === "invalid_timestamp")).toBe(true);
  });

  it("missing optional humidity column produces warning but row remains previewable", () => {
    const mapping = makeMapping();
    mapping.humidity = { column: null };
    const r = row(["2026-05-01 12:00:00", "", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row: r, mapping });
    expect(out.canonicalPreviewable).toBe(true);
    expect(out.hints.some((h) => h.code === "humidity_missing" && h.severity === "warn")).toBe(true);
  });

  it("missing optional CO2 column produces warning but row remains previewable", () => {
    const mapping = makeMapping();
    mapping.co2 = { column: null };
    const r = row(["2026-05-01 12:00:00", "60", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row: r, mapping });
    expect(out.canonicalPreviewable).toBe(true);
    expect(out.hints.some((h) => h.code === "co2_missing")).toBe(true);
  });

  it("unparseable numeric value produces field-specific hint", () => {
    const mapping = makeMapping();
    const r = row(["2026-05-01 12:00:00", "abc", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row: r, mapping });
    const hint = out.hints.find((h) => h.code === "humidity_non_finite");
    expect(hint).toBeTruthy();
    expect(hint?.field).toBe("humidity");
  });

  it("EC value > 50 with mS/cm selected produces suspicious-units warning", () => {
    const mapping = makeMapping();
    const r = row(["2026-05-01 12:00:00", "60", "2500", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row: r, mapping });
    expect(out.hints.some((h) => h.code === "ec_suspicious_units")).toBe(true);
  });

  it("pH outside 4–9 produces warning", () => {
    const mapping = makeMapping();
    const r = row(["2026-05-01 12:00:00", "60", "2.5", "11.0", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row: r, mapping });
    expect(out.hints.some((h) => h.code === "ph_out_of_range")).toBe(true);
  });

  it("humidity stuck at 0 produces stuck warning", () => {
    const mapping = makeMapping();
    const r = row(["2026-05-01 12:00:00", "0", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row: r, mapping });
    expect(out.hints.some((h) => h.code === "humidity_stuck")).toBe(true);
  });

  it("humidity stuck at 100 produces stuck warning", () => {
    const mapping = makeMapping();
    const r = row(["2026-05-01 12:00:00", "100", "2.5", "6.2", "24", "900"], mapping);
    const out = deriveCsvRowValidationHints({ row: r, mapping });
    expect(out.hints.some((h) => h.code === "humidity_stuck")).toBe(true);
  });
});
