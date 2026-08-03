import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ECOWITT_MQTT_SENSOR_ADAPTER_ID,
  ECOWITT_MQTT_SENSOR_ADAPTER_VERSION,
  ECOWITT_MQTT_SENSOR_PROVIDER,
  ECOWITT_MQTT_SENSOR_TRANSPORT,
  adaptEcowittMqttSensorPayload,
  isEcowittMqttSensorAdapterMetricField,
  normalizedUnitForEcowittMqttMetric,
  type EcowittMqttChannelAssignment,
  type EcowittMqttSensorAdapterInput,
} from "@/lib/ecowittMqttSensorAdapter";
import {
  SENSOR_ADAPTER_REDACTED_PAYLOAD_REF,
  type SensorAdapterFreshnessPolicy,
  type SensorAdapterReading,
  type SensorAdapterResult,
} from "@/lib/sensorAdapterContract";
import { calculateAirVpdKpa } from "@/lib/vpdRules";

interface SyntheticFixture {
  fixture_schema_version: number;
  fixture_kind: string;
  proof_status: string;
  comment: string;
  payload: Record<string, unknown>;
  channel_assignments: EcowittMqttChannelAssignment[];
}

const FIXTURE = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/ecowitt-mqtt/synthetic-multi-probe-redacted.json"),
    "utf8",
  ),
) as SyntheticFixture;

const TENT_ID = "10000000-0000-4000-8000-000000000001";
const PLANT_A_ID = "20000000-0000-4000-8000-000000000001";
const NOW_MS = Date.parse("2026-07-31T12:05:00.000Z");
const RECEIVED_AT = "2026-07-31T12:05:00.000Z";
const CAPTURED_AT = "2026-07-31T12:04:30.000Z";
const SENSITIVE_FORMAT_CASES = [
  ["unseparated MAC", "020000000001"],
  ["dotted MAC", "0200.0000.0001"],
  ["ULA IPv6 fc00", "fc00::1"],
  ["ULA IPv6 fd00", "fd12:3456::1"],
  ["link-local IPv6", "fe80::1"],
  ["IPv6 loopback", "::1"],
  ["expanded IPv6 loopback", "0:0:0:0:0:0:0:1"],
  ["partially compressed IPv6 loopback", "0:0:0:0:0:0::1"],
  ["IPv4 loopback", "127.0.0.1"],
  ["IPv4 link-local", "169.254.10.20"],
  ["IPv4 shared address space", "100.64.1.2"],
  ["private IPv4 after dotted label", "sensor.192.168.1.1"],
  ["OpenAI live prefix", "sk_live_SYNTHETIC_NOT_REAL"],
  ["OpenAI test prefix", "sk_test_SYNTHETIC_NOT_REAL"],
  ["OpenAI project prefix", "sk_proj_SYNTHETIC_NOT_REAL"],
  ["OpenAI hyphenated project prefix", "sk-proj-SYNTHETIC-NOT-REAL"],
  ["GitHub classic prefix", "ghp_SYNTHETIC_NOT_REAL"],
  ["GitHub OAuth prefix", "gho_SYNTHETIC_NOT_REAL"],
  ["GitHub user token prefix", "ghu_SYNTHETIC_NOT_REAL"],
  ["GitHub server token prefix", "ghs_SYNTHETIC_NOT_REAL"],
  ["GitHub refresh token prefix", "ghr_SYNTHETIC_NOT_REAL"],
  ["GitHub fine-grained prefix", "github_pat_SYNTHETIC_NOT_REAL"],
  ["Slack prefix", "xoxb-SYNTHETIC-NOT-REAL"],
  ["AWS access-key prefix", "AKIASYNTHETICNOTREAL"],
  ["Google API-key prefix", "AIzaSYNTHETIC_NOT_REAL"],
] as const;

const FRESHNESS_POLICY: SensorAdapterFreshnessPolicy = {
  expected_interval_ms: 60_000,
  stale_threshold_ms: 300_000,
  future_clock_skew_ms: 30_000,
};

function assignment(
  rawField: string,
  overrides: Partial<EcowittMqttChannelAssignment> = {},
): EcowittMqttChannelAssignment {
  return {
    raw_field: rawField,
    tent_id: TENT_ID,
    channel_ref: rawField,
    ...overrides,
  };
}

function adapt(overrides: Partial<EcowittMqttSensorAdapterInput> = {}): SensorAdapterResult {
  return adaptEcowittMqttSensorPayload({
    payload: FIXTURE.payload,
    channel_assignments: FIXTURE.channel_assignments,
    freshness_policy: FRESHNESS_POLICY,
    received_at: RECEIVED_AT,
    now_ms: NOW_MS,
    ...overrides,
  });
}

function requireReading(
  result: SensorAdapterResult,
  predicate: (reading: SensorAdapterReading) => boolean,
): SensorAdapterReading {
  const found = result.readings.find(predicate);
  expect(found).toBeDefined();
  return found as SensorAdapterReading;
}

