/**
 * homeAssistantEcowittMqttAdapter — targeted tests (20 pinned behaviors).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HaStatestreamAssembler,
  buildHaIdempotencyKey,
  deriveVpdIfPaired,
  parseEcowittRawMessage,
  parseHaJsonMessage,
  parseHaStatestreamMessage,
  HA_VPD_PAIRING_WINDOW_MS,
  type HaMqttMappingFile,
  type HaMetricReading,
} from "@/lib/homeAssistantEcowittMqttAdapter";

const TENT = "00000000-0000-0000-0000-0000000000aa";
const OTHER_TENT = "00000000-0000-0000-0000-0000000000bb";
const NOW = new Date("2026-07-22T18:00:30.000Z");
const LIVE_ISO = "2026-07-22T18:00:00.000Z";

const mapping: HaMqttMappingFile = {
  version: 1,
  bridge: "home_assistant",
  upstream_mode: "ha_core_ecowitt_push",
  statestream_topic_prefix: "homeassistant",
  entities: [
    { entity_id: "sensor.temp_out", metric: "air_temp_f", expected_unit: "°F", tent_id: TENT },
    { entity_id: "sensor.temp_out_c", metric: "air_temp_f", expected_unit: "°C", tent_id: TENT },
    { entity_id: "sensor.rh_out", metric: "humidity_pct", expected_unit: "%", tent_id: TENT },
    { entity_id: "sensor.rh_other_tent", metric: "humidity_pct", expected_unit: "%", tent_id: OTHER_TENT },
    { entity_id: "sensor.co2", metric: "co2_ppm", expected_unit: "ppm", tent_id: TENT },
  ],
};

function jsonArgs(overrides: Partial<Parameters<typeof parseHaJsonMessage>[0]["payload"] & { topic?: string; retained?: boolean }> = {}) {
  const { topic, retained, ...payloadOverrides } = overrides as Record<string, unknown>;
  return {
    topic: (topic as string) ?? "homeassistant/ha_json",
    retained: (retained as boolean) ?? false,
    receivedAt: NOW,
    now: NOW,
    mapping,
    payload: {
      entity_id: "sensor.temp_out",
      state: "78.6",
      unit_of_measurement: "°F",
      last_updated: LIVE_ISO,
      ...payloadOverrides,
    },
  };
}

describe("homeAssistantEcowittMqttAdapter — HA JSON envelope", () => {
  it("1. HA JSON °F temperature normalizes correctly", () => {
    const r = parseHaJsonMessage(jsonArgs());
    expect(r.ok).toBe(true);
    expect(r.readings).toHaveLength(1);
    expect(r.readings[0].metric).toBe("air_temp_f");
    expect(r.readings[0].value).toBeCloseTo(78.6, 2);
    expect(r.provenance.source).toBe("live");
    expect(r.provenance.bridge).toBe("home_assistant");
    expect(r.provenance.upstream_mode).toBe("ha_core_ecowitt_push");
  });

  it("2. HA JSON °C temperature normalizes to °F correctly", () => {
    const r = parseHaJsonMessage(
      jsonArgs({
        entity_id: "sensor.temp_out_c",
        state: 25,
        unit_of_measurement: "°C",
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.readings[0].value).toBeCloseTo(77, 1);
  });

  it("3. JSON-serialized state string parses correctly", () => {
    const r = parseHaJsonMessage(jsonArgs({ state: "\"72.4\"" }));
    expect(r.ok).toBe(true);
    expect(r.readings[0].value).toBeCloseTo(72.4, 2);
  });

  it("4. unknown/unavailable state is invalid", () => {
    for (const state of ["unknown", "unavailable", "none", null]) {
      const r = parseHaJsonMessage(jsonArgs({ state }));
      expect(r.ok).toBe(false);
      expect(r.reasons).toContain("unknown_or_unavailable_state");
      expect(r.provenance.source).toBe("invalid");
    }
  });

  it("5. exact entity mapping produces correct metric and tent", () => {
    const r = parseHaJsonMessage(
      jsonArgs({ entity_id: "sensor.co2", state: 720, unit_of_measurement: "ppm" }),
    );
    expect(r.ok).toBe(true);
    expect(r.readings[0].metric).toBe("co2_ppm");
    expect(r.readings[0].tent_id).toBe(TENT);
  });

  it("6. unknown entity is ignored and never auto-assigned", () => {
    const r = parseHaJsonMessage(jsonArgs({ entity_id: "sensor.some_unmapped" }));
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("unknown_entity");
    expect(r.readings).toHaveLength(0);
    expect(r.provenance.tent_id).toBeNull();
  });

  it("7. old valid timestamp becomes stale", () => {
    const old = new Date(NOW.getTime() - 20 * 60 * 1000).toISOString();
    const r = parseHaJsonMessage(jsonArgs({ last_updated: old }));
    expect(r.provenance.source).toBe("stale");
    expect(r.reasons).toContain("stale_reading");
    expect(r.readings).toHaveLength(0);
  });

  it("8. missing timestamp becomes invalid", () => {
    const r = parseHaJsonMessage(jsonArgs({ last_updated: undefined }));
    expect(r.provenance.source).toBe("invalid");
    expect(r.reasons).toContain("missing_captured_at");
  });

  it("9. retained message without source timestamp is never live", () => {
    const r = parseHaJsonMessage(jsonArgs({ last_updated: undefined, retained: true }));
    expect(r.provenance.source).toBe("invalid");
    expect(r.reasons).toContain("retained_without_source_timestamp");
  });

  it("10. future timestamp outside tolerance is invalid", () => {
    const far = new Date(NOW.getTime() + 10 * 60 * 1000).toISOString();
    const r = parseHaJsonMessage(jsonArgs({ last_updated: far }));
    expect(r.provenance.source).toBe("invalid");
    expect(r.reasons).toContain("future_timestamp");
  });
});

function reading(overrides: Partial<HaMetricReading>): HaMetricReading {
  const base = parseHaJsonMessage(jsonArgs()).readings[0];
  return { ...base, ...overrides };
}

describe("homeAssistantEcowittMqttAdapter — VPD pairing", () => {
  const tempOk = () => reading({});
  const rhOk = () =>
    parseHaJsonMessage(
      jsonArgs({ entity_id: "sensor.rh_out", state: 55, unit_of_measurement: "%" }),
    ).readings[0];

  it("11. valid same-tent, time-aligned temp/RH derives VPD", () => {
    const out = deriveVpdIfPaired({ temp: tempOk(), rh: rhOk() });
    expect("metric" in out).toBe(true);
    if ("metric" in out) {
      expect(out.metric).toBe("vpd_kpa");
      expect(out.value).toBeGreaterThan(0);
      expect(out.value).toBeLessThan(3);
    }
  });

  it("12. temp/RH outside pairing window does not derive VPD", () => {
    const rhLater = { ...rhOk(), captured_at: new Date(Date.parse(LIVE_ISO) + HA_VPD_PAIRING_WINDOW_MS + 1000).toISOString() };
    const out = deriveVpdIfPaired({ temp: tempOk(), rh: rhLater });
    expect("reason" in out && out.reason).toBe("vpd_pairing_window_missed");
  });

  it("13. different-tent temp/RH does not derive VPD", () => {
    const rhOther = parseHaJsonMessage(
      jsonArgs({ entity_id: "sensor.rh_other_tent", state: 55, unit_of_measurement: "%" }),
    ).readings[0];
    const out = deriveVpdIfPaired({ temp: tempOk(), rh: rhOther });
    expect("reason" in out && out.reason).toBe("vpd_different_tent");
  });

  it("14. invalid inputs never produce VPD", () => {
    const badTemp = { ...tempOk(), value: Number.NaN };
    const out = deriveVpdIfPaired({ temp: badTemp, rh: rhOk() });
    expect("reason" in out).toBe(true);
  });
});

describe("homeAssistantEcowittMqttAdapter — idempotency + config", () => {
  it("15. replayed identical message produces the same idempotency key", () => {
    const a = parseHaJsonMessage(jsonArgs({ retained: true })).readings[0];
    const b = parseHaJsonMessage(jsonArgs({ retained: true })).readings[0];
    expect(a.idempotency_key).toBe(b.idempotency_key);
    expect(a.idempotency_key).toBe(
      buildHaIdempotencyKey({
        bridge: "home_assistant",
        upstream_mode: "ha_core_ecowitt_push",
        tent_id: TENT,
        metric: "air_temp_f",
        captured_at: LIVE_ISO,
        value: 78.6,
      }),
    );
  });

  it("16. upstream_mode comes from config and is never inferred", () => {
    const iotMapping: HaMqttMappingFile = { ...mapping, upstream_mode: "ha_ecowitt_iot_poll" };
    const r = parseHaJsonMessage({ ...jsonArgs(), mapping: iotMapping });
    expect(r.provenance.upstream_mode).toBe("ha_ecowitt_iot_poll");
  });
});

describe("homeAssistantEcowittMqttAdapter — ecowitt_raw passthrough", () => {
  it("17. existing ecowitt_raw fixtures retain identical behavior", () => {
    const iso = LIVE_ISO;
    const dateutc = iso.replace("T", " ").replace(/\..+/, "");
    const rawMapping: HaMqttMappingFile = {
      ...mapping,
      bridge: "ecowitt2mqtt",
      upstream_mode: "ecowitt_custom_upload",
    };
    const { legacy, adapter } = parseEcowittRawMessage({
      topic: "ecowitt/grow",
      payload: {
        dateutc,
        tempf: 78.6,
        humidity: 56,
        co2: 720,
        stationtype: "GW1200",
      },
      mapping: rawMapping,
      receivedAt: NOW,
      retained: false,
      now: NOW,
    });
    expect(legacy.ok).toBe(true);
    expect(legacy.draft?.air_temp_f).toBeCloseTo(78.6, 2);
    expect(adapter.ok).toBe(true);
    expect(adapter.provenance.bridge).toBe("ecowitt2mqtt");
    expect(adapter.provenance.upstream_mode).toBe("ecowitt_custom_upload");
    // Every metric produced by the legacy normalizer is present as a reading.
    const metrics = adapter.readings.map((r) => r.metric).sort();
    expect(metrics).toContain("air_temp_f");
    expect(metrics).toContain("humidity_pct");
    expect(metrics).toContain("co2_ppm");
  });
});

describe("homeAssistantEcowittMqttAdapter — safety fences (static)", () => {
  const adapterSrc = readFileSync(
    resolve(process.cwd(), "src/lib/homeAssistantEcowittMqttAdapter.ts"),
    "utf8",
  );

  it("18. no MQTT publish, HA service, DB, alert, action queue, AI, or device control behavior", () => {
    for (const forbidden of [
      /mqtt\.publish/i,
      /\bpublish\s*\(/,
      /home[_-]?assistant.*services?\b/i,
      /supabase\./i,
      /createClient/i,
      /action[_-]?queue/i,
      /alert[_-]?queue/i,
      /ai[_-]?doctor/i,
      /device[_-]?control/i,
      /fan\.turn_on|light\.turn_on|switch\.turn_on/i,
    ]) {
      expect(adapterSrc, `must not contain ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("19. no service_role, bridge token, broker password, or private env leak in module", () => {
    for (const forbidden of [
      /service[_-]?role/i,
      /SUPABASE_SERVICE/i,
      /VERDANT_BRIDGE_TOKEN/i,
      /vbt_[a-z0-9]+/i,
      /ECOWITT_MQTT_PASSWORD/i,
      /HA_?LLAT|long[_-]?lived[_-]?access[_-]?token/i,
    ]) {
      expect(adapterSrc, `must not reference ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("20. deterministic output for repeated identical inputs", () => {
    const a = parseHaJsonMessage(jsonArgs());
    const b = parseHaJsonMessage(jsonArgs());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("homeAssistantEcowittMqttAdapter — statestream assembly", () => {
  it("assembles state + attributes into one message", () => {
    const asm = new HaStatestreamAssembler("homeassistant");
    const t = new Date(NOW.getTime() - 1000);
    const first = asm.consume({
      topic: "homeassistant/sensor/temp_out/state",
      payload: "\"78.6\"",
      retained: false,
      receivedAt: t,
    });
    expect(first?.state).toBe(78.6);
    const second = asm.consume({
      topic: "homeassistant/sensor/temp_out/attributes",
      payload: JSON.stringify({ unit_of_measurement: "°F", last_updated: LIVE_ISO }),
      retained: false,
      receivedAt: t,
    });
    expect(second).not.toBeNull();
    if (!second) return;
    const parsed = parseHaStatestreamMessage({ assembled: second, mapping, now: NOW });
    expect(parsed.ok).toBe(true);
    expect(parsed.readings[0].metric).toBe("air_temp_f");
    expect(parsed.readings[0].value).toBeCloseTo(78.6, 2);
  });

  it("drops control-shaped statestream entities", () => {
    const asm = new HaStatestreamAssembler("homeassistant");
    const m = asm.consume({
      topic: "homeassistant/switch/exhaust_fan/state",
      payload: "\"on\"",
      retained: false,
      receivedAt: NOW,
    });
    expect(m).not.toBeNull();
    if (!m) return;
    const r = parseHaStatestreamMessage({ assembled: m, mapping, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("control_shaped_entity_dropped");
  });
});
