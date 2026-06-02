/**
 * Representative CSV Sensor Preview — pure helper tests + static safety scan.
 *
 * Covers normalization, raw_payload preservation, source/data_context
 * labeling, unit handling (no temp conversion), invalid/warning detection,
 * duplicate-timestamp preservation, and the static safety contract on the
 * helper + preview page (no inserts, no functions.invoke, no alerts, no
 * action_queue, no AI Doctor calls, no service_role).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  REPRESENTATIVE_CSV_DATA_CONTEXT,
  REPRESENTATIVE_CSV_SOURCE,
  planRepresentativeColumns,
  previewRepresentativeCsv,
  normalizeRepresentativeRow,
  parseCsv,
} from "@/lib/representativeCsvSensorPreviewRules";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const HEADERS = [
  "Timestamp",
  "Facility",
  "Room",
  "Zone",
  "Sensor",
  "Substrate_VWC_%",
  "Substrate_EC_mS/cm",
  "Substrate_Temp_C",
  "Air_Temp_C",
  "Humidity_%",
  "VPD_kPa",
  "CO2_ppm",
  "PPFD_umol",
];

function rowText(rows: string[][]): string {
  return [HEADERS.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

describe("representativeCsvSensorPreviewRules — normalization", () => {
  it("normalizes a valid representative row", () => {
    const text = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "55", "2.5", "22.0", "24.5", "60", "1.2", "900", "650"],
    ]);
    const out = previewRepresentativeCsv(text);
    expect(out.rows).toHaveLength(1);
    const r = out.rows[0];
    expect(r.state).toBe("valid");
    expect(r.captured_at).toBe(new Date("2026-05-01T12:00:00").toISOString());
    expect(r.air_temp_c).toBe(24.5);
    expect(r.humidity_pct).toBe(60);
    expect(r.vpd_kpa).toBe(1.2);
    expect(r.co2_ppm).toBe(900);
    expect(r.ppfd).toBe(650);
    expect(r.vwc_pct).toBe(55);
    expect(r.substrate_ec_mscm).toBe(2.5);
    expect(r.substrate_temp_c).toBe(22);
  });

  it("preserves raw_payload exactly", () => {
    const text = rowText([
      ["2026-05-01 12:00:00", "F1", "Flower-A", "Zone-3", "Probe-7", "55", "2.5", "22.0", "24.5", "60", "1.2", "900", "650"],
    ]);
    const out = previewRepresentativeCsv(text);
    expect(out.rows[0].raw_payload).toEqual({
      Timestamp: "2026-05-01 12:00:00",
      Facility: "F1",
      Room: "Flower-A",
      Zone: "Zone-3",
      Sensor: "Probe-7",
      "Substrate_VWC_%": "55",
      "Substrate_EC_mS/cm": "2.5",
      Substrate_Temp_C: "22.0",
      Air_Temp_C: "24.5",
      "Humidity_%": "60",
      VPD_kPa: "1.2",
      CO2_ppm: "900",
      PPFD_umol: "650",
    });
  });

  it("labels source as csv and data_context as representative_sample, never live", () => {
    const text = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "55", "2.5", "22", "24", "60", "1.2", "900", "650"],
    ]);
    const out = previewRepresentativeCsv(text);
    const r = out.rows[0];
    expect(r.source).toBe(REPRESENTATIVE_CSV_SOURCE);
    expect(r.source).toBe("csv");
    expect(r.data_context).toBe(REPRESENTATIVE_CSV_DATA_CONTEXT);
    expect(r.data_context).toBe("representative_sample");
    expect(JSON.stringify(r)).not.toMatch(/"live"/);
  });

  it("stores temperatures as canonical Celsius without converting", () => {
    const text = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "", "", "21.5", "26.7", "", "", "", ""],
    ]);
    const out = previewRepresentativeCsv(text);
    expect(out.rows[0].air_temp_c).toBe(26.7);
    expect(out.rows[0].substrate_temp_c).toBe(21.5);
  });

  it("stores EC as substrate_ec_mscm without unit munging", () => {
    const text = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "", "3.2", "", "", "", "", "", ""],
    ]);
    expect(previewRepresentativeCsv(text).rows[0].substrate_ec_mscm).toBe(3.2);
  });

  it("marks rows with missing timestamp invalid and preserves raw_payload", () => {
    const text = rowText([
      ["", "F1", "R1", "Z1", "S1", "55", "2.5", "22", "24", "60", "1.2", "900", "650"],
    ]);
    const out = previewRepresentativeCsv(text);
    expect(out.rows[0].state).toBe("invalid");
    expect(out.rows[0].reasons).toContain("missing_timestamp");
    expect(out.rows[0].captured_at).toBeNull();
    expect(out.rows[0].raw_payload.Facility).toBe("F1");
  });

  it("marks rows with unparseable timestamp invalid", () => {
    const text = rowText([
      ["not-a-date", "F1", "R1", "Z1", "S1", "55", "2.5", "22", "24", "60", "1.2", "900", "650"],
    ]);
    const out = previewRepresentativeCsv(text);
    expect(out.rows[0].state).toBe("invalid");
    expect(out.rows[0].reasons).toContain("invalid_timestamp");
  });

  it("flags humidity outside 0-100 as warning", () => {
    const text = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "", "", "", "", "120", "", "", ""],
    ]);
    const out = previewRepresentativeCsv(text);
    expect(out.rows[0].state).toBe("warning");
    expect(out.rows[0].reasons).toContain("humidity_out_of_range");
  });

  it("flags VWC outside 0-100 as warning", () => {
    const text = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "150", "", "", "", "", "", "", ""],
    ]);
    expect(previewRepresentativeCsv(text).rows[0].reasons).toContain("vwc_out_of_range");
  });

  it("flags negative VPD as warning", () => {
    const text = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "", "", "", "", "", "-0.5", "", ""],
    ]);
    expect(previewRepresentativeCsv(text).rows[0].reasons).toContain("vpd_negative");
  });

  it("flags non-finite EC and impossible temperatures", () => {
    const ecText = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "", "NaN", "", "", "", "", "", ""],
    ]);
    expect(previewRepresentativeCsv(ecText).rows[0].reasons).toContain("ec_non_finite");

    const tempText = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "", "", "", "999", "", "", "", ""],
    ]);
    expect(previewRepresentativeCsv(tempText).rows[0].reasons).toContain("air_temp_impossible");
  });

  it("preserves duplicate timestamps from different sensors without collapsing", () => {
    const text = rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "55", "2.5", "22", "24", "60", "1.2", "900", "650"],
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S2", "57", "2.6", "22", "24", "61", "1.2", "905", "655"],
    ]);
    const out = previewRepresentativeCsv(text);
    expect(out.rows).toHaveLength(2);
    expect(out.rows[0].sensor).toBe("S1");
    expect(out.rows[1].sensor).toBe("S2");
    expect(out.rows[0].captured_at).toBe(out.rows[1].captured_at);
  });

  it("planRepresentativeColumns + normalizeRepresentativeRow are pure and deterministic", () => {
    const parsed = parseCsv(rowText([
      ["2026-05-01 12:00:00", "F1", "R1", "Z1", "S1", "55", "2.5", "22", "24", "60", "1.2", "900", "650"],
    ]));
    const plan = planRepresentativeColumns(parsed.headers);
    const a = normalizeRepresentativeRow({ cells: parsed.rows[0], headers: parsed.headers, plan, rowIndex: 0 });
    const b = normalizeRepresentativeRow({ cells: parsed.rows[0], headers: parsed.headers, plan, rowIndex: 0 });
    expect(a).toEqual(b);
  });
});

describe("representativeCsvSensorPreviewRules — static safety scan", () => {
  const helper = stripSourceComments(read("src/lib/representativeCsvSensorPreviewRules.ts"));
  const page = stripSourceComments(read("src/pages/RepresentativeCsvPreview.tsx"));
  const pageRaw = read("src/pages/RepresentativeCsvPreview.tsx");

  for (const [name, src] of [["helper", helper], ["page", page]] as const) {
    it(`${name}: no DB writes / functions.invoke / service_role`, () => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/service_role/);
    });

    it(`${name}: no alerts / action_queue / ai_doctor references`, () => {
      expect(src).not.toMatch(/\baction_queue\b/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
      expect(src).not.toMatch(/\bai_doctor\b/);
    });

    it(`${name}: no automation/device-control surface`, () => {
      expect(src).not.toMatch(/mqtt|home.?assistant|pi_bridge|relay|actuator/i);
    });

    it(`${name}: never asserts live data`, () => {
      // Defensive: helper and page must never label preview data "live".
      expect(src).not.toMatch(/=\s*['"]live['"]/);
    });
  }

  it("page visibly labels CSV import + representative sample + not live", () => {
    expect(pageRaw).toMatch(/CSV import/);
    expect(pageRaw).toMatch(/Representative sample/);
    expect(pageRaw).toMatch(/Not live data/);
  });

  it("page does not auto-infer tent_id from CSV Room/Zone", () => {
    expect(page).not.toMatch(/tent_id\s*=\s*row\.room/i);
    expect(page).not.toMatch(/inferTent/i);
  });
});
