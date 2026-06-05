/**
 * Bucket-level expected-metric detection on normalizeEcowittCloudReadings
 * (Slice B-pre-pre — slice-1). Tests target the result-level
 * `missing_metric_codes` array. Summary/view-model/export wiring is OUT of
 * scope and is asserted UNCHANGED in regression.
 */
import { describe, it, expect } from "vitest";
import {
  normalizeEcowittCloudReadings,
  type EcowittCloudMappingConfig,
} from "@/lib/ecowittPayloadRules";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import {
  ECOWITT_MISSING_METRIC_CODES,
  isEcowittMissingMetricCode,
} from "@/constants/ecowittMissingMetricCodes";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

const MAC_RE = /\b[0-9A-F]{2}(?::[0-9A-F]{2}){5}\b/i;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const TENT_A = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";
const MAC = "AA:BB:CC:DD:EE:01";

const mapping: EcowittCloudMappingConfig = {
  byMac: {
    [MAC]: {
      air: { 1: TENT_A, 2: TENT_B },
      soil: { 1: TENT_A },
    },
  },
};
const opts = { now: new Date(fixtures.now) };

function normalize(payload: Record<string, unknown>) {
  return normalizeEcowittCloudReadings(payload, mapping, opts);
}

describe("normalizeEcowittCloudReadings — missing_metric_codes (mapped only)", () => {
  it("mapped air channel: temp present, humidity absent -> air_humidity_absent", () => {
    const res = normalize({
      MAC,
      dateutc: "2026-06-04 12:20:00",
      temp1f: 77,
      soilmoisture1: 40,
    });
    expect(res.missing_metric_codes).toContain("air_humidity_absent");
    expect(res.missing_metric_codes).not.toContain("air_temperature_absent");
    expect(res.missing_metric_codes).not.toContain("soil_moisture_absent");
  });

  it("mapped air channel: humidity present, temp absent -> air_temperature_absent", () => {
    const res = normalize({
      MAC,
      dateutc: "2026-06-04 12:20:00",
      humidity1: 55,
      soilmoisture1: 40,
    });
    expect(res.missing_metric_codes).toContain("air_temperature_absent");
    expect(res.missing_metric_codes).not.toContain("air_humidity_absent");
  });

  it("mapped soil channel: soil absent -> soil_moisture_absent", () => {
    const res = normalize({
      MAC,
      dateutc: "2026-06-04 12:20:00",
      temp1f: 77,
      humidity1: 55,
    });
    expect(res.missing_metric_codes).toEqual(["soil_moisture_absent"]);
  });

  it("fully-populated mapped channels -> empty array", () => {
    const res = normalize(
      fixtures.payloads.happy_multi_channel as Record<string, unknown>,
    );
    expect(res.missing_metric_codes).toEqual([]);
  });

  it("UNMAPPED channel missing a metric is NOT flagged (stays unmapped only)", () => {
    // Channel 7 has no mapping; temp7f present, humidity7 absent.
    const res = normalize({
      MAC,
      dateutc: "2026-06-04 12:20:00",
      temp7f: 70,
      temp1f: 77,
      humidity1: 55,
      soilmoisture1: 40,
    });
    expect(res.missing_metric_codes).toEqual([]);
    // Unmapped path is what represents channel 7.
    expect(res.unmapped.some((u) => u.channel === 7)).toBe(true);
  });

  it("only closed-set codes appear; no collision with existing vocab", () => {
    for (const id of Object.keys(fixtures.payloads)) {
      const res = normalize(
        (fixtures.payloads as Record<string, Record<string, unknown>>)[id],
      );
      for (const c of res.missing_metric_codes) {
        expect(isEcowittMissingMetricCode(c)).toBe(true);
      }
      // Provable-absent collision with neighboring vocabularies.
      const forbidden = new Set([
        "payload_not_object",
        "captured_at_missing_or_unparseable",
        "unsupported_metric_for_ecowitt",
        "no_tent_mapping_for_channel",
        "pressure_unmapped",
        "rh_out_of_range_invalid",
        "temperature_implausible_invalid",
        "humidity_stuck_extreme",
        "soil_moisture_stuck_extreme",
        "celsius_looking_fahrenheit",
        "impossible_temp_rh_combo",
      ]);
      for (const c of res.missing_metric_codes) {
        expect(forbidden.has(c)).toBe(false);
      }
    }
  });

  it("determinism: same input -> same codes, stable sorted order", () => {
    const payload = {
      MAC,
      dateutc: "2026-06-04 12:20:00",
      // Channel 1 mapped air + soil: missing temp + soil
      humidity1: 55,
      // Channel 2 mapped air: missing humidity
      temp2f: 72,
    };
    const a = normalize(payload).missing_metric_codes;
    const b = normalize(payload).missing_metric_codes;
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort());
    expect(new Set(a).size).toBe(a.length);
    expect(new Set(a)).toEqual(
      new Set([
        "air_temperature_absent",
        "air_humidity_absent",
        "soil_moisture_absent",
      ]),
    );
  });

  it("result is ID-free (no MAC or UUID in missing_metric_codes)", () => {
    for (const id of Object.keys(fixtures.payloads)) {
      const res = normalize(
        (fixtures.payloads as Record<string, Record<string, unknown>>)[id],
      );
      const blob = JSON.stringify(res.missing_metric_codes);
      expect(blob).not.toMatch(MAC_RE);
      expect(blob).not.toMatch(UUID_RE);
    }
  });

  it("vocabulary export is exactly the three documented codes", () => {
    expect(new Set(ECOWITT_MISSING_METRIC_CODES)).toEqual(
      new Set([
        "air_temperature_absent",
        "air_humidity_absent",
        "soil_moisture_absent",
      ]),
    );
  });
});

