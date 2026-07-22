/**
 * homeAssistantEcowittMqttAdapter — targeted tests.
 *
 * Covers: HA JSON envelope + boundary aliases, the REAL Statestream
 * separate-topic wire format (state / last_updated / last_changed /
 * per-attribute topics — no wire-level /attributes blob), timestamp
 * policy (source timestamp required; broker receive time never
 * substituted), the full idempotency preimage (provider | bridge |
 * upstream_mode | entity_id | tent_id | plant_id | channel | metric |
 * captured_at | value | unit), VPD pairing, the ecowitt_raw passthrough,
 * and static safety fences.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HaStatestreamAssembler,
  HA_PROVIDER,
  HA_IDEMPOTENCY_KEY_VERSION,
  buildHaIdempotencyKey,
  canonicalUnitForMetric,
  deriveVpdIfPaired,
  parseEcowittRawMessage,
  parseHaJsonMessage,
  parseHaStatestreamMessage,
  HA_VPD_PAIRING_WINDOW_MS,
  type HaAdapterResult,
  type HaIdempotencyPreimage,
  type HaMqttMappingFile,
  type HaMetricReading,
  type StatestreamAssembledMessage,
  type StatestreamPart,
} from "@/lib/homeAssistantEcowittMqttAdapter";

const TENT = "00000000-0000-0000-0000-0000000000aa";
const OTHER_TENT = "00000000-0000-0000-0000-0000000000bb";
const PLANT_A = "11111111-1111-4111-8111-111111111111";
const PLANT_B = "22222222-2222-4222-8222-222222222222";
const NOW = new Date("2026-07-22T18:00:30.000Z");
const LIVE_ISO = "2026-07-22T18:00:00.000Z";

const mapping: HaMqttMappingFile = {
  version: 1,
  bridge: "home_assistant",
  upstream_mode: "ha_core_ecowitt_push",
  statestream_topic_prefix: "homeassistant",
  entities: [
    { entity_id: "sensor.temp_out", metric: "air_temp_f", expected_unit: "°F", tent_id: TENT },
    { entity_id: "sensor.temp_out_b", metric: "air_temp_f", expected_unit: "°F", tent_id: TENT },
    { entity_id: "sensor.temp_out_c", metric: "air_temp_f", expected_unit: "°C", tent_id: TENT },
    { entity_id: "sensor.rh_out", metric: "humidity_pct", expected_unit: "%", tent_id: TENT },
    { entity_id: "sensor.rh_other_tent", metric: "humidity_pct", expected_unit: "%", tent_id: OTHER_TENT },
    { entity_id: "sensor.co2", metric: "co2_ppm", expected_unit: "ppm", tent_id: TENT },
    { entity_id: "sensor.soil_plant_a", metric: "soil_moisture_pct", expected_unit: "%", tent_id: TENT, plant_id: PLANT_A, channel: "pot" },
    { entity_id: "sensor.soil_plant_b", metric: "soil_moisture_pct", expected_unit: "%", tent_id: TENT, plant_id: PLANT_B, channel: "pot" },
  ],
};

function jsonArgs(overrides: Record<string, unknown> = {}) {
  const { topic, retained, ...payloadOverrides } = overrides;
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

/**
 * Alias-vs-canonical comparisons must ignore the raw wire echo
 * (`provenance.raw_payload` legitimately preserves the original payload
 * for audit) — everything else must be byte-identical.
 */
function comparableResult(r: HaAdapterResult): HaAdapterResult {
  const clean = JSON.parse(JSON.stringify(r)) as HaAdapterResult;
  (clean.provenance as unknown as Record<string, unknown>).raw_payload = null;
  for (const rd of clean.readings) {
    (rd.provenance as unknown as Record<string, unknown>).raw_payload = null;
  }
  return clean;
}

// ---------------------------------------------------------------------------
// Statestream fixture loading (official separate-topic wire fixtures)
// ---------------------------------------------------------------------------

interface FixturePart {
  topic: string;
  payload: string;
  retained: boolean;
  receivedAt: string;
}
interface FixtureScenario {
  description: string;
  parts: FixturePart[];
}
const SS_FIXTURE = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/home-assistant-ecowitt-mqtt/ha-statestream-scenarios.json"),
    "utf8",
  ),
) as { prefix: string; scenarios: Record<string, FixtureScenario> };