describe("adaptEcowittMqttSensorPayload — synthetic multi-probe normalization", () => {
  it("normalizes Fahrenheit and Celsius air channels without averaging probes", () => {
    const result = adapt();
    const temperatures = result.readings.filter((reading) => reading.metric === "temperature_c");

    // This fixture deliberately emits simultaneous channels for every ready
    // metric. They remain visible as valid evidence, but every ingest-ready
    // metric collides at the current persistence boundary.
    expect(result.ok).toBe(false);
    expect(
      result.readings.some(
        (reading) => reading.validity === "valid" && reading.ingest_boundary_status === "ready",
      ),
    ).toBe(false);
    expect(temperatures).toHaveLength(2);
    expect(
      requireReading(result, (reading) => reading.channel_ref === "canopy-east-temperature")
        .normalized_value,
    ).toBe(25);
    expect(
      requireReading(result, (reading) => reading.channel_ref === "canopy-west-temperature")
        .normalized_value,
    ).toBe(24);
    expect(temperatures.map((reading) => reading.normalized_unit)).toEqual(["°C", "°C"]);
  });

  it("keeps soil moisture and EC probes separate with plant/channel identity", () => {
    const result = adapt();
    const moisture = result.readings.filter((reading) => reading.metric === "soil_moisture_pct");
    const ec = result.readings.filter((reading) => reading.metric === "ec");

    expect(moisture).toHaveLength(2);
    expect(
      moisture.map((reading) => [reading.channel_ref, reading.plant_id, reading.normalized_value]),
    ).toEqual([
      ["root-zone-a-moisture", PLANT_A_ID, 33],
      ["root-zone-b-moisture", "20000000-0000-4000-8000-000000000002", 47],
    ]);
    expect(ec).toHaveLength(2);
    expect(ec.map((reading) => [reading.channel_ref, reading.normalized_value])).toEqual([
      ["root-zone-a-ec", 1.25],
      ["root-zone-b-ec", 1.8],
    ]);
    expect(ec.every((reading) => reading.normalized_unit === "mS/cm")).toBe(true);
    expect(result.readings.some((reading) => /average/i.test(reading.channel_ref))).toBe(false);
  });

  it("keeps an isolated valid soil reading ready for ingest", () => {
    const result = adapt({
      payload: { captured_at: CAPTURED_AT, soilmoisture1: 42 },
      channel_assignments: [
        assignment("soilmoisture1", {
          plant_id: PLANT_A_ID,
          channel_ref: "root-zone-a-moisture",
        }),
      ],
    });
    const soil = requireReading(result, () => true);

    expect(result.ok).toBe(true);
    expect(soil).toMatchObject({
      source: "live",
      metric: "soil_moisture_pct",
      normalized_value: 42,
      normalized_unit: "%",
      validity: "valid",
      trust_level: "local_transport",
      ingest_boundary_status: "ready",
    });
  });

  it("normalizes Fahrenheit and Celsius soil probes separately with collision honesty", () => {
    const result = adapt();
    const soilTemperatures = result.readings.filter((reading) => reading.metric === "soil_temp_c");

    expect(soilTemperatures).toHaveLength(2);
    expect(
      soilTemperatures.map((reading) => [
        reading.channel_ref,
        reading.plant_id,
        reading.normalized_value,
        reading.normalized_unit,
      ]),
    ).toEqual([
      ["root-zone-a-temperature", PLANT_A_ID, 20, "°C"],
      ["root-zone-b-temperature", "20000000-0000-4000-8000-000000000002", 21, "°C"],
    ]);
    expect(soilTemperatures.some((reading) => /average/i.test(reading.channel_ref))).toBe(false);
    for (const reading of soilTemperatures) {
      expect(reading.validity).toBe("valid");
      expect(reading.ingest_boundary_status).toBe("blocked_channel_collision");
      expect(reading.warnings).toContain("ingest_boundary_channel_collision");
    }
  });

  it("rejects soil-temperature assignment units that conflict with the raw field", () => {
    const result = adapt({
      payload: { captured_at: CAPTURED_AT, soiltemp1f: 68 },
      channel_assignments: [
        assignment("soiltemp1f", {
          plant_id: PLANT_A_ID,
          reported_unit: "°C",
        }),
      ],
    });
    const soilTemperature = requireReading(result, () => true);

    expect(result.ok).toBe(false);
    expect(soilTemperature.metric).toBe("soil_temp_c");
    expect(soilTemperature.validity).toBe("invalid");
    expect(soilTemperature.normalized_value).toBeNull();
    expect(soilTemperature.normalized_unit).toBe("°C");
    expect(soilTemperature.warnings).toContain("unit_mismatch");
  });

  it("derives per-pair VPD only through the central VPD helper", () => {
    const result = adapt();
    const east = requireReading(
      result,
      (reading) =>
        reading.metric === "vpd_kpa" &&
        reading.channel_ref === "vpd:canopy-east" &&
        reading.value_origin === "derived",
    );
    const west = requireReading(
      result,
      (reading) =>
        reading.metric === "vpd_kpa" &&
        reading.channel_ref === "vpd:canopy-west" &&
        reading.value_origin === "derived",
    );

    expect(east.normalized_value).toBe(calculateAirVpdKpa({ tempC: 25, rhPercent: 60 }));
    expect(west.normalized_value).toBe(calculateAirVpdKpa({ tempC: 24, rhPercent: 50 }));
    expect(east.origin_source).toBe("verdant_derived");
    expect(east.comparison_role).toBe("primary");
  });

  it("does not derive VPD when either paired input is invalid", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        temp1f: 77,
        humidity1: 101,
      },
      channel_assignments: [
        assignment("temp1f", { pairing_ref: "canopy" }),
        assignment("humidity1", { pairing_ref: "canopy" }),
      ],
    });

    expect(result.readings.filter((reading) => reading.value_origin === "derived")).toHaveLength(0);
    const humidity = requireReading(result, (reading) => reading.metric === "humidity_pct");
    expect(humidity.validity).toBe("invalid");
    expect(humidity.normalized_value).toBeNull();
    expect(humidity.warnings).toContain("humidity_out_of_range");
  });

  it("does not derive VPD when temperature is invalid even with valid RH", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        temp1c: 200,
        humidity1: 60,
      },
      channel_assignments: [
        assignment("temp1c", { pairing_ref: "canopy" }),
        assignment("humidity1", { pairing_ref: "canopy" }),
      ],
    });

    expect(result.readings.filter((reading) => reading.value_origin === "derived")).toHaveLength(0);
    const temperature = requireReading(result, (reading) => reading.metric === "temperature_c");
    expect(temperature.validity).toBe("invalid");
    expect(temperature.normalized_value).toBeNull();
    expect(temperature.warnings).toContain("temperature_out_of_range");
  });

  it("keeps stale derived VPD valid but blocked from ingest readiness", () => {
    const result = adapt({
      payload: {
        captured_at: new Date(NOW_MS - FRESHNESS_POLICY.stale_threshold_ms - 1).toISOString(),
        temp1c: 25,
        humidity1: 60,
      },
      channel_assignments: [
        assignment("temp1c", { pairing_ref: "canopy" }),
        assignment("humidity1", { pairing_ref: "canopy" }),
      ],
    });
    const derived = requireReading(result, (reading) => reading.value_origin === "derived");

    expect(result.ok).toBe(false);
    expect(derived).toMatchObject({
      source: "stale",
      validity: "valid",
      normalized_value: calculateAirVpdKpa({ tempC: 25, rhPercent: 60 }),
      confidence: 0.5,
      ingest_boundary_status: "blocked_stale",
    });
    expect(derived.warnings).toContain("stale_reading");
  });

  it("rejects out-of-range RH and soil moisture instead of preserving bad values", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        humidity1: -1,
        soilmoisture1: 101,
      },
      channel_assignments: [assignment("humidity1"), assignment("soilmoisture1")],
    });

    expect(result.ok).toBe(false);
    expect(result.readings).toHaveLength(2);
    expect(result.readings.every((reading) => reading.source === "invalid")).toBe(true);
    expect(
      result.readings.every(
        (reading) => reading.validity === "invalid" && reading.normalized_value === null,
      ),
    ).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining(["humidity_out_of_range", "soil_moisture_out_of_range"]),
    );
  });

  it("represents explicit missing values as invalid null, never zero", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        humidity1: null,
        soilmoisture1: "",
      },
      channel_assignments: [assignment("humidity1"), assignment("soilmoisture1")],
    });

    expect(result.ok).toBe(false);
    expect(result.readings).toHaveLength(2);
    for (const value of result.readings) {
      expect(value.validity).toBe("invalid");
      expect(value.normalized_value).toBeNull();
      expect(value.normalized_value).not.toBe(0);
      expect(value.warnings).toContain("missing_value");
    }
  });

  it("flags stuck-at-extreme RH and soil readings without calling them healthy", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        humidity1: 100,
        soilmoisture1: 0,
      },
      channel_assignments: [assignment("humidity1"), assignment("soilmoisture1")],
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining(["humidity_stuck_extreme", "soil_moisture_stuck_extreme"]),
    );
    expect(result.readings.every((reading) => reading.trust_level === "degraded")).toBe(true);
  });

  it("rejects a declared temperature unit that conflicts with the raw field", () => {
    const result = adapt({
      payload: { captured_at: CAPTURED_AT, temp1f: 77 },
      channel_assignments: [assignment("temp1f", { reported_unit: "°C" })],
    });
    const temperature = requireReading(result, () => true);

    expect(result.ok).toBe(false);
    expect(temperature.validity).toBe("invalid");
    expect(temperature.normalized_value).toBeNull();
    expect(temperature.warnings).toContain("temperature_unit_mismatch");
  });

  it("rejects reverse EC units while preserving correct µS/cm conversion", () => {
    const mismatch = adapt({
      payload: { captured_at: CAPTURED_AT, soil_ec1_us_cm: 1.8 },
      channel_assignments: [
        assignment("soil_ec1_us_cm", {
          plant_id: PLANT_A_ID,
          reported_unit: "µS/cm",
        }),
      ],
    });
    const correct = adapt({
      payload: { captured_at: CAPTURED_AT, soil_ec1_us_cm: 1_800 },
      channel_assignments: [
        assignment("soil_ec1_us_cm", {
          plant_id: PLANT_A_ID,
          reported_unit: "µS/cm",
        }),
      ],
    });
    const mismatchReading = requireReading(mismatch, () => true);
    const correctReading = requireReading(correct, () => true);

    expect(mismatch.ok).toBe(false);
    expect(mismatchReading.validity).toBe("invalid");
    expect(mismatchReading.normalized_value).toBeNull();
    expect(mismatchReading.warnings).toContain("ec_unit_mismatch");
    expect(correct.ok).toBe(true);
    expect(correctReading.normalized_value).toBe(1.8);
    expect(correctReading.normalized_unit).toBe("mS/cm");
    expect(correctReading.ingest_boundary_status).toBe("ready");
  });
});

