import { describe, expect, it } from "vitest";
import { buildAiSensorSnapshotContext, READING_KEYS } from "@/lib/aiSensorSnapshotContextRules";
import {
  AI_READING_KEYS,
  resolveQuickLogSensorSnapshotForAi,
  type QuickLogSensorAcquisitionRow,
} from "@/lib/quick-log/quickLogSensorSnapshotAcquisitionRules";

/**
 * Residual of #1003: the resolver feeds the ai-coach prompt, so every path
 * must build its output from an allowlist. Sensitive values are injected at
 * the top level and nested; none may survive into the returned object or its
 * JSON serialization.
 */

const TOKEN = "vbt_super_secret_bridge_token_0123456789";
const MAC = "AA:BB:CC:DD:EE:FF";
const UUID = "3f2c9a1e-7b4d-4e8a-9c61-2d5f0b8e7a13";
const RAW_MARKER = "raw_payload_marker_do_not_forward";

const SENSITIVE_STRINGS = [TOKEN, MAC, UUID, RAW_MARKER, "raw_payload", "vbt_"];

function sensitiveFields(): Record<string, unknown> {
  return {
    raw_payload: { marker: RAW_MARKER, token: TOKEN, mac: MAC, device_uuid: UUID },
    token: TOKEN,
    bridge_token: TOKEN,
    mac: MAC,
    passkey: MAC,
    hardware_id: UUID,
    device_id: UUID,
    station_uuid: UUID,
    nested: {
      raw_payload: { marker: RAW_MARKER },
      deeper: { token: TOKEN, mac: MAC, uuid: UUID },
    },
  };
}

function expectNoSensitiveData(resolved: unknown) {
  const json = JSON.stringify(resolved) ?? "";
  for (const needle of SENSITIVE_STRINGS) {
    expect(json).not.toContain(needle);
  }
  if (resolved && typeof resolved === "object") {
    const keys = Object.keys(resolved);
    for (const key of [
      "raw_payload",
      "token",
      "bridge_token",
      "mac",
      "passkey",
      "hardware_id",
      "device_id",
      "station_uuid",
      "nested",
      "metrics",
    ]) {
      expect(keys).not.toContain(key);
    }
    for (const value of Object.values(resolved)) {
      expect(value === null || typeof value === "string" || typeof value === "number").toBe(true);
    }
  }
}

function liveRow(
  metric: string,
  value: number,
  rawPayload: unknown = {
    vendor: "ecowitt",
    metadata: { reported_verdant_source: "live", raw_payload: { marker: RAW_MARKER } },
  },
): QuickLogSensorAcquisitionRow {
  return {
    id: UUID,
    metric,
    value,
    quality: "ok",
    source: "live",
    captured_at: "2026-06-09T12:00:00Z",
    raw_payload: rawPayload,
  };
}