const ssMapping: HaMqttMappingFile = {
  version: 1,
  bridge: "home_assistant",
  upstream_mode: "ha_core_ecowitt_push",
  statestream_topic_prefix: SS_FIXTURE.prefix,
  entities: [
    { entity_id: "sensor.flower_tent_temperature", metric: "air_temp_f", expected_unit: "°F", tent_id: TENT },
    { entity_id: "sensor.flower_tent_temperature_c", metric: "air_temp_f", expected_unit: "°C", tent_id: TENT },
    { entity_id: "sensor.flower_tent_soil_1", metric: "soil_moisture_pct", expected_unit: "%", tent_id: TENT, channel: "soil_1" },
    { entity_id: "sensor.flower_tent_soil_2", metric: "soil_moisture_pct", expected_unit: "%", tent_id: TENT, channel: "soil_2" },
  ],
};

/** Feed every part of a fixture scenario; return final snapshot per entity. */
function assembleScenario(name: string): Map<string, StatestreamAssembledMessage> {
  const scen = SS_FIXTURE.scenarios[name];
  expect(scen, `fixture scenario ${name} missing`).toBeTruthy();
  const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
  const out = new Map<string, StatestreamAssembledMessage>();
  for (const p of scen.parts) {
    const m = asm.consume({
      topic: p.topic,
      payload: p.payload,
      retained: p.retained,
      receivedAt: new Date(p.receivedAt),
    });
    if (m) out.set(m.entity_id, m);
  }
  return out;
}

function part(
  topic: string,
  payload: unknown,
  opts: { retained?: boolean; receivedAt?: Date } = {},
): StatestreamPart {
  return {
    topic,
    payload,
    retained: opts.retained ?? false,
    receivedAt: opts.receivedAt ?? new Date(NOW.getTime() - 1000),
  };
}

