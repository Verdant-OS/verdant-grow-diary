/**
 * Asserts EcowittCloudCanarySummary.missing_metric_codes for the closed
 * vocabulary defined in src/constants/ecowittMissingMetricCodes.ts.
 *
 * Fixtures cover:
 *  - clean (happy_multi_channel)        -> []
 *  - missing humidity only              -> ["air_humidity_missing"]
 *  - missing temperature only           -> ["air_temperature_missing"]
 *  - missing soil only                  -> ["soil_moisture_missing"]
 *  - captured_at gap                    -> includes "captured_at_missing"
 *
 * Codes must be deduped, sorted, and contain no MAC / UUID / tent_id.
 */
import { describe, it, expect } from "vitest";
import { runEcowittCloudCanary } from "@/lib/ecowittCloudCanaryVerdict";
import {
  ECOWITT_MISSING_METRIC_CODES,
  isEcowittMissingMetricCode,
} from "@/constants/ecowittMissingMetricCodes";
import fixtures from "../../fixtures/ecowitt-cloud-canary-payloads.json";

const ID_PATTERNS = [
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i, // UUID
  /\b[0-9A-F]{2}(?::[0-9A-F]{2}){5}\b/i, // MAC
];

const mapping = fixtures.mapping as unknown as Parameters<
  typeof runEcowittCloudCanary
>[1];
const options = { now: new Date(fixtures.now) };

function summarize(id: string) {
  const payload = (fixtures.payloads as Record<string, unknown>)[id];
  expect(payload, `fixture ${id} present`).toBeDefined();
  const verdict = runEcowittCloudCanary([{ id, payload }], mapping, options);
  return verdict.summaries[0];
}

describe("EcowittCloudCanarySummary.missing_metric_codes", () => {
  it("clean fixture has empty missing_metric_codes", () => {
    const s = summarize("happy_multi_channel");
    expect(s.missing_metric_codes).toEqual([]);
  });

  it("missing humidity emits air_humidity_missing", () => {
    const s = summarize("missing_humidity_only");
    expect(s.missing_metric_codes).toEqual(["air_humidity_missing"]);
  });

  it("missing temperature emits air_temperature_missing", () => {
    const s = summarize("missing_temperature_only");
    expect(s.missing_metric_codes).toEqual(["air_temperature_missing"]);
  });

  it("missing soil on a mapped soil channel emits soil_moisture_missing", () => {
    const s = summarize("missing_soil_only");
    expect(s.missing_metric_codes).toEqual(["soil_moisture_missing"]);
  });

  it("captured_at gap emits captured_at_missing", () => {
    const s = summarize("captured_at_missing");
    expect(s.missing_metric_codes).toContain("captured_at_missing");
  });

  it("codes are deduped, sorted, and from the closed vocabulary only", () => {
    for (const id of Object.keys(fixtures.payloads)) {
      const s = summarize(id);
      const sorted = [...s.missing_metric_codes].sort();
      expect(s.missing_metric_codes).toEqual(sorted);
      expect(new Set(s.missing_metric_codes).size).toBe(
        s.missing_metric_codes.length,
      );
      for (const c of s.missing_metric_codes) {
        expect(isEcowittMissingMetricCode(c)).toBe(true);
      }
    }
  });

  it("missing_metric_codes serialization is ID-free", () => {
    for (const id of Object.keys(fixtures.payloads)) {
      const s = summarize(id);
      const blob = JSON.stringify(s.missing_metric_codes);
      for (const re of ID_PATTERNS) {
        expect(blob, `fixture ${id}`).not.toMatch(re);
      }
    }
  });

  it("closed vocabulary set is exhaustive for these fixtures", () => {
    expect(new Set(ECOWITT_MISSING_METRIC_CODES)).toEqual(
      new Set([
        "captured_at_missing",
        "air_temperature_missing",
        "air_humidity_missing",
        "soil_moisture_missing",
      ]),
    );
  });
});