describe("resolveQuickLogSensorSnapshotForAi — allowlisted output", () => {
  it("no-metrics flat snapshot: drops raw_payload, token, MAC and UUID at every depth", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "manual",
      captured_at: "2026-06-09T12:00:00Z",
      temperature_c: 24.5,
      humidity: 55,
      ...sensitiveFields(),
    });

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({
      source: "manual",
      captured_at: "2026-06-09T12:00:00.000Z",
      temperature_c: 24.5,
      humidity: 55,
    });
  });

  it("no-metrics flat snapshot: does not forward a numeric value under an unknown key", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "csv",
      captured_at: "2026-06-09T12:00:00Z",
      vpd_kpa: 1.1,
      serial_number: 123456789,
    }) as Record<string, unknown>;

    expect(resolved).toEqual({
      source: "csv",
      captured_at: "2026-06-09T12:00:00.000Z",
      vpd_kpa: 1.1,
    });
  });

  it("nested non-live snapshot: drops sensitive top-level and metric-level fields", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "manual",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: {
        temperature: 23,
        humidity: 50,
        device_serial: 987654321,
        nested: { token: TOKEN, mac: MAC, uuid: UUID },
        raw_payload: { marker: RAW_MARKER },
      },
      ...sensitiveFields(),
    });

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({
      source: "manual",
      captured_at: "2026-06-09T12:00:00.000Z",
      temperature_c: 23,
      humidity: 50,
    });
  });

  it("nested live snapshot corroborated by rows: forwards only allowlisted values", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi(
      {
        source: "live",
        captured_at: "2026-06-09T12:00:00Z",
        metrics: { temperature: 99 },
        ...sensitiveFields(),
      },
      [liveRow("temperature_c", 24.3), liveRow("humidity_pct", 55)],
    );

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({
      source: "live",
      captured_at: "2026-06-09T12:00:00.000Z",
      temperature_c: 24.3,
      humidity: 55,
    });
  });

  it("nested live snapshot without provenance fails closed to invalid, not unknown", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi(
      {
        source: "live",
        captured_at: "2026-06-09T12:00:00Z",
        metrics: { temperature: 99 },
        ...sensitiveFields(),
      },
      null,
    );

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({ source: "invalid", captured_at: "2026-06-09T12:00:00.000Z" });

    const context = buildAiSensorSnapshotContext(resolved, {
      now: new Date("2026-06-09T12:05:00Z"),
    });
    expect(context.sourceLabel).toBe("invalid");
    expect(context.isTrustedForAi).toBe(false);
    expect(context.valuesForModel).toBeNull();
  });

  it("diagnostic snapshot: becomes demo and keeps nothing sensitive", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      ...sensitiveFields(),
      source: "live",
      captured_at: "2026-06-09T12:00:00Z",
      temperature_c: 99,
      raw_payload: {
        vendor: "ecowitt_windows_testbench",
        metadata: { confidence: "test", token: TOKEN, mac: MAC, uuid: UUID, marker: RAW_MARKER },
      },
    });

    expectNoSensitiveData(resolved);
    expect(resolved).toEqual({ source: "demo", captured_at: "2026-06-09T12:00:00.000Z" });
  });

  it.each([
    ["missing", undefined],
    ["unlabeled", "unknown"],
    ["unrecognized", "gateway_v2"],
    ["token-shaped", TOKEN],
    ["non-string", 42],
  ])("%s source maps to invalid and is never echoed", (_label, source) => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source,
      captured_at: "2026-06-09T12:00:00Z",
      temperature_c: 24,
      ...sensitiveFields(),
    }) as Record<string, unknown>;

    expectNoSensitiveData(resolved);
    expect(resolved.source).toBe("invalid");
  });

  it("canonicalizes legacy aliases and source spelling", () => {
    const imported = resolveQuickLogSensorSnapshotForAi({
      source: " Imported ",
      captured_at: "2026-06-09T12:00:00Z",
    }) as Record<string, unknown>;
    const fixture = resolveQuickLogSensorSnapshotForAi({
      data_source: "fixture",
      captured_at: "2026-06-09T12:00:00Z",
    }) as Record<string, unknown>;
    expect(imported.source).toBe("csv");
    expect(fixture.source).toBe("demo");
  });

  it("does not echo a token-shaped or non-date captured_at, and marks it invalid", () => {
    for (const capturedAt of [TOKEN, MAC, UUID, { raw_payload: RAW_MARKER }, "not a date"]) {
      const resolved = resolveQuickLogSensorSnapshotForAi({
        source: "manual",
        captured_at: capturedAt,
        temperature_c: 24,
      }) as Record<string, unknown>;
      expectNoSensitiveData(resolved);
      expect(resolved).toEqual({ source: "invalid", captured_at: null });
    }
  });

  it.each(["live", "manual", "csv"])(
    "a present but unreadable %s captured_at reads as invalid in the AI context, not missing",
    (source) => {
      const resolved = resolveQuickLogSensorSnapshotForAi({
        source,
        captured_at: "garbage-timestamp",
        metrics: { temperature_c: 24 },
      });
      expect(resolved).toEqual({ source: "invalid", captured_at: null });
      const context = JSON.stringify(buildAiSensorSnapshotContext(resolved));
      expect(context).not.toMatch(/captured_at missing/);
    },
  );

  it("an empty captured_at counts as missing, not invalid", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "manual",
      captured_at: "  ",
      temperature_c: 24,
    });
    expect(resolved).toEqual({ source: "manual", captured_at: null, temperature_c: 24 });
  });

  it("non-object inputs never echo their content", () => {
    expect(resolveQuickLogSensorSnapshotForAi(null)).toBeNull();
    expect(resolveQuickLogSensorSnapshotForAi(undefined)).toBeNull();
    for (const input of [TOKEN, 42, [{ raw_payload: RAW_MARKER, token: TOKEN, mac: MAC }]]) {
      const resolved = resolveQuickLogSensorSnapshotForAi(input);
      expectNoSensitiveData(resolved);
      expect(resolved).toEqual({ source: "invalid", captured_at: null });
    }
  });

  it("is deterministic and does not mutate its input", () => {
    const input = {
      source: "manual",
      captured_at: "2026-06-09T12:00:00Z",
      metrics: { temperature: 23 },
      ...sensitiveFields(),
    };
    const before = JSON.stringify(input);
    const first = resolveQuickLogSensorSnapshotForAi(input);
    const second = resolveQuickLogSensorSnapshotForAi(input);
    expect(second).toEqual(first);
    expect(JSON.stringify(input)).toBe(before);
    expect(first).not.toBe(input);
  });
});

/**
 * Every reading key the annotator understands, pinned independently of both
 * modules so that a key dropped from either list fails here.
 */
const EXPECTED_READING_KEYS = [
  "air_temp_c",
  "co2",
  "co2_ppm",
  "humidity",
  "humidity_pct",
  "ph",
  "ppfd",
  "reservoir_ec_mscm",
  "reservoir_ph",
  "soil_ec",
  "soil_ec_mscm",
  "soil_moisture",
  "soil_moisture_pct",
  "soil_temp_c",
  "soil_temp_f",
  "soil_water_content",
  "temp_c",
  "temp_f",
  "temperature_c",
  "temperature_f",
  "vpd",
  "vpd_kpa",
] as const;