describe("adaptEcowittMqttSensorPayload — timestamp and freshness truth", () => {
  function oneTemperature(args: {
    capturedAt?: unknown;
    nowMs?: number;
    policy?: SensorAdapterFreshnessPolicy;
    receivedAt?: string;
  }): SensorAdapterResult {
    const payload: Record<string, unknown> = { temp1c: 24 };
    if (Object.hasOwn(args, "capturedAt")) {
      payload.captured_at = args.capturedAt;
    }
    return adapt({
      payload,
      channel_assignments: [assignment("temp1c")],
      now_ms: args.nowMs ?? NOW_MS,
      freshness_policy: args.policy ?? FRESHNESS_POLICY,
      received_at: args.receivedAt ?? RECEIVED_AT,
    });
  }

  it("classifies fresh and stale readings from injected time", () => {
    const fresh = oneTemperature({ capturedAt: CAPTURED_AT });
    const stale = oneTemperature({
      capturedAt: new Date(NOW_MS - 300_001).toISOString(),
    });

    const freshReading = requireReading(fresh, () => true);
    const staleReading = requireReading(stale, () => true);
    expect(freshReading.source).toBe("live");
    expect(stale.ok).toBe(false);
    expect(staleReading).toMatchObject({
      source: "stale",
      validity: "valid",
      normalized_value: 24,
      confidence: 0.5,
      ingest_boundary_status: "blocked_stale",
    });
    expect(staleReading.warnings).toContain("stale_reading");
  });

  it("fails closed for missing, malformed, and too-far-future captured timestamps", () => {
    const cases = [
      [oneTemperature({}), "missing_timestamp"],
      [oneTemperature({ capturedAt: "not-a-time" }), "malformed_timestamp"],
      [
        oneTemperature({
          capturedAt: new Date(NOW_MS + 30_001).toISOString(),
        }),
        "future_timestamp",
      ],
    ] as const;

    for (const [result, warning] of cases) {
      const value = requireReading(result, () => true);
      expect(result.ok).toBe(false);
      expect(value.source).toBe("invalid");
      expect(value.validity).toBe("invalid");
      expect(value.normalized_value).toBeNull();
      expect(value.confidence).toBe(0);
      expect(value.warnings).toContain(warning);
    }
  });

  it("uses the caller's freshness policy rather than a hard-coded threshold", () => {
    const capturedAt = new Date(NOW_MS - 90_000).toISOString();
    const lenient = oneTemperature({ capturedAt });
    const strict = oneTemperature({
      capturedAt,
      policy: {
        expected_interval_ms: 30_000,
        stale_threshold_ms: 80_000,
        future_clock_skew_ms: 30_000,
      },
    });

    expect(requireReading(lenient, () => true).source).toBe("live");
    expect(requireReading(lenient, () => true).warnings).toContain("reading_late");
    expect(requireReading(strict, () => true).source).toBe("stale");
  });

  it("fails closed when received_at is malformed", () => {
    const result = oneTemperature({
      capturedAt: CAPTURED_AT,
      receivedAt: "not-a-time",
    });
    const value = requireReading(result, () => true);

    expect(result.ok).toBe(false);
    expect(value.received_at).toBeNull();
    expect(value.source).toBe("invalid");
    expect(value.validity).toBe("invalid");
    expect(value.normalized_value).toBeNull();
    expect(value.warnings).toContain("malformed_received_at");
  });

  it("fails closed when received_at exceeds the injected future clock skew", () => {
    const boundaryReceivedAt = new Date(
      NOW_MS + FRESHNESS_POLICY.future_clock_skew_ms,
    ).toISOString();
    const futureReceivedAt = new Date(
      NOW_MS + FRESHNESS_POLICY.future_clock_skew_ms + 1,
    ).toISOString();
    const boundary = oneTemperature({
      capturedAt: CAPTURED_AT,
      receivedAt: boundaryReceivedAt,
    });
    const result = oneTemperature({
      capturedAt: CAPTURED_AT,
      receivedAt: futureReceivedAt,
    });
    const value = requireReading(result, () => true);

    expect(boundary.ok).toBe(true);
    expect(requireReading(boundary, () => true).received_at).toBe(boundaryReceivedAt);
    expect(result.ok).toBe(false);
    expect(result.warnings).toContain("future_received_at");
    expect(value).toMatchObject({
      received_at: futureReceivedAt,
      source: "invalid",
      validity: "invalid",
      normalized_value: null,
      trust_level: "untrusted",
      confidence: 0,
      ingest_boundary_status: "invalid",
    });
    expect(value.warnings).toContain("future_received_at");
  });

  it("returns no readings for a malformed non-object payload", () => {
    const result = adapt({ payload: null });

    expect(result).toMatchObject({
      ok: false,
      readings: [],
      warnings: ["malformed_payload"],
      ignored_field_count: 0,
    });
  });
});

