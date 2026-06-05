/**
 * Slice B-pre: missing_metric_codes surfaced on EcowittCloudCanarySummary.
 *
 * Tests target the SUMMARY-level field only. Detection logic is out of scope
 * (validated in ecowitt-cloud-canary-missing-metric-codes.test.ts).
 */
import { describe, it, expect } from "vitest";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import {
  ECOWITT_MISSING_METRIC_CODES,
  isEcowittMissingMetricCode,
} from "@/constants/ecowittMissingMetricCodes";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

const MAC_RE = /\b[0-9A-F]{2}(?::[0-9A-F]{2}){5}\b/i;
const UUID_RE =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

const mapping = fixtures.mapping as unknown as Parameters<
  typeof runEcowittCloudCanary
>[1];
const opts = { now: new Date(fixtures.now) };

function run(id: string) {
  const verdict = runEcowittCloudCanary(
    [{ id, payload: (fixtures.payloads as Record<string, unknown>)[id] }],
    mapping,
    opts,
  );
  return verdict.summaries[0];
}

describe("EcowittCloudCanarySummary.missing_metric_codes (Slice B-pre)", () => {
  it("air_humidity_absent fixture -> code present on summary", () => {
    const s = run("missing_humidity_only");
    expect(s.missing_metric_codes).toContain("air_humidity_absent");
    expect(s.missing_metric_codes).not.toContain("air_temperature_absent");
    expect(s.missing_metric_codes).not.toContain("soil_moisture_absent");
  });

  it("air_temperature_absent fixture -> code present on summary", () => {
    const s = run("missing_temperature_only");
    expect(s.missing_metric_codes).toContain("air_temperature_absent");
    expect(s.missing_metric_codes).not.toContain("air_humidity_absent");
    expect(s.missing_metric_codes).not.toContain("soil_moisture_absent");
  });

  it("soil_moisture_absent fixture -> code present on summary", () => {
    const s = run("missing_soil_only");
    expect(s.missing_metric_codes).toEqual(["soil_moisture_absent"]);
  });

  it("fully-populated fixture -> empty array", () => {
    const s = run("happy_multi_channel");
    expect(s.missing_metric_codes).toEqual([]);
  });

  it("captured_at_missing fixture -> EMPTY missing_metric_codes (timestamp gap is NOT a missing metric)", () => {
    const s = run("captured_at_missing");
    expect(s.missing_metric_codes).toEqual([]);
  });

  it("only closed-set codes appear across all fixtures", () => {
    for (const id of Object.keys(fixtures.payloads)) {
      const s = run(id);
      for (const c of s.missing_metric_codes) {
        expect(isEcowittMissingMetricCode(c)).toBe(true);
      }
    }
  });

  it("summary missing_metric_codes is ID-free (no MAC/UUID)", () => {
    for (const id of Object.keys(fixtures.payloads)) {
      const s = run(id);
      const blob = JSON.stringify(s.missing_metric_codes);
      expect(blob).not.toMatch(MAC_RE);
      expect(blob).not.toMatch(UUID_RE);
    }
  });

  it("determinism: same input -> same codes, stable sorted order", () => {
    const a = run("missing_humidity_only").missing_metric_codes;
    const b = run("missing_humidity_only").missing_metric_codes;
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort());
    expect(new Set(a).size).toBe(a.length);
  });
});

describe("REGRESSION — all 12 fixtures: existing summary fields unchanged", () => {
  const ORDER = [
    "happy_multi_channel",
    "stale_only",
    "invalid_humidity",
    "stuck_soil_extreme",
    "unmapped_channel",
    "missing_metrics",
    "pressure_present",
    "celsius_looking_fahrenheit",
    "captured_at_missing",
    "missing_humidity_only",
    "missing_temperature_only",
    "missing_soil_only",
  ] as const;

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
    stuck_soil_extreme: { mapped: 1, unmapped: 0, invalid: 0, stale: 0, live: 1, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    unmapped_channel: { mapped: 0, unmapped: 2, invalid: 0, stale: 0, live: 0, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    missing_metrics: { mapped: 0, unmapped: 0, invalid: 0, stale: 0, live: 0, missing_metric: true, pressure_unmapped: false, ec_metric_invented: false },
    pressure_present: { mapped: 2, unmapped: 1, invalid: 0, stale: 0, live: 2, missing_metric: false, pressure_unmapped: true, ec_metric_invented: false },
    celsius_looking_fahrenheit: { mapped: 2, unmapped: 0, invalid: 0, stale: 0, live: 2, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    captured_at_missing: { mapped: 3, unmapped: 0, invalid: 3, stale: 0, live: 0, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    missing_humidity_only: { mapped: 2, unmapped: 0, invalid: 0, stale: 0, live: 2, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    missing_temperature_only: { mapped: 2, unmapped: 0, invalid: 0, stale: 0, live: 2, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
    missing_soil_only: { mapped: 2, unmapped: 0, invalid: 0, stale: 0, live: 2, missing_metric: false, pressure_unmapped: false, ec_metric_invented: false },
  };

  const verdict = runEcowittCloudCanary(
    ORDER.map((id) => ({
      id,
      payload: (fixtures.payloads as Record<string, unknown>)[id],
    })),
    mapping,
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
