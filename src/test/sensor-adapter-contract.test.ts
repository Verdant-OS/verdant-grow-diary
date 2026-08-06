import { describe, expect, it } from "vitest";

import {
  SENSOR_ADAPTER_CONTRACT_VERSION,
  SENSOR_ADAPTER_REDACTED_PAYLOAD_REF,
  buildSensorAdapterReadingId,
  canonicalUnitForSensorAdapterMetric,
  classifySensorAdapterFreshness,
  isValidSensorAdapterFreshnessPolicy,
  sortSensorAdapterReadings,
  type SensorAdapterFreshnessPolicy,
  type SensorAdapterReading,
} from "@/lib/sensorAdapterContract";
import { normalizeWebhookIngestPayload as normalizeSrcWebhookIngestPayload } from "@/lib/sensorWebhookIngestRules";
import { normalizeWebhookIngestPayload as normalizeEdgeWebhookIngestPayload } from "../../supabase/functions/sensor-ingest-webhook/webhookIngest";

const TENT_ID = "10000000-0000-4000-8000-000000000001";
const PLANT_ID = "20000000-0000-4000-8000-000000000001";
const NOW_MS = Date.parse("2026-07-31T12:05:00.000Z");

const FRESHNESS_POLICY: SensorAdapterFreshnessPolicy = {
  expected_interval_ms: 60_000,
  stale_threshold_ms: 300_000,
  future_clock_skew_ms: 30_000,
};

function reading(overrides: Partial<SensorAdapterReading> = {}): SensorAdapterReading {
  return {
    source: "live",
    provider: "synthetic-provider",
    transport: "mqtt",
    adapter_id: "synthetic-adapter",
    adapter_version: "1.0.0",
    origin_source: "synthetic-source",
    trust_level: "local_transport",
    captured_at: "2026-07-31T12:04:30.000Z",
    received_at: "2026-07-31T12:05:00.000Z",
    tent_id: TENT_ID,
    plant_id: PLANT_ID,
    metric: "temperature_c",
    normalized_value: 25,
    normalized_unit: "°C",
    validity: "valid",
    confidence: 0.95,
    warnings: [],
    raw_payload_ref: SENSOR_ADAPTER_REDACTED_PAYLOAD_REF,
    channel_ref: "canopy-east",
    device_ref: "probe-east",
    raw_field: "temp1f",
    value_origin: "observed",
    comparison_role: "primary",
    reading_id: "synthetic-reading-id",
    ingest_boundary_status: "ready",
    ...overrides,
  };
}

describe("sensorAdapterContract — canonical shape", () => {
  it("pins the version, redacted payload reference, and every required reading field", () => {
    const value: SensorAdapterReading = reading();

    expect(SENSOR_ADAPTER_CONTRACT_VERSION).toBe(1);
    expect(SENSOR_ADAPTER_REDACTED_PAYLOAD_REF).toBe("adapter_result.redacted_payload");
    expect(Object.keys(value).sort()).toEqual([
      "adapter_id",
      "adapter_version",
      "captured_at",
      "channel_ref",
      "comparison_role",
      "confidence",
      "device_ref",
      "ingest_boundary_status",
      "metric",
      "normalized_unit",
      "normalized_value",
      "origin_source",
      "plant_id",
      "provider",
      "raw_field",
      "raw_payload_ref",
      "reading_id",
      "received_at",
      "source",
      "tent_id",
      "transport",
      "trust_level",
      "validity",
      "value_origin",
      "warnings",
    ]);
  });

  it("maps every supported metric to one canonical normalized unit", () => {
    expect(canonicalUnitForSensorAdapterMetric("temperature_c")).toBe("°C");
    expect(canonicalUnitForSensorAdapterMetric("humidity_pct")).toBe("%");
    expect(canonicalUnitForSensorAdapterMetric("soil_moisture_pct")).toBe("%");
    expect(canonicalUnitForSensorAdapterMetric("soil_temp_c")).toBe("°C");
    expect(canonicalUnitForSensorAdapterMetric("vpd_kpa")).toBe("kPa");
    expect(canonicalUnitForSensorAdapterMetric("co2_ppm")).toBe("ppm");
    expect(canonicalUnitForSensorAdapterMetric("ec")).toBe("mS/cm");
  });
});