describe("adaptEcowittMqttSensorPayload — metadata, mapping, and boundaries", () => {
  it("emits every required metadata field on an isolated valid reading", () => {
    const result = adapt({
      payload: { captured_at: CAPTURED_AT, temp1f: 77 },
      channel_assignments: [
        assignment("TEMP1F", {
          plant_id: PLANT_A_ID,
          channel_ref: "canopy-a-temperature",
          device_ref: "probe-a-synthetic",
          reported_unit: "°F",
        }),
      ],
    });
    const value = requireReading(result, () => true);

    expect(value).toMatchObject({
      source: "live",
      provider: ECOWITT_MQTT_SENSOR_PROVIDER,
      transport: ECOWITT_MQTT_SENSOR_TRANSPORT,
      adapter_id: ECOWITT_MQTT_SENSOR_ADAPTER_ID,
      adapter_version: ECOWITT_MQTT_SENSOR_ADAPTER_VERSION,
      origin_source: "ecowitt_gateway",
      trust_level: "local_transport",
      captured_at: CAPTURED_AT,
      received_at: RECEIVED_AT,
      tent_id: TENT_ID,
      plant_id: PLANT_A_ID,
      metric: "temperature_c",
      normalized_value: 25,
      normalized_unit: "°C",
      validity: "valid",
      confidence: 0.95,
      warnings: [],
      raw_payload_ref: SENSOR_ADAPTER_REDACTED_PAYLOAD_REF,
      channel_ref: "canopy-a-temperature",
      device_ref: "probe-a-synthetic",
      raw_field: "temp1f",
      value_origin: "observed",
      comparison_role: "primary",
      ingest_boundary_status: "ready",
    });
    expect(ECOWITT_MQTT_SENSOR_ADAPTER_VERSION).toBe("1.0.1");
    expect(value.reading_id.split("|").slice(0, 2)).toEqual([
      ECOWITT_MQTT_SENSOR_ADAPTER_ID,
      "1.0.1",
    ]);
    expect(Object.keys(value)).not.toContain("raw_payload");
  });

  it("invalidates duplicate raw-field assignments instead of choosing one", () => {
    const result = adapt({
      payload: { captured_at: CAPTURED_AT, temp1c: 24 },
      channel_assignments: [
        assignment("temp1c", { channel_ref: "probe-a" }),
        assignment("TEMP1C", { channel_ref: "probe-b" }),
      ],
    });
    const value = requireReading(result, () => true);

    expect(result.ok).toBe(false);
    expect(result.warnings).toContain("duplicate_channel_assignment");
    expect(value.warnings).toContain("duplicate_channel_assignment");
    expect(value.tent_id).toBeNull();
    expect(value.validity).toBe("invalid");
    expect(value.normalized_value).toBeNull();
    expect(value.ingest_boundary_status).toBe("invalid");
  });

  it("does not trust payload tent or plant ids when config mapping is missing", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        temp1c: 24,
        tent_id: "10000000-0000-4000-8000-000000000099",
        plant_id: "20000000-0000-4000-8000-000000000099",
      },
      channel_assignments: [],
    });
    const value = requireReading(result, () => true);

    expect(result.ok).toBe(false);
    expect(value.tent_id).toBeNull();
    expect(value.plant_id).toBeNull();
    expect(value.warnings).toContain("missing_tent_mapping");
    expect(value.source).toBe("invalid");
  });

  it("invalidates a malformed configured plant id instead of rerouting tent-level", () => {
    const result = adapt({
      payload: { captured_at: CAPTURED_AT, temp1c: 24 },
      channel_assignments: [
        assignment("temp1c", {
          plant_id: "not-a-valid-uuid",
          channel_ref: "plant-probe",
        }),
      ],
    });
    const value = requireReading(result, () => true);

    expect(result.ok).toBe(false);
    expect(value.tent_id).toBe(TENT_ID);
    expect(value.plant_id).toBeNull();
    expect(value.source).toBe("invalid");
    expect(value.validity).toBe("invalid");
    expect(value.normalized_value).toBeNull();
    expect(value.ingest_boundary_status).toBe("invalid");
    expect(value.warnings).toContain("invalid_plant_mapping");
  });

  it("treats a non-array assignment boundary as unmapped without throwing", () => {
    const run = () =>
      adapt({
        payload: { captured_at: CAPTURED_AT, temp1c: 24 },
        channel_assignments: {
          temp1c: assignment("temp1c"),
        } as unknown as EcowittMqttChannelAssignment[],
      });

    expect(run).not.toThrow();
    const result = run();
    const value = requireReading(result, () => true);
    expect(result.ok).toBe(false);
    expect(value.tent_id).toBeNull();
    expect(value.validity).toBe("invalid");
    expect(value.normalized_value).toBeNull();
    expect(value.warnings).toContain("missing_tent_mapping");
  });

  it("fails case-insensitive metric and timestamp key collisions closed", () => {
    const metricCollision = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        temp1c: 24,
        TEMP1C: 25,
      },
      channel_assignments: [assignment("temp1c")],
    });
    const timestampCollision = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        CAPTURED_AT: "2026-07-31T12:04:31.000Z",
        temp1c: 24,
      },
      channel_assignments: [assignment("temp1c")],
    });

    const metricReading = requireReading(metricCollision, () => true);
    expect(metricCollision.ok).toBe(false);
    expect(metricCollision.warnings).toContain("duplicate_raw_field");
    expect(metricReading.warnings).toContain("duplicate_raw_field");
    expect(metricReading.validity).toBe("invalid");
    expect(metricReading.normalized_value).toBeNull();

    const timestampReading = requireReading(timestampCollision, () => true);
    expect(timestampCollision.ok).toBe(false);
    expect(timestampCollision.warnings).toEqual(
      expect.arrayContaining(["duplicate_raw_field", "malformed_timestamp"]),
    );
    expect(timestampReading.captured_at).toBeNull();
    expect(timestampReading.source).toBe("invalid");
    expect(timestampReading.validity).toBe("invalid");
    expect(timestampReading.normalized_value).toBeNull();
  });

  it("drops unsafe configured channel, device, and pairing references", () => {
    const result = adapt({
      payload: { captured_at: CAPTURED_AT, temp1c: 24 },
      channel_assignments: [
        assignment("temp1c", {
          channel_ref: "station-gateway-private",
          device_ref: "02:00:00:00:00:01",
          pairing_ref: "192.168.254.254",
        }),
      ],
    });
    const value = requireReading(result, () => true);

    expect(value.channel_ref).toBe("temp1c");
    expect(value.device_ref).toBeNull();
    expect(value.warnings).toContain("device_reference_redacted");
    expect(JSON.stringify(value)).not.toContain("02:00:00:00:00:01");
    expect(JSON.stringify(value)).not.toContain("192.168.254.254");
  });

  it("drops newly covered sensitive reference formats before building reading ids", () => {
    for (const [label, sensitive] of SENSITIVE_FORMAT_CASES) {
      const result = adapt({
        payload: { captured_at: CAPTURED_AT, temp1c: 24 },
        channel_assignments: [
          assignment("temp1c", {
            channel_ref: sensitive,
            device_ref: sensitive,
            pairing_ref: sensitive,
          }),
        ],
      });
      const value = requireReading(result, () => true);

      expect(value.channel_ref, label).toBe("temp1c");
      expect(value.device_ref, label).toBeNull();
      expect(value.warnings, label).toContain("device_reference_redacted");
      expect(decodeURIComponent(value.reading_id), label).not.toContain(sensitive);
      expect(value.reading_id, label).not.toContain(encodeURIComponent(sensitive));
    }
  });

  it("keeps derived VPD ready while source-reported VPD is reference-only", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        temp1c: 25,
        humidity1: 60,
        vpd1: 1.2,
      },
      channel_assignments: [
        assignment("temp1c", {
          channel_ref: "canopy-temperature",
          pairing_ref: "canopy",
        }),
        assignment("humidity1", {
          channel_ref: "canopy-humidity",
          pairing_ref: "canopy",
        }),
        assignment("vpd1", {
          channel_ref: "gateway-vpd-reference",
          reported_unit: "kPa",
          pairing_ref: "canopy",
        }),
      ],
    });
    const sourceReported = requireReading(
      result,
      (reading) => reading.value_origin === "source_reported",
    );
    const derived = requireReading(result, (reading) => reading.value_origin === "derived");

    expect(result.ok).toBe(true);
    expect(sourceReported).toMatchObject({
      metric: "vpd_kpa",
      normalized_value: 1.2,
      normalized_unit: "kPa",
      origin_source: "ecowitt_reported",
      value_origin: "source_reported",
      comparison_role: "reference",
      trust_level: "degraded",
      confidence: 0.6,
      ingest_boundary_status: "reference_only",
    });
    expect(sourceReported.warnings).toContain("source_reported_vpd_reference_only");
    expect(sourceReported.warnings).not.toContain("ingest_boundary_channel_collision");
    expect(derived).toMatchObject({
      metric: "vpd_kpa",
      value_origin: "derived",
      comparison_role: "primary",
      normalized_value: calculateAirVpdKpa({ tempC: 25, rhPercent: 60 }),
      ingest_boundary_status: "ready",
    });
    expect(derived.warnings).not.toContain("ingest_boundary_channel_collision");
  });

  it("surfaces persistence-key collisions instead of silently dropping channels", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        soilmoisture1: 33,
        soilmoisture2: 47,
      },
      channel_assignments: [
        assignment("soilmoisture1", {
          channel_ref: "root-zone-a",
          plant_id: PLANT_A_ID,
        }),
        assignment("soilmoisture2", {
          channel_ref: "root-zone-b",
          plant_id: "20000000-0000-4000-8000-000000000002",
        }),
      ],
    });

    expect(result.ok).toBe(false);
    expect(result.readings).toHaveLength(2);
    expect(new Set(result.readings.map((reading) => reading.reading_id)).size).toBe(2);
    for (const value of result.readings) {
      expect(value.validity).toBe("valid");
      expect(value.ingest_boundary_status).toBe("blocked_channel_collision");
      expect(value.warnings).toContain("ingest_boundary_channel_collision");
    }
    expect(result.warnings).toContain("ingest_boundary_channel_collision");
  });

  it("recognizes only explicit metric fields and canonical units", () => {
    expect(isEcowittMqttSensorAdapterMetricField(" TEMP1F ")).toBe(true);
    expect(isEcowittMqttSensorAdapterMetricField("soiltemp1f")).toBe(true);
    expect(isEcowittMqttSensorAdapterMetricField("SOILTEMP2C")).toBe(true);
    expect(isEcowittMqttSensorAdapterMetricField("soil_ec2_ms_cm")).toBe(true);
    expect(isEcowittMqttSensorAdapterMetricField("relay1")).toBe(false);
    expect(isEcowittMqttSensorAdapterMetricField("unknown_vendor_field")).toBe(false);
    expect(normalizedUnitForEcowittMqttMetric("temperature_c")).toBe("°C");
    expect(normalizedUnitForEcowittMqttMetric("soil_temp_c")).toBe("°C");
    expect(normalizedUnitForEcowittMqttMetric("ec")).toBe("mS/cm");
  });
});

