/**
 * End-to-end runner tests for the HA adapter modes.
 *
 * Feeds the official Statestream separate-topic wire fixtures and HA
 * JSON envelopes through the runner's dry-run pipeline
 * (handleHaMessage / handleIncomingMqttMessage) and pins:
 *   - assembled deterministic readings with hav2 idempotency keys built
 *     by the adapter's builder
 *   - in-order vs out-of-order equivalence
 *   - retained-without-timestamp → invalid, never live
 *   - twin soil channels → distinct hav2 keys in the dry-run report
 *   - unknown entities counted (unknown_entity), never dropped silently
 *   - ha_json boundary alias normalization (state|value, unit aliases)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createHaDryRunState,
  handleHaMessage,
  handleIncomingMqttMessage,
  resolveRunnerModeConfig,
  buildHaAttemptReport,
  type HaDryRunReport,
  type HaDryRunState,
  type RunnerModeConfig,
} from "../../scripts/dev/ecowitt-mqtt-runner";
import {
  HA_IDEMPOTENCY_KEY_VERSION,
  HA_PROVIDER,
  buildHaIdempotencyKey,
} from "@/lib/homeAssistantEcowittMqttAdapter";

const TENT = "00000000-0000-0000-0000-0000000000aa";
const NOW = new Date("2026-07-22T18:00:30.000Z");
const LIVE_ISO = "2026-07-22T18:00:00.000Z";

const SS_MAPPING_PATH = resolve(
  process.cwd(),
  "fixtures/home-assistant-ecowitt-mqtt/runner-statestream-mapping.json",
);
const JSON_MAPPING_PATH = resolve(
  process.cwd(),
  "fixtures/home-assistant-ecowitt-mqtt/example-mapping.json",
);

interface FixturePart {
  topic: string;
  payload: string;
  retained: boolean;
  receivedAt: string;
}
const SS_FIXTURE = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "fixtures/home-assistant-ecowitt-mqtt/ha-statestream-scenarios.json"),
    "utf8",
  ),
) as { prefix: string; scenarios: Record<string, { parts: FixturePart[] }> };

function ssConfig(): RunnerModeConfig {
  return resolveRunnerModeConfig({
    UPSTREAM_MODE: "ha_statestream",
    HA_MQTT_MAPPING_PATH: SS_MAPPING_PATH,
  } as NodeJS.ProcessEnv);
}

function jsonConfig(): RunnerModeConfig {
  return resolveRunnerModeConfig({
    UPSTREAM_MODE: "ha_json",
    HA_MQTT_MAPPING_PATH: JSON_MAPPING_PATH,
  } as NodeJS.ProcessEnv);
}

function feedScenario(
  name: string,
  config: RunnerModeConfig,
  state: HaDryRunState,
): HaDryRunReport[] {
  const scen = SS_FIXTURE.scenarios[name];
  expect(scen, `fixture scenario ${name} missing`).toBeTruthy();
  return scen.parts.map((p) =>
    handleHaMessage({
      topic: p.topic,
      payloadText: p.payload,
      retained: p.retained,
      receivedAt: new Date(p.receivedAt),
      config,
      state,
      now: NOW,
    }),
  );
}

describe("ecowitt-mqtt-runner — ha_statestream end-to-end (dry-run)", () => {
  it("assembles the in-order fixture into a live reading with a hav2 key", () => {
    const config = ssConfig();
    const state = createHaDryRunState(config);
    const reports = feedScenario("separate_topics", config, state);

    // Every part is accounted for — nothing dropped silently.
    expect(reports).toHaveLength(SS_FIXTURE.scenarios.separate_topics.parts.length);
    expect(state.messagesConsumed).toBe(reports.length);

    const final = reports[reports.length - 1];
    expect(final.mode).toBe("ha_statestream");
    expect(final.dry_run).toBe(true);
    expect(final.posted).toBe(false);
    expect(final.outcome).toBe("reading");
    expect(final.source).toBe("live");
    expect(final.readings).toHaveLength(1);
    const reading = final.readings[0];
    expect(reading.metric).toBe("air_temp_f");
    expect(reading.value).toBeCloseTo(78.6, 2);
    expect(reading.entity_id).toBe("sensor.flower_tent_temperature");
    expect(reading.tent_id).toBe(TENT);
    expect(reading.captured_at).toBe(LIVE_ISO);
    expect(reading.idempotency_key.startsWith(`${HA_IDEMPOTENCY_KEY_VERSION}|`)).toBe(true);

    // The key is EXACTLY the adapter's hav2 builder output.
    expect(reading.idempotency_key).toBe(
      buildHaIdempotencyKey({
        provider: HA_PROVIDER,
        bridge: "home_assistant",
        upstream_mode: "ha_core_ecowitt_push",
        entity_id: "sensor.flower_tent_temperature",
        tent_id: TENT,
        plant_id: null,
        channel: null,
        metric: "air_temp_f",
        captured_at: LIVE_ISO,
        value: 78.6,
        unit: "°F",
      }),
    );

    // Replays of the same assembled reading are deduped by hav2 key.
    expect(state.readingsEmitted).toBe(1);
    expect(state.idempotencyKeys).toHaveLength(1);
  });

  it("out-of-order arrival produces the identical reading and identical hav2 key", () => {
    const configA = ssConfig();
    const stateA = createHaDryRunState(configA);
    const inOrder = feedScenario("separate_topics", configA, stateA);

    const configB = ssConfig();
    const stateB = createHaDryRunState(configB);
    const outOfOrder = feedScenario("out_of_order", configB, stateB);

    const finalA = inOrder[inOrder.length - 1];
    const finalB = outOfOrder[outOfOrder.length - 1];
    expect(finalB.outcome).toBe("reading");
    expect(finalB.readings).toEqual(finalA.readings);
    expect(stateB.idempotencyKeys).toEqual(stateA.idempotencyKeys);
    expect(stateB.readingsEmitted).toBe(1);
  });

  it("retained state without a source timestamp is invalid, counted, never live", () => {
    const config = ssConfig();
    const state = createHaDryRunState(config);
    const reports = feedScenario("retained_state_without_timestamp", config, state);

    for (const r of reports) {
      expect(r.outcome).not.toBe("reading");
      expect(r.readings).toHaveLength(0);
    }
    const final = reports[reports.length - 1];
    expect(final.source).toBe("invalid");
    expect(final.reasons).toContain("retained_without_source_timestamp");
    expect(final.reason_counts.retained_without_source_timestamp).toBeGreaterThanOrEqual(1);
    expect(state.readingsEmitted).toBe(0);
    expect(state.idempotencyKeys).toHaveLength(0);
  });

  it("twin soil channels with identical value+timestamp yield DISTINCT hav2 keys in the report", () => {
    const config = ssConfig();
    const state = createHaDryRunState(config);
    const reports = feedScenario("soil_channels_identical", config, state);

    const readingReports = reports.filter((r) => r.outcome === "reading");
    expect(readingReports.length).toBeGreaterThanOrEqual(2);
    expect(state.readingsEmitted).toBe(2);
    expect(state.idempotencyKeys).toHaveLength(2);
    const [k1, k2] = state.idempotencyKeys;
    expect(k1).not.toBe(k2);

    const all = readingReports.flatMap((r) => r.readings);
    const soil1 = all.find((r) => r.entity_id === "sensor.flower_tent_soil_1");
    const soil2 = all.find((r) => r.entity_id === "sensor.flower_tent_soil_2");
    expect(soil1 && soil2).toBeTruthy();
    expect(soil1!.value).toBe(soil2!.value);
    expect(soil1!.captured_at).toBe(soil2!.captured_at);
    expect(soil1!.channel).toBe("soil_1");
    expect(soil2!.channel).toBe("soil_2");
    expect(soil1!.idempotency_key).not.toBe(soil2!.idempotency_key);
  });

  it("celsius entity consumes the separate unit topic (25 °C → 77 °F)", () => {
    const config = ssConfig();
    const state = createHaDryRunState(config);
    const reports = feedScenario("separate_unit_c", config, state);
    const final = reports[reports.length - 1];
    expect(final.outcome).toBe("reading");
    expect(final.readings[0].value).toBeCloseTo(77, 1);
  });

  it("unknown statestream entities are rejected with unknown_entity and counted, never dropped silently", () => {
    const config = ssConfig();
    const state = createHaDryRunState(config);
    const prefix = SS_FIXTURE.prefix;
    handleHaMessage({
      topic: `${prefix}/sensor/mystery_probe/state`,
      payloadText: "50",
      retained: false,
      receivedAt: new Date(NOW.getTime() - 1000),
      config,
      state,
      now: NOW,
    });
    const final = handleHaMessage({
      topic: `${prefix}/sensor/mystery_probe/last_updated`,
      payloadText: `"${LIVE_ISO}"`,
      retained: false,
      receivedAt: new Date(NOW.getTime() - 900),
      config,
      state,
      now: NOW,
    });
    expect(final.outcome).toBe("rejected");
    expect(final.reasons).toContain("unknown_entity");
    expect(final.reason_counts.unknown_entity).toBeGreaterThanOrEqual(1);
    expect(final.readings).toHaveLength(0);
    expect(state.readingsEmitted).toBe(0);
  });

  it("parts outside the configured prefix are counted as ignored — not raw-parsed, not dropped silently", () => {
    const config = ssConfig();
    const state = createHaDryRunState(config);
    const report = handleHaMessage({
      topic: "ecowitt/grow",
      payloadText: JSON.stringify({ dateutc: "2026-07-22 18:00:00", tempf: 78.6 }),
      retained: false,
      receivedAt: NOW,
      config,
      state,
      now: NOW,
    });
    expect(report.outcome).toBe("ignored");
    expect(report.reasons).toContain("statestream_topic_ignored");
    expect(report.reason_counts.statestream_topic_ignored).toBe(1);
    expect(report.readings).toHaveLength(0);
  });

  it("buffered attribute-first parts are accounted for in the report", () => {
    const config = ssConfig();
    const state = createHaDryRunState(config);
    const report = handleHaMessage({
      topic: `${SS_FIXTURE.prefix}/sensor/flower_tent_temperature/unit_of_measurement`,
      payloadText: "°F",
      retained: false,
      receivedAt: NOW,
      config,
      state,
      now: NOW,
    });
    expect(report.outcome).toBe("buffered");
    expect(report.reason_counts.statestream_part_buffered).toBe(1);
  });
});

describe("ecowitt-mqtt-runner — ha_json end-to-end (dry-run)", () => {
  const ENTITY = "sensor.ecowitt_gw1200_outdoor_temperature";

  function envelope(overrides: Record<string, unknown> = {}): string {
    return JSON.stringify({
      entity_id: ENTITY,
      state: "78.6",
      unit_of_measurement: "°F",
      last_updated: LIVE_ISO,
      ...overrides,
    });
  }

  function feedJson(payloadText: string, state: HaDryRunState, config: RunnerModeConfig) {
    return handleHaMessage({
      topic: "verdant/ha_json/ingest",
      payloadText,
      retained: false,
      receivedAt: NOW,
      config,
      state,
      now: NOW,
    });
  }

  it("a canonical HA JSON envelope produces a live reading with the adapter's hav2 key", () => {
    const config = jsonConfig();
    const state = createHaDryRunState(config);
    const report = feedJson(envelope(), state, config);
    expect(report.mode).toBe("ha_json");
    expect(report.outcome).toBe("reading");
    expect(report.source).toBe("live");
    expect(report.readings).toHaveLength(1);
    const reading = report.readings[0];
    expect(reading.metric).toBe("air_temp_f");
    expect(reading.value).toBeCloseTo(78.6, 2);
    expect(reading.idempotency_key).toBe(
      buildHaIdempotencyKey({
        provider: HA_PROVIDER,
        bridge: "home_assistant",
        upstream_mode: "ha_core_ecowitt_push",
        entity_id: ENTITY,
        tent_id: TENT,
        plant_id: null,
        channel: "outdoor",
        metric: "air_temp_f",
        captured_at: LIVE_ISO,
        value: 78.6,
        unit: "°F",
      }),
    );
  });

  it("`value` and `unit` aliases normalize at the boundary to the identical reading + key", () => {
    const config = jsonConfig();
    const canonicalState = createHaDryRunState(config);
    const canonical = feedJson(envelope(), canonicalState, config);

    const aliasState = createHaDryRunState(config);
    const viaAliases = feedJson(
      JSON.stringify({
        entity_id: ENTITY,
        value: "78.6",
        unit: "°F",
        last_updated: LIVE_ISO,
      }),
      aliasState,
      config,
    );
    expect(viaAliases.outcome).toBe("reading");
    expect(viaAliases.readings).toEqual(canonical.readings);
    expect(viaAliases.readings[0].idempotency_key).toBe(
      canonical.readings[0].idempotency_key,
    );
  });

  it("canonical fields win over aliases when both are present", () => {
    const config = jsonConfig();
    const state = createHaDryRunState(config);
    const report = feedJson(
      envelope({ value: "212", unit: "°C" }),
      state,
      config,
    );
    expect(report.outcome).toBe("reading");
    expect(report.readings[0].value).toBeCloseTo(78.6, 2);
  });

  it("replayed identical envelopes collapse to one hav2 key in the dry-run counters", () => {
    const config = jsonConfig();
    const state = createHaDryRunState(config);
    feedJson(envelope(), state, config);
    feedJson(envelope(), state, config);
    expect(state.messagesConsumed).toBe(2);
    expect(state.readingsEmitted).toBe(1);
    expect(state.duplicatesSuppressed).toBe(1);
    expect(state.idempotencyKeys).toHaveLength(1);
  });

  it("malformed JSON is rejected with malformed_payload and counted", () => {
    const config = jsonConfig();
    const state = createHaDryRunState(config);
    const report = feedJson("not-json{", state, config);
    expect(report.outcome).toBe("rejected");
    expect(report.source).toBe("invalid");
    expect(report.reasons).toContain("malformed_payload");
    expect(report.reason_counts.malformed_payload).toBe(1);
  });

  it("unknown entities are rejected with unknown_entity and counted", () => {
    const config = jsonConfig();
    const state = createHaDryRunState(config);
    const report = feedJson(envelope({ entity_id: "sensor.some_unmapped" }), state, config);
    expect(report.outcome).toBe("rejected");
    expect(report.reasons).toContain("unknown_entity");
    expect(report.reason_counts.unknown_entity).toBe(1);
  });

  it("retained envelope without a source timestamp is invalid, never live", () => {
    const config = jsonConfig();
    const state = createHaDryRunState(config);
    const report = handleHaMessage({
      topic: "verdant/ha_json/ingest",
      payloadText: envelope({ last_updated: undefined }),
      retained: true,
      receivedAt: NOW,
      config,
      state,
      now: NOW,
    });
    expect(report.outcome).toBe("rejected");
    expect(report.source).toBe("invalid");
    expect(report.reasons).toContain("retained_without_source_timestamp");
  });

  it("the dry-run outcome flows through the shared downstream report presenter", () => {
    const config = jsonConfig();
    const state = createHaDryRunState(config);
    const report = feedJson(envelope(), state, config);
    const attempt = buildHaAttemptReport(report);
    expect(attempt.status).toBe("dry_run");
    expect(attempt.classification).toBe("dry_run");
    expect(attempt.url).toBeNull();
    expect(attempt.authPreview).not.toMatch(/vbt_[a-z0-9]{4,}/i);
    expect(attempt.metricKeys).toContain("air_temp_f");
    expect(attempt.trustedLive).toBe(false);
  });
});

describe("ecowitt-mqtt-runner — handleIncomingMqttMessage routes HA modes by config only", () => {
  it("ha_statestream messages route to the HA dry-run pipeline", async () => {
    const config = ssConfig();
    const state = createHaDryRunState(config);
    const env = {
      url: null,
      token: null,
      tentId: null,
      plantId: null,
      mqttUrl: "mqtt://127.0.0.1:1883",
      mqttTopic: "ecowitt/grow",
      mqttUsername: null,
      mqttPassword: null,
    };
    const flags = { dryRun: false, once: false, sample: false, invalid: false };
    let last: Awaited<ReturnType<typeof handleIncomingMqttMessage>> | null = null;
    for (const p of SS_FIXTURE.scenarios.separate_topics.parts) {
      last = await handleIncomingMqttMessage({
        topic: p.topic,
        payloadText: p.payload,
        retained: p.retained,
        config,
        env,
        flags,
        haState: state,
        receivedAt: new Date(p.receivedAt),
        now: NOW,
      });
    }
    expect(last?.kind).toBe("ha_dry_run");
    if (last?.kind === "ha_dry_run") {
      expect(last.report.outcome).toBe("reading");
      expect(last.report.posted).toBe(false);
    }
  });
});