describe("REGRESSION — existing result fields unchanged for all 8 canary fixtures", () => {
  const ORDER = [
    "happy_multi_channel",
    "stale_only",
    "invalid_humidity",
    "stuck_soil_extreme",
    "unmapped_channel",
    "missing_metrics",
    "pressure_present",
    "celsius_looking_fahrenheit",
  ] as const;

  // Snapshot of existing summary fields (pre-slice values) — must not change.
  const EXPECTED: Record<
    string,
    {
      mapped: number;
      unmapped: number;
      invalid: number;
      stale: number;
      live: number;
      missing_metric: boolean;
      pressure_unmapped: boolean;
      ec_metric_invented: boolean;
    }
  > = {
    happy_multi_channel: { mapped: 5, unmapped: 0, invalid: 0, stale: 0, live: 5, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    stale_only: { mapped: 2, unmapped: 0, invalid: 0, stale: 2, live: 0, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    invalid_humidity: { mapped: 2, unmapped: 0, invalid: 2, stale: 0, live: 0, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    stuck_soil_extreme: { mapped: 1, unmapped: 0, invalid: 1, stale: 0, live: 0, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    unmapped_channel: { mapped: 0, unmapped: 2, invalid: 0, stale: 0, live: 0, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    missing_metrics: { mapped: 0, unmapped: 0, invalid: 0, stale: 0, live: 0, missing_metric: true, pressure_unmapped: false, ec_metric_invented: false },
    pressure_present: { mapped: 2, unmapped: 1, invalid: 0, stale: 0, live: 2, missing_metric: false, pressure_unmapped: true, ec_metric_invented: false },
    celsius_looking_fahrenheit: { mapped: 2, unmapped: 0, invalid: 2, stale: 0, live: 0, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
  };

  const verdict = runEcowittCloudCanary(
    ORDER.map((id) => ({
      id,
      payload: (fixtures.payloads as Record<string, unknown>)[id],
    })),
    fixtures.mapping as unknown as Parameters<typeof runEcowittCloudCanary>[1],
    opts,
  );

  it.each(ORDER)("%s — existing summary fields unchanged", (id) => {
    const s = verdict.summaries.find((x) => x.fixture_id === id)!;
    const exp = EXPECTED[id];
    expect({
      mapped: s.mapped_count,
      unmapped: s.unmapped_count,
      invalid: s.invalid_count,
      stale: s.stale_count,
      live: s.live_count,
      missing_metric: s.missing_metric,
      pressure_unmapped: s.pressure_unmapped,
      ec_metric_invented: s.ec_metric_invented,
    }).toEqual(exp);
  });
});