describe("sensorAdapterContract — DB-supported soil temperature handoff", () => {
  const routes = [
    {
      name: "src webhook normalizer",
      run: (metrics: Record<string, unknown>) =>
        normalizeSrcWebhookIngestPayload(
          {
            tent_id: TENT_ID,
            source: "mqtt",
            captured_at: "2026-07-31T12:04:30.000Z",
            metrics,
          },
          { now: new Date("2026-07-31T12:05:00.000Z") },
        ),
    },
    {
      name: "edge webhook normalizer",
      run: (metrics: Record<string, unknown>) =>
        normalizeEdgeWebhookIngestPayload(
          {
            tent_id: TENT_ID,
            source: "mqtt",
            captured_at: "2026-07-31T12:04:30.000Z",
            metrics,
          },
          { now: new Date("2026-07-31T12:05:00.000Z") },
        ),
    },
  ] as const;

  describe.each(routes)("$name", ({ run }) => {
    it.each([
      ["soil_temp_f", 68, 20],
      ["soil_temp_c", 21, 21],
    ] as const)("normalizes %s to canonical soil_temp_c", (alias, raw, expectedC) => {
      const result = run({ [alias]: raw });

      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].metric).toBe("soil_temp_c");
      expect(Number(result.rows[0].value)).toBeCloseTo(expectedC, 6);
    });
  });
});

describe("sensorAdapterContract — injected freshness policy", () => {
  it("accepts a finite policy whose stale threshold covers the expected interval", () => {
    expect(isValidSensorAdapterFreshnessPolicy(FRESHNESS_POLICY)).toBe(true);
    expect(
      isValidSensorAdapterFreshnessPolicy({
        ...FRESHNESS_POLICY,
        stale_threshold_ms: FRESHNESS_POLICY.expected_interval_ms,
      }),
    ).toBe(true);
  });

  it.each([
    ["zero expected interval", { ...FRESHNESS_POLICY, expected_interval_ms: 0 }],
    [
      "stale threshold below expected interval",
      { ...FRESHNESS_POLICY, stale_threshold_ms: 59_999 },
    ],
    ["negative future skew", { ...FRESHNESS_POLICY, future_clock_skew_ms: -1 }],
    ["non-finite threshold", { ...FRESHNESS_POLICY, stale_threshold_ms: Number.NaN }],
  ])("rejects %s", (_label, policy) => {
    expect(isValidSensorAdapterFreshnessPolicy(policy)).toBe(false);
    expect(
      classifySensorAdapterFreshness({
        captured_at: "2026-07-31T12:04:30.000Z",
        now_ms: NOW_MS,
        policy,
      }),
    ).toEqual({ source: "invalid", warnings: ["invalid_freshness_policy"] });
  });

  it("keeps exact boundaries fresh, marks late readings, then becomes stale at +1 ms", () => {
    const classifyAge = (ageMs: number) =>
      classifySensorAdapterFreshness({
        captured_at: new Date(NOW_MS - ageMs).toISOString(),
        now_ms: NOW_MS,
        policy: FRESHNESS_POLICY,
      });

    expect(classifyAge(60_000)).toEqual({ source: "live", warnings: [] });
    expect(classifyAge(60_001)).toEqual({
      source: "live",
      warnings: ["reading_late"],
    });
    expect(classifyAge(300_000)).toEqual({
      source: "live",
      warnings: ["reading_late"],
    });
    expect(classifyAge(300_001)).toEqual({
      source: "stale",
      warnings: ["stale_reading"],
    });
  });

  it("allows exact future skew but rejects one millisecond beyond it", () => {
    const classifyFuture = (futureMs: number) =>
      classifySensorAdapterFreshness({
        captured_at: new Date(NOW_MS + futureMs).toISOString(),
        now_ms: NOW_MS,
        policy: FRESHNESS_POLICY,
      });

    expect(classifyFuture(30_000)).toEqual({ source: "live", warnings: [] });
    expect(classifyFuture(30_001)).toEqual({
      source: "invalid",
      warnings: ["future_timestamp"],
    });
  });

  it("fails closed for missing, malformed, and non-finite clock inputs", () => {
    expect(
      classifySensorAdapterFreshness({
        captured_at: null,
        now_ms: NOW_MS,
        policy: FRESHNESS_POLICY,
      }),
    ).toEqual({ source: "invalid", warnings: ["missing_timestamp"] });
    expect(
      classifySensorAdapterFreshness({
        captured_at: "not-a-timestamp",
        now_ms: NOW_MS,
        policy: FRESHNESS_POLICY,
      }),
    ).toEqual({ source: "invalid", warnings: ["malformed_timestamp"] });
    expect(
      classifySensorAdapterFreshness({
        captured_at: "2026-07-31T12:04:30.000Z",
        now_ms: Number.NaN,
        policy: FRESHNESS_POLICY,
      }),
    ).toEqual({ source: "invalid", warnings: ["invalid_freshness_policy"] });
  });
});