describe("AI reading-key allowlist stays in step with the annotator", () => {
  it("the resolver allowlist and the annotator READING_KEYS resolve to the same keys", () => {
    expect([...(AI_READING_KEYS ?? [])].sort()).toEqual([...EXPECTED_READING_KEYS]);
    expect([...(READING_KEYS ?? [])].sort()).toEqual([...EXPECTED_READING_KEYS]);
  });

  it.each(EXPECTED_READING_KEYS)("forwards %s from the resolver to the model values", (key) => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "manual",
      captured_at: NOW.toISOString(),
      [key]: 7,
    });
    expect(resolved?.[key]).toBe(7);
    const context = buildAiSensorSnapshotContext(resolved, { now: NOW });
    expect(context.valuesForModel?.[key]).toBe(7);
  });
});

describe("flat (no-metrics) live snapshot needs provenance like a nested one", () => {
  it("fails closed to invalid without provenance rows, forwarding no values", () => {
    const capturedAt = new Date().toISOString();
    const resolved = resolveQuickLogSensorSnapshotForAi({
      source: "live",
      captured_at: capturedAt,
      temperature_c: 24,
    });
    expect(resolved).toEqual({ source: "invalid", captured_at: capturedAt });
    expect(JSON.stringify(buildAiSensorSnapshotContext(resolved))).not.toMatch(/trust=high/);
  });
});

const NOW = new Date("2026-06-09T12:05:00Z");
const MALFORMED_PROVENANCE: ReadonlyArray<[string, unknown]> = [
  ["number", 42],
  ["boolean", true],
  ["object", { label: "live" }],
  ["array", ["manual"]],
];

function expectUntrusted(resolved: ReturnType<typeof resolveQuickLogSensorSnapshotForAi>) {
  expect(resolved?.source).toBe("invalid");
  const context = buildAiSensorSnapshotContext(resolved, { now: NOW });
  expect(context.isTrustedForAi).toBe(false);
  expect(context.valuesForModel).toBeNull();
}

describe("a present but malformed provenance field is invalid, not skipped", () => {
  it.each(MALFORMED_PROVENANCE)(
    "flat: non-string source (%s) does not fall through to data_source",
    (_label, source) => {
      const resolved = resolveQuickLogSensorSnapshotForAi({
        source,
        data_source: "manual",
        captured_at: "2026-06-09T12:00:00Z",
        temperature_c: 24,
      });
      expectUntrusted(resolved);
    },
  );

  it.each(MALFORMED_PROVENANCE)(
    "nested: non-string source (%s) does not fall through to data_source",
    (_label, source) => {
      const resolved = resolveQuickLogSensorSnapshotForAi({
        source,
        data_source: "manual",
        captured_at: "2026-06-09T12:00:00Z",
        metrics: { temperature: 24 },
      });
      expectUntrusted(resolved);
    },
  );

  it("a non-string data_source does not fall through to sensor_source", () => {
    const resolved = resolveQuickLogSensorSnapshotForAi({
      data_source: 42,
      sensor_source: "manual",
      captured_at: "2026-06-09T12:00:00Z",
      temperature_c: 24,
    });
    expectUntrusted(resolved);
  });

  it("an absent or null source still falls through to a legacy label", () => {
    for (const source of [undefined, null]) {
      const resolved = resolveQuickLogSensorSnapshotForAi({
        source,
        data_source: "manual",
        captured_at: "2026-06-09T12:00:00Z",
        temperature_c: 24,
      });
      expect(resolved).toEqual({
        source: "manual",
        captured_at: "2026-06-09T12:00:00.000Z",
        temperature_c: 24,
      });
    }
  });
});

describe("inherited Object properties are not source aliases", () => {
  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "source %s resolves to the scalar invalid, flat and nested",
    (source) => {
      for (const extra of [{ temperature_c: 24 }, { metrics: { temperature: 24 } }]) {
        const resolved = resolveQuickLogSensorSnapshotForAi({
          source,
          captured_at: "2026-06-09T12:00:00Z",
          ...extra,
        });
        expect(resolved?.source).toBe("invalid");
        expect(JSON.parse(JSON.stringify(resolved)).source).toBe("invalid");
        expectUntrusted(resolved);
      }
    },
  );
});

describe("an unreadable timestamp is invalid even when live rows corroborate", () => {
  it.each([
    ["flat", { temperature_c: 24 }],
    ["nested", { metrics: { temperature: 24 } }],
  ])("%s live snapshot with a garbage captured_at and live rows", (_label, extra) => {
    const resolved = resolveQuickLogSensorSnapshotForAi(
      { source: "live", captured_at: "garbage-timestamp", ...extra },
      [liveRow("temperature_c", 24)],
    );
    expect(resolved).toEqual({ source: "invalid", captured_at: null });
    expectUntrusted(resolved);
  });
});