describe("homeAssistantEcowittMqttAdapter — HA JSON envelope", () => {
  it("1. HA JSON °F temperature normalizes correctly", () => {
    const r = parseHaJsonMessage(jsonArgs());
    expect(r.ok).toBe(true);
    expect(r.readings).toHaveLength(1);
    expect(r.readings[0].metric).toBe("air_temp_f");
    expect(r.readings[0].value).toBeCloseTo(78.6, 2);
    expect(r.readings[0].entity_id).toBe("sensor.temp_out");
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

describe("homeAssistantEcowittMqttAdapter — HA JSON boundary aliases", () => {
  it("11. `value` alias normalizes identically to `state`", () => {
    const viaState = parseHaJsonMessage(jsonArgs());
    const viaValue = parseHaJsonMessage(jsonArgs({ state: undefined, value: "78.6" }));
    expect(viaValue.ok).toBe(true);
    expect(JSON.stringify(comparableResult(viaValue))).toBe(
      JSON.stringify(comparableResult(viaState)),
    );
    expect(viaValue.readings[0].idempotency_key).toBe(viaState.readings[0].idempotency_key);
  });

  it("12. `unit` alias normalizes identically to `unit_of_measurement`", () => {
    const viaCanonical = parseHaJsonMessage(
      jsonArgs({ entity_id: "sensor.temp_out_c", state: 25, unit_of_measurement: "°C" }),
    );
    const viaAlias = parseHaJsonMessage(
      jsonArgs({
        entity_id: "sensor.temp_out_c",
        state: 25,
        unit_of_measurement: undefined,
        unit: "°C",
      }),
    );
    expect(viaAlias.ok).toBe(true);
    expect(viaAlias.readings[0].value).toBeCloseTo(77, 1);
    expect(JSON.stringify(comparableResult(viaAlias))).toBe(
      JSON.stringify(comparableResult(viaCanonical)),
    );
  });

  it("13. canonical fields win when both canonical and alias are present", () => {
    const r = parseHaJsonMessage(
      jsonArgs({ state: "78.6", value: "212", unit_of_measurement: "°F", unit: "°C" }),
    );
    expect(r.ok).toBe(true);
    // state (78.6) wins over value (212); °F wins over °C (no conversion).
    expect(r.readings[0].value).toBeCloseTo(78.6, 2);
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

  it("14. valid same-tent, time-aligned temp/RH derives VPD", () => {
    const out = deriveVpdIfPaired({ temp: tempOk(), rh: rhOk() });
    expect("metric" in out).toBe(true);
    if ("metric" in out) {
      expect(out.metric).toBe("vpd_kpa");
      expect(out.value).toBeGreaterThan(0);
      expect(out.value).toBeLessThan(3);
    }
  });

  it("15. temp/RH outside pairing window does not derive VPD", () => {
    const rhLater = { ...rhOk(), captured_at: new Date(Date.parse(LIVE_ISO) + HA_VPD_PAIRING_WINDOW_MS + 1000).toISOString() };
    const out = deriveVpdIfPaired({ temp: tempOk(), rh: rhLater });
    expect("reason" in out && out.reason).toBe("vpd_pairing_window_missed");
  });

  it("16. different-tent temp/RH does not derive VPD", () => {
    const rhOther = parseHaJsonMessage(
      jsonArgs({ entity_id: "sensor.rh_other_tent", state: 55, unit_of_measurement: "%" }),
    ).readings[0];
    const out = deriveVpdIfPaired({ temp: tempOk(), rh: rhOther });
    expect("reason" in out && out.reason).toBe("vpd_different_tent");
  });

  it("17. invalid inputs never produce VPD", () => {
    const badTemp = { ...tempOk(), value: Number.NaN };
    const out = deriveVpdIfPaired({ temp: badTemp, rh: rhOk() });
    expect("reason" in out).toBe(true);
  });
});

describe("homeAssistantEcowittMqttAdapter — idempotency preimage + config", () => {
  it("18. replayed identical message produces the same idempotency key", () => {
    const a = parseHaJsonMessage(jsonArgs({ retained: true })).readings[0];
    const b = parseHaJsonMessage(jsonArgs({ retained: true })).readings[0];
    expect(a.idempotency_key).toBe(b.idempotency_key);
    expect(a.idempotency_key).toBe(
      buildHaIdempotencyKey({
        provider: HA_PROVIDER,
        bridge: "home_assistant",
        upstream_mode: "ha_core_ecowitt_push",
        entity_id: "sensor.temp_out",
        tent_id: TENT,
        plant_id: null,
        channel: null,
        metric: "air_temp_f",
        captured_at: LIVE_ISO,
        value: 78.6,
        unit: "°F",
      }),
    );
    expect(a.idempotency_key.startsWith(`${HA_IDEMPOTENCY_KEY_VERSION}|`)).toBe(true);
  });

  it("19. every preimage dimension changes the key; exact replay does not", () => {
    const base: HaIdempotencyPreimage = {
      provider: HA_PROVIDER,
      bridge: "home_assistant",
      upstream_mode: "ha_core_ecowitt_push",
      entity_id: "sensor.soil_plant_a",
      tent_id: TENT,
      plant_id: PLANT_A,
      channel: "pot",
      metric: "soil_moisture_pct",
      captured_at: LIVE_ISO,
      value: 41,
      unit: "%",
    };
    // Exact replay → identical key.
    expect(buildHaIdempotencyKey({ ...base })).toBe(buildHaIdempotencyKey({ ...base }));
    // Each single-dimension mutation → unique key.
    const variants: Array<Partial<HaIdempotencyPreimage>> = [
      { provider: "other_provider" },
      { bridge: "ecowitt2mqtt" },
      { upstream_mode: "ha_ecowitt_iot_poll" },
      { entity_id: "sensor.soil_plant_b" },
      { tent_id: OTHER_TENT },
      { plant_id: PLANT_B },
      { plant_id: null },
      { channel: "pot_2" },
      { channel: null },
      { metric: "humidity_pct" },
      { captured_at: "2026-07-22T18:00:01.000Z" },
      { value: 41.001 },
      { unit: "ppm" },
    ];
    const keys = new Set(variants.map((v) => buildHaIdempotencyKey({ ...base, ...v })));
    keys.add(buildHaIdempotencyKey(base));
    expect(keys.size).toBe(variants.length + 1);
  });

  it("20. same timestamp+value on a different entity never collides", () => {
    const a = parseHaJsonMessage(jsonArgs());
    const b = parseHaJsonMessage(jsonArgs({ entity_id: "sensor.temp_out_b" }));
    expect(a.ok && b.ok).toBe(true);
    expect(a.readings[0].value).toBe(b.readings[0].value);
    expect(a.readings[0].captured_at).toBe(b.readings[0].captured_at);
    expect(a.readings[0].idempotency_key).not.toBe(b.readings[0].idempotency_key);
  });

  it("21. same timestamp+value on a different plant never collides", () => {
    const a = parseHaJsonMessage(
      jsonArgs({ entity_id: "sensor.soil_plant_a", state: 41, unit_of_measurement: "%" }),
    );
    const b = parseHaJsonMessage(
      jsonArgs({ entity_id: "sensor.soil_plant_b", state: 41, unit_of_measurement: "%" }),
    );
    expect(a.ok && b.ok).toBe(true);
    expect(a.readings[0].plant_id).toBe(PLANT_A);
    expect(b.readings[0].plant_id).toBe(PLANT_B);
    expect(a.readings[0].value).toBe(b.readings[0].value);
    expect(a.readings[0].captured_at).toBe(b.readings[0].captured_at);
    expect(a.readings[0].idempotency_key).not.toBe(b.readings[0].idempotency_key);
    // The plant dimension itself must differ inside the keys.
    expect(a.readings[0].idempotency_key).toContain(PLANT_A);
    expect(b.readings[0].idempotency_key).toContain(PLANT_B);
  });

  it("22. same timestamp+value on a different soil channel never collides (fixture)", () => {
    const byEntity = assembleScenario("soil_channels_identical");
    const a = parseHaStatestreamMessage({
      assembled: byEntity.get("sensor.flower_tent_soil_1")!,
      mapping: ssMapping,
      now: NOW,
    });
    const b = parseHaStatestreamMessage({
      assembled: byEntity.get("sensor.flower_tent_soil_2")!,
      mapping: ssMapping,
      now: NOW,
    });
    expect(a.ok && b.ok).toBe(true);
    expect(a.readings[0].value).toBe(b.readings[0].value);
    expect(a.readings[0].captured_at).toBe(b.readings[0].captured_at);
    expect(a.readings[0].channel).toBe("soil_1");
    expect(b.readings[0].channel).toBe("soil_2");
    expect(a.readings[0].idempotency_key).not.toBe(b.readings[0].idempotency_key);
  });

  it("23. upstream_mode comes from config and is never inferred", () => {
    const iotMapping: HaMqttMappingFile = { ...mapping, upstream_mode: "ha_ecowitt_iot_poll" };
    const r = parseHaJsonMessage({ ...jsonArgs(), mapping: iotMapping });
    expect(r.provenance.upstream_mode).toBe("ha_ecowitt_iot_poll");
  });
});

describe("homeAssistantEcowittMqttAdapter — ecowitt_raw passthrough", () => {
  it("24. existing ecowitt_raw fixtures retain identical behavior", () => {
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

describe("homeAssistantEcowittMqttAdapter — statestream separate-topic wire format", () => {
  it("25. state + separate last_updated topics assemble into a live reading", () => {
    const assembled = assembleScenario("separate_topics").get("sensor.flower_tent_temperature");
    expect(assembled).toBeTruthy();
    if (!assembled) return;
    expect(assembled.last_updated).toBe(LIVE_ISO);
    const r = parseHaStatestreamMessage({ assembled, mapping: ssMapping, now: NOW });
    expect(r.ok).toBe(true);
    expect(r.provenance.source).toBe("live");
    expect(r.readings[0].metric).toBe("air_temp_f");
    expect(r.readings[0].value).toBeCloseTo(78.6, 2);
    expect(r.readings[0].captured_at).toBe(LIVE_ISO);
    expect(r.readings[0].entity_id).toBe("sensor.flower_tent_temperature");
  });

  it("26. separate unit_of_measurement topic is consumed (°C converts to °F)", () => {
    const assembled = assembleScenario("separate_unit_c").get("sensor.flower_tent_temperature_c");
    expect(assembled).toBeTruthy();
    if (!assembled) return;
    expect(assembled.attribute_cache.unit_of_measurement).toBe("°C");
    const r = parseHaStatestreamMessage({ assembled, mapping: ssMapping, now: NOW });
    expect(r.ok).toBe(true);
    expect(r.readings[0].value).toBeCloseTo(77, 1);

    // A bare `unit` suffix is accepted as a boundary alias with the same
    // outcome; the canonical suffix wins when both were seen.
    const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
    asm.consume(part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature_c/state`, "25"));
    asm.consume(
      part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature_c/last_updated`, LIVE_ISO),
    );
    const viaAlias = asm.consume(
      part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature_c/unit`, "°C"),
    );
    expect(viaAlias).toBeTruthy();
    if (!viaAlias) return;
    const rAlias = parseHaStatestreamMessage({ assembled: viaAlias, mapping: ssMapping, now: NOW });
    expect(rAlias.ok).toBe(true);
    expect(rAlias.readings[0].value).toBeCloseTo(77, 1);
  });

  it("27. no literal /attributes topic is required by the wire contract", () => {
    for (const scen of Object.values(SS_FIXTURE.scenarios)) {
      for (const p of scen.parts) {
        expect(p.topic.endsWith("/attributes")).toBe(false);
      }
    }
    // And the official fixture assembles + parses live without one.
    const assembled = assembleScenario("separate_topics").get("sensor.flower_tent_temperature");
    const r = parseHaStatestreamMessage({ assembled: assembled!, mapping: ssMapping, now: NOW });
    expect(r.ok).toBe(true);
    expect(r.provenance.source).toBe("live");
  });

  it("28. out-of-order arrival assembles to the identical result", () => {
    const inOrder = assembleScenario("separate_topics").get("sensor.flower_tent_temperature");
    const outOfOrder = assembleScenario("out_of_order").get("sensor.flower_tent_temperature");
    expect(inOrder && outOfOrder).toBeTruthy();
    // Sanity: the two fixtures carry the same topic set.
    const topics = (n: string) => SS_FIXTURE.scenarios[n].parts.map((p) => p.topic).sort();
    expect(topics("out_of_order")).toEqual(topics("separate_topics"));
    const a = parseHaStatestreamMessage({ assembled: inOrder!, mapping: ssMapping, now: NOW });
    const b = parseHaStatestreamMessage({ assembled: outOfOrder!, mapping: ssMapping, now: NOW });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(b.ok).toBe(true);
  });

  it("29. state without any source timestamp is invalid, never live", () => {
    const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
    const assembled = asm.consume(
      part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/state`, "78.6"),
    );
    expect(assembled).toBeTruthy();
    if (!assembled) return;
    const r = parseHaStatestreamMessage({ assembled, mapping: ssMapping, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.provenance.source).toBe("invalid");
    expect(r.reasons).toContain("missing_captured_at");
    expect(r.readings).toHaveLength(0);
  });

  it("30. retained state without source timestamp is never live (fixture)", () => {
    const assembled = assembleScenario("retained_state_without_timestamp").get(
      "sensor.flower_tent_temperature",
    );
    expect(assembled).toBeTruthy();
    if (!assembled) return;
    expect(assembled.state_retained).toBe(true);
    const r = parseHaStatestreamMessage({
      assembled,
      mapping: ssMapping,
      brokerReceivedAt: NOW,
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.provenance.source).toBe("invalid");
    expect(r.reasons).toContain("retained_without_source_timestamp");
    expect(r.readings).toHaveLength(0);
  });

  it("31. JSON-quoted numeric state parses identically to the bare form", () => {
    const run = (statePayload: string) => {
      const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
      asm.consume(part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/state`, statePayload));
      const assembled = asm.consume(
        part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/last_updated`, `"${LIVE_ISO}"`),
      );
      return parseHaStatestreamMessage({ assembled: assembled!, mapping: ssMapping, now: NOW });
    };
    const quoted = run("\"78.6\"");
    const bare = run("78.6");
    expect(quoted.ok).toBe(true);
    expect(quoted.readings[0].value).toBeCloseTo(78.6, 2);
    // Identical normalized output; only the raw wire echo may differ
    // (quoted vs bare original payload is preserved for audit).
    expect(JSON.stringify(comparableResult(quoted))).toBe(
      JSON.stringify(comparableResult(bare)),
    );
    expect(quoted.readings[0].idempotency_key).toBe(bare.readings[0].idempotency_key);
  });

  it("32. unknown statestream entity is ignored with unknown_entity", () => {
    const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
    asm.consume(part(`${SS_FIXTURE.prefix}/sensor/mystery_probe/state`, "50"));
    const assembled = asm.consume(
      part(`${SS_FIXTURE.prefix}/sensor/mystery_probe/last_updated`, `"${LIVE_ISO}"`),
    );
    expect(assembled).toBeTruthy();
    if (!assembled) return;
    const r = parseHaStatestreamMessage({ assembled, mapping: ssMapping, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("unknown_entity");
    expect(r.readings).toHaveLength(0);
    expect(r.provenance.tent_id).toBeNull();
  });

  it("33. unknown attribute suffixes are cached deterministically as evidence", () => {
    const assembled = assembleScenario("separate_topics").get("sensor.flower_tent_temperature");
    expect(assembled?.attribute_cache.device_class).toBe("temperature");
    // Last write per suffix wins — a later update replaces the cached value.
    const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
    asm.consume(part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/state`, "78.6"));
    asm.consume(part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/mystery_attr`, "one"));
    const updated = asm.consume(
      part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/mystery_attr`, "two"),
    );
    expect(updated?.attribute_cache.mystery_attr).toBe("two");
    // Unknown suffixes never become readings or flip validity rules.
    const r = parseHaStatestreamMessage({ assembled: updated!, mapping: ssMapping, now: NOW });
    expect(r.reasons).toContain("missing_captured_at");
  });

  it("34. last_updated is preferred; last_changed is the documented fallback only", () => {
    const earlier = "2026-07-22T17:59:30.000Z";
    const both = (() => {
      const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
      asm.consume(part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/state`, "78.6"));
      asm.consume(
        part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/last_changed`, `"${earlier}"`),
      );
      return asm.consume(
        part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/last_updated`, `"${LIVE_ISO}"`),
      );
    })();
    const rBoth = parseHaStatestreamMessage({ assembled: both!, mapping: ssMapping, now: NOW });
    expect(rBoth.ok).toBe(true);
    expect(rBoth.readings[0].captured_at).toBe(LIVE_ISO);

    const fallbackOnly = (() => {
      const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
      asm.consume(part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/state`, "78.6"));
      return asm.consume(
        part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/last_changed`, `"${earlier}"`),
      );
    })();
    const rFallback = parseHaStatestreamMessage({
      assembled: fallbackOnly!,
      mapping: ssMapping,
      now: NOW,
    });
    expect(rFallback.ok).toBe(true);
    expect(rFallback.readings[0].captured_at).toBe(earlier);
  });

  it("35. broker receive time is never substituted for captured_at (audit only)", () => {
    const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
    const assembled = asm.consume(
      part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/state`, "78.6"),
    );
    const r = parseHaStatestreamMessage({
      assembled: assembled!,
      mapping: ssMapping,
      brokerReceivedAt: NOW,
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.provenance.source).toBe("invalid");
    expect(r.provenance.captured_at).toBeNull();
    // Broker receive time is preserved separately, for audit only.
    expect(r.provenance.broker_received_at).toBe(NOW.toISOString());
  });

  it("36. legacy /attributes blob is optional compat; dedicated topics win", () => {
    const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
    asm.consume(part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/state`, "78.6"));
    const viaBlob = asm.consume(
      part(
        `${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/attributes`,
        JSON.stringify({
          unit_of_measurement: "°F",
          last_updated: LIVE_ISO,
          friendly_name: "Flower tent temperature",
        }),
      ),
    );
    expect(viaBlob).toBeTruthy();
    if (!viaBlob) return;
    // Blob fills gaps (compat) but is never required.
    const rBlob = parseHaStatestreamMessage({ assembled: viaBlob, mapping: ssMapping, now: NOW });
    expect(rBlob.ok).toBe(true);
    expect(rBlob.readings[0].captured_at).toBe(LIVE_ISO);
    expect(viaBlob.attribute_cache.friendly_name).toBe("Flower tent temperature");
    // A dedicated suffix topic always wins over the blob value.
    const laterIso = "2026-07-22T18:00:05.000Z";
    const viaDedicated = asm.consume(
      part(`${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/last_updated`, `"${laterIso}"`),
    );
    const rDedicated = parseHaStatestreamMessage({
      assembled: viaDedicated!,
      mapping: ssMapping,
      now: NOW,
    });
    expect(rDedicated.readings[0].captured_at).toBe(laterIso);
  });

  it("37. drops control-shaped statestream entities", () => {
    const asm = new HaStatestreamAssembler(SS_FIXTURE.prefix);
    asm.consume(part(`${SS_FIXTURE.prefix}/switch/exhaust_fan/state`, "\"on\""));
    const m = asm.consume(
      part(`${SS_FIXTURE.prefix}/switch/exhaust_fan/last_updated`, `"${LIVE_ISO}"`),
    );
    expect(m).not.toBeNull();
    if (!m) return;
    const r = parseHaStatestreamMessage({ assembled: m, mapping: ssMapping, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("control_shaped_entity_dropped");
  });
});

describe("homeAssistantEcowittMqttAdapter — safety fences (static)", () => {
  const adapterSrcRaw = readFileSync(
    resolve(process.cwd(), "src/lib/homeAssistantEcowittMqttAdapter.ts"),
    "utf8",
  );
  // Strip comments so doc-comment prose that describes forbidden things
  // (e.g. "no device control") doesn't false-positive.
  const adapterSrc = adapterSrcRaw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

  it("38. no MQTT publish, HA service, DB, alert, action queue, AI, or device control behavior", () => {
    for (const forbidden of [
      /mqtt\.publish\s*\(/i,
      /\.publish\s*\(/,
      /homeassistant\.services?\s*\(/i,
      /\bsupabase\./i,
      /createClient\s*\(/,
      /action[_-]?queue/i,
      /alertQueue/i,
      /sendAlert/i,
      /aiDoctor/i,
      /deviceControl/i,
      /device[_-]control/i,
      /triggerAutomation/i,
      /fan\.turn_on|light\.turn_on|switch\.turn_on/i,
    ]) {
      expect(adapterSrc, `must not contain ${forbidden}`).not.toMatch(forbidden);
    }
  });

  it("39. no service_role, bridge token, broker password, or private env leak in module", () => {
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

  it("40. no secret/token values in fixtures, adapter output, or logs", () => {
    const SECRET_PATTERNS = [
      /password/i,
      /passkey/i,
      /service[_-]?role/i,
      /vbt_[a-z0-9]+/i,
      /sk_live_/i,
      /Bearer\s+ey/i,
      /eyJ[A-Za-z0-9_-]{20,}/,
      /VERDANT_BRIDGE_TOKEN/i,
      /SUPABASE_SERVICE/i,
      /long[_-]?lived/i,
    ];
    const fixtureFiles = [
      "fixtures/home-assistant-ecowitt-mqtt/ha-statestream-scenarios.json",
      "fixtures/home-assistant-ecowitt-mqtt/ha-statestream-sample.json",
      "fixtures/home-assistant-ecowitt-mqtt/ha-json-sample.json",
      "fixtures/home-assistant-ecowitt-mqtt/example-mapping.json",
    ];
    for (const f of fixtureFiles) {
      const text = readFileSync(resolve(process.cwd(), f), "utf8");
      for (const re of SECRET_PATTERNS) {
        expect(text, `${f} must not contain ${re}`).not.toMatch(re);
      }
    }
    // Every fixture scenario's full adapter output must also be clean.
    for (const name of Object.keys(SS_FIXTURE.scenarios)) {
      for (const assembled of assembleScenario(name).values()) {
        const out = JSON.stringify(
          parseHaStatestreamMessage({ assembled, mapping: ssMapping, now: NOW }),
        );
        for (const re of SECRET_PATTERNS) {
          expect(out, `scenario ${name} output must not contain ${re}`).not.toMatch(re);
        }
      }
    }
    // The adapter never logs — no console usage anywhere in the module.
    expect(adapterSrc).not.toMatch(/console\.(log|info|warn|error|debug|trace)\s*\(/);
  });

  it("41. deterministic output for repeated identical inputs", () => {
    const a = parseHaJsonMessage(jsonArgs());
    const b = parseHaJsonMessage(jsonArgs());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("42. canonical units are stable per metric", () => {
    expect(canonicalUnitForMetric("air_temp_f")).toBe("°F");
    expect(canonicalUnitForMetric("soil_temp_f")).toBe("°F");
    expect(canonicalUnitForMetric("humidity_pct")).toBe("%");
    expect(canonicalUnitForMetric("soil_moisture_pct")).toBe("%");
    expect(canonicalUnitForMetric("co2_ppm")).toBe("ppm");
    expect(canonicalUnitForMetric("vpd_kpa")).toBe("kPa");
  });
});