describe("sensorAdapterContract — deterministic identity and ordering", () => {
  const ID_INPUT = {
    adapter_id: "synthetic-adapter",
    adapter_version: "1.0.0",
    metric: "soil_moisture_pct" as const,
    channel_ref: "root-zone-a",
    device_ref: "probe-a",
    captured_at: "2026-07-31T12:04:30.000Z",
    tent_id: TENT_ID,
    raw_field: "soilmoisture1",
    value_origin: "observed" as const,
  };

  it("builds a stable reading id and changes it for every persistence-relevant dimension", () => {
    const base = buildSensorAdapterReadingId(ID_INPUT);
    expect(buildSensorAdapterReadingId({ ...ID_INPUT })).toBe(base);

    const variants: Array<Parameters<typeof buildSensorAdapterReadingId>[0]> = [
      { ...ID_INPUT, adapter_id: "other-adapter" },
      { ...ID_INPUT, adapter_version: "1.0.1" },
      { ...ID_INPUT, metric: "humidity_pct" },
      { ...ID_INPUT, channel_ref: "root-zone-b" },
      { ...ID_INPUT, device_ref: "probe-b" },
      { ...ID_INPUT, captured_at: "2026-07-31T12:04:31.000Z" },
      { ...ID_INPUT, tent_id: "10000000-0000-4000-8000-000000000002" },
      { ...ID_INPUT, raw_field: "soilmoisture2" },
      { ...ID_INPUT, value_origin: "derived" },
    ];
    expect(new Set([base, ...variants.map(buildSensorAdapterReadingId)]).size).toBe(
      variants.length + 1,
    );
  });

  it("escapes delimiter-bearing identity segments instead of creating ambiguous ids", () => {
    const id = buildSensorAdapterReadingId({
      ...ID_INPUT,
      channel_ref: "root|zone/east",
      device_ref: "probe|east",
    });
    expect(id).toContain("root%7Czone%2Feast");
    expect(id).toContain("probe%7Ceast");
  });

  it("sorts metric, channel, device, timestamp, and id without mutating input", () => {
    const values = [
      reading({ metric: "vpd_kpa", normalized_unit: "kPa", reading_id: "z" }),
      reading({ channel_ref: "canopy-west", reading_id: "b" }),
      reading({ channel_ref: "canopy-east", device_ref: "probe-z", reading_id: "c" }),
      reading({ channel_ref: "canopy-east", device_ref: "probe-a", reading_id: "a" }),
    ];
    const originalRefs = [...values];

    const sorted = sortSensorAdapterReadings(values);

    expect(values).toEqual(originalRefs);
    expect(sorted.map((value) => value.reading_id)).toEqual(["a", "c", "b", "z"]);
  });

  it("preserves input order when all documented sort fields tie", () => {
    const first = reading({ confidence: 0.95 });
    const second = reading({ confidence: 0.75 });
    const sorted = sortSensorAdapterReadings([first, second]);

    expect(sorted[0]).toBe(first);
    expect(sorted[1]).toBe(second);
  });
});