describe("adaptEcowittMqttSensorPayload — redaction, ignore rules, and purity", () => {
  it("redacts PASSKEY, MAC, station, private IP, password, token, API key, service-role, and bridge-token values", () => {
    const result = adapt();
    const redacted = result.redacted_payload as Record<string, unknown>;

    expect(redacted.PASSKEY).toBe("[redacted]");
    expect(redacted.mac).toBe("[redacted]");
    expect(redacted.stationtype).toBe("[redacted]");
    expect(redacted.local_ip).toBe("[redacted]");
    expect(redacted.password).toBe("[redacted]");
    expect(redacted.token).toBe("[redacted]");
    expect(redacted.api_key).toBe("[redacted]");
    expect(redacted.authorization).toBe("[redacted]");
    expect(redacted).not.toHaveProperty("privileged_marker");
    expect(redacted).not.toHaveProperty("bridge_credential");
    expect(redacted).not.toHaveProperty("neutral_string_evidence");
    expect(redacted).not.toHaveProperty("unknown_vendor_field");
    expect(redacted.soiltemp1f).toBe(68);
    expect(redacted.soiltemp2c).toBe(21);

    const serialized = JSON.stringify(result);
    for (const secret of [
      "SYNTHETIC_INERT_PASSKEY_NOT_REAL",
      "02:00:00:00:00:01",
      "SYNTHETIC_INERT_STATION_NOT_REAL",
      "192.168.254.254",
      "SYNTHETIC_INERT_PASSWORD_NOT_REAL",
      "SYNTHETIC_INERT_TOKEN_NOT_REAL",
      "SYNTHETIC_INERT_API_KEY_NOT_REAL",
      "SYNTHETIC_INERT_AUTH_NOT_REAL",
      "service-role:SYNTHETIC_INERT_NOT_REAL",
      "vbt_synthetic_inert_not_real",
      "SUPABASE_SERVICE_ROLE_KEY",
      "opaque MAC 02:00:00:00:00:02",
      "private endpoint 192.168.254.253",
      '"sample_d":"PASSKEY"',
      '"sample_e":"token"',
      '"sample_f":"station"',
    ]) {
      expect(serialized).not.toContain(secret);
    }
  });

  it("redacts newly covered sensitive formats from allowlisted payload strings", () => {
    for (const [label, sensitive] of SENSITIVE_FORMAT_CASES) {
      const result = adapt({
        payload: {
          _comment: sensitive,
          captured_at: CAPTURED_AT,
          temp1c: 24,
        },
        channel_assignments: [assignment("temp1c")],
      });
      const redacted = result.redacted_payload as Record<string, unknown>;

      expect(redacted._comment, label).toBe("[redacted]");
      expect(JSON.stringify(result), label).not.toContain(sensitive);
    }
  });

  it("does not redact an IPv4-looking suffix embedded in a longer numeric token", () => {
    const safeReference = "build-1127.0.0.1";
    const result = adapt({
      payload: {
        _comment: safeReference,
        captured_at: CAPTURED_AT,
        temp1c: 24,
      },
      channel_assignments: [
        assignment("temp1c", {
          channel_ref: safeReference,
          device_ref: safeReference,
        }),
      ],
    });
    const reading = requireReading(result, () => true);
    const redacted = result.redacted_payload as Record<string, unknown>;

    expect(reading.channel_ref).toBe(safeReference);
    expect(reading.device_ref).toBe(safeReference);
    expect(reading.warnings).not.toContain("device_reference_redacted");
    expect(redacted._comment).toBe(safeReference);
  });

  it("counts unknown fields but omits them from the allowlisted redacted payload", () => {
    const result = adapt({
      payload: {
        _comment: "synthetic fixture marker",
        captured_at: CAPTURED_AT,
        unknown_alpha: 1,
        unknown_beta: "safe",
      },
      channel_assignments: [],
    });

    expect(result.ok).toBe(false);
    expect(result.readings).toEqual([]);
    expect(result.ignored_field_count).toBe(2);
    expect(result.warnings).toContain("no_supported_metrics");
    expect(result.redacted_payload).toEqual({
      _comment: "synthetic fixture marker",
      captured_at: CAPTURED_AT,
    });
    expect(result.redacted_payload).not.toHaveProperty("unknown_alpha");
    expect(result.redacted_payload).not.toHaveProperty("unknown_beta");
  });

  it("omits command_topic and never turns it into a reading", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        command_topic: "verdant/synthetic/command",
      },
      channel_assignments: [assignment("command_topic")],
    });

    expect(result.ok).toBe(false);
    expect(result.readings).toEqual([]);
    expect(result.omitted_control_field_count).toBe(1);
    expect(result.ignored_field_count).toBe(1);
    expect(result.warnings).toContain("no_supported_metrics");
    expect(result.redacted_payload).toEqual({ captured_at: CAPTURED_AT });
  });

  it("omits command/control fields recursively and never turns them into readings", () => {
    const result = adapt({
      payload: {
        captured_at: CAPTURED_AT,
        temp1c: 24,
        command: "SYNTHETIC_DO_NOT_EXECUTE",
        relay1: "on",
        relay_state: "on",
        fan_speed: 3,
        fan_setpoint: 99,
        commands: { target_temperature: 28 },
        target_temperature: 28,
        power_state: "on",
        valve: "open",
        actuator_output: 80,
        outlet1: "on",
        motor_speed: 2,
        automation_action: "run",
        schedule: "night",
        mode: "auto",
        enable: true,
        trigger: "manual",
        publish: "SYNTHETIC_DO_NOT_PUBLISH",
        nested: {
          pump: "on",
          device_control: "SYNTHETIC_DO_NOT_CONTROL",
          safe_note: "retained evidence",
        },
      },
      channel_assignments: [assignment("temp1c")],
    });
    const redacted = result.redacted_payload as Record<string, unknown>;

    expect(result.readings).toHaveLength(1);
    expect(result.omitted_control_field_count).toBe(18);
    expect(redacted).not.toHaveProperty("command");
    expect(redacted).not.toHaveProperty("relay1");
    expect(redacted).not.toHaveProperty("relay_state");
    expect(redacted).not.toHaveProperty("fan_speed");
    expect(redacted).not.toHaveProperty("fan_setpoint");
    expect(redacted).not.toHaveProperty("commands");
    expect(redacted).not.toHaveProperty("target_temperature");
    expect(redacted).not.toHaveProperty("power_state");
    expect(redacted).not.toHaveProperty("valve");
    expect(redacted).not.toHaveProperty("actuator_output");
    expect(redacted).not.toHaveProperty("outlet1");
    expect(redacted).not.toHaveProperty("motor_speed");
    expect(redacted).not.toHaveProperty("automation_action");
    expect(redacted).not.toHaveProperty("schedule");
    expect(redacted).not.toHaveProperty("mode");
    expect(redacted).not.toHaveProperty("enable");
    expect(redacted).not.toHaveProperty("trigger");
    expect(redacted).not.toHaveProperty("publish");
    expect(redacted).not.toHaveProperty("nested");
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_DO_NOT_EXECUTE");
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_DO_NOT_PUBLISH");
    expect(JSON.stringify(result)).not.toContain("SYNTHETIC_DO_NOT_CONTROL");
  });

  it("does not recurse into deeply nested or cyclic payload values", () => {
    const deeplyNested: Record<string, unknown> = {};
    let cursor = deeplyNested;
    for (let depth = 0; depth < 12_000; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const payload = {
      captured_at: CAPTURED_AT,
      temp1c: deeplyNested,
      humidity1: cyclic,
      unknown_nested: deeplyNested,
    };

    expect(() =>
      adapt({
        payload,
        channel_assignments: [assignment("temp1c"), assignment("humidity1")],
      }),
    ).not.toThrow();

    const result = adapt({
      payload,
      channel_assignments: [assignment("temp1c"), assignment("humidity1")],
    });
    expect(result.ok).toBe(false);
    expect(result.readings).toHaveLength(2);
    expect(result.readings.every((reading) => reading.validity === "invalid")).toBe(true);
    expect(result.readings.every((reading) => reading.normalized_value === null)).toBe(true);
    expect(result.redacted_payload).toEqual({ captured_at: CAPTURED_AT });
    expect(result.ignored_field_count).toBe(1);
  });

  it("is deterministic across payload insertion order and assignment order", () => {
    const reversedPayload = Object.fromEntries(Object.entries(FIXTURE.payload).reverse());
    const reversedAssignments = [...FIXTURE.channel_assignments].reverse();

    expect(
      adapt({
        payload: reversedPayload,
        channel_assignments: reversedAssignments,
      }),
    ).toEqual(adapt());
  });

  it("does not mutate payloads or channel assignments", () => {
    const payloadBefore = JSON.stringify(FIXTURE.payload);
    const assignmentsBefore = JSON.stringify(FIXTURE.channel_assignments);

    adapt();

    expect(JSON.stringify(FIXTURE.payload)).toBe(payloadBefore);
    expect(JSON.stringify(FIXTURE.channel_assignments)).toBe(assignmentsBefore);
  });

  it("returns readings in the documented deterministic lexical order", () => {
    const result = adapt();
    const keys = result.readings.map((reading) =>
      [
        reading.metric,
        reading.channel_ref,
        reading.device_ref ?? "",
        reading.captured_at ?? "",
        reading.reading_id,
      ].join("\u0000"),
    );

    expect(keys).toEqual([...keys].sort());
  });
});
