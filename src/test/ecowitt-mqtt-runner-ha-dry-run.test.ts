import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createHaDryRunPipeline,
  handleHaDryRunMessage,
  type CliFlags,
} from "../../scripts/dev/ecowitt-mqtt-runner";
import {
  configuredAdapterMode,
  parseHaMqttRunnerConfig,
  type HaMqttRunnerConfig,
} from "@/lib/homeAssistantMqttRunnerRules";

const TENT = "00000000-0000-0000-0000-0000000000aa";
const PLANT_A = "00000000-0000-0000-0000-0000000000a1";
const PLANT_B = "00000000-0000-0000-0000-0000000000b1";
const NOW = new Date("2026-07-22T18:00:30.000Z");
const LIVE_AT = "2026-07-22T18:00:00.000Z";
const OLD_AT = "2026-07-22T17:40:00.000Z";

const DRY_FLAGS: CliFlags = {
  dryRun: true,
  once: false,
  sample: false,
  invalid: false,
  writeReport: false,
};

function baseEntities() {
  return [
    {
      entity_id: "sensor.canopy_temperature",
      metric: "air_temp_f" as const,
      expected_unit: "°F" as const,
      tent_id: TENT,
      plant_id: null,
      channel: "canopy",
    },
    {
      entity_id: "sensor.canopy_humidity",
      metric: "humidity_pct" as const,
      expected_unit: "%" as const,
      tent_id: TENT,
      plant_id: null,
      channel: "canopy",
    },
    {
      entity_id: "sensor.soil_moisture_a",
      metric: "soil_moisture_pct" as const,
      expected_unit: "%" as const,
      tent_id: TENT,
      plant_id: PLANT_A,
      channel: "soil_1",
    },
    {
      entity_id: "sensor.soil_moisture_b",
      metric: "soil_moisture_pct" as const,
      expected_unit: "%" as const,
      tent_id: TENT,
      plant_id: PLANT_B,
      channel: "soil_2",
    },
  ];
}

function jsonConfig(): HaMqttRunnerConfig {
  return {
    version: 1,
    adapter_mode: "ha_json",
    mqtt_topic: "verdant/ecowitt/ha-json/#",
    bridge: "home_assistant",
    upstream_mode: "ha_core_ecowitt_push",
    entities: baseEntities(),
  };
}

function statestreamConfig(): HaMqttRunnerConfig {
  return {
    version: 1,
    adapter_mode: "ha_statestream",
    mqtt_topic: "homeassistant/#",
    bridge: "home_assistant",
    upstream_mode: "ha_ecowitt_iot_poll",
    statestream_topic_prefix: "homeassistant",
    entities: baseEntities().map((entry) =>
      entry.metric === "air_temp_f"
        ? { ...entry, expected_unit: undefined }
        : entry,
    ),
  };
}

function message(
  topic: string,
  payload: unknown,
  retained = false,
  now: Date = NOW,
) {
  return {
    topic,
    payload,
    retained,
    receivedAt: now,
    brokerReceivedAt: now,
    now,
  };
}

async function handle(
  config: HaMqttRunnerConfig,
  pipeline: ReturnType<typeof createHaDryRunPipeline>,
  topic: string,
  payload: unknown,
  retained = false,
  now: Date = NOW,
) {
  return handleHaDryRunMessage({
    pipeline,
    config,
    mappingPath: "fixtures/test-ha-mapping.json",
    message: message(topic, payload, retained, now),
    flags: DRY_FLAGS,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ecowitt-mqtt-runner — config-routed HA dry-run pipeline", () => {
  it("selects ha_json strictly from mapping config, not a Statestream-looking topic", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = parseHaMqttRunnerConfig({
      ...jsonConfig(),
      mqtt_topic: "homeassistant/#",
    });
    expect(configuredAdapterMode(config)).toBe("ha_json");

    const pipeline = createHaDryRunPipeline(config);
    const result = await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_temperature/state",
      JSON.stringify({
        entity_id: "sensor.canopy_temperature",
        state: "78.6",
        unit_of_measurement: "°F",
        last_updated: LIVE_AT,
      }),
    );
    expect(result.report?.adapter).toBe("ha_json");
    expect(result.report?.classification).toBe("live");
    expect(result.posted).toBe(false);
  });

  it("rejects missing adapter_mode and non-HA upstream_mode instead of inferring", () => {
    const { adapter_mode: _adapter, ...withoutAdapter } = jsonConfig();
    expect(() => parseHaMqttRunnerConfig(withoutAdapter)).toThrow(
      /adapter_mode/,
    );
    expect(() =>
      parseHaMqttRunnerConfig({
        ...jsonConfig(),
        upstream_mode: "ecowitt_custom_upload",
      }),
    ).toThrow(/upstream_mode/);
  });
});

describe("ecowitt-mqtt-runner — ha_json end-to-end dry-run", () => {
  it("classifies fresh readings, pairs VPD, and emits deterministic strong idempotency keys", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = jsonConfig();
    const pipeline = createHaDryRunPipeline(config);

    const temp = await handle(
      config,
      pipeline,
      "verdant/ecowitt/ha-json/canopy-temperature",
      JSON.stringify({
        entity_id: "sensor.canopy_temperature",
        value: "78.6",
        unit: "°F",
        last_updated: LIVE_AT,
      }),
    );
    expect(temp.report?.classification).toBe("live");
    expect(temp.report?.readings.map((reading) => reading.metric)).toEqual([
      "air_temp_f",
    ]);

    const rh = await handle(
      config,
      pipeline,
      "verdant/ecowitt/ha-json/canopy-humidity",
      JSON.stringify({
        entity_id: "sensor.canopy_humidity",
        state: "56",
        unit_of_measurement: "%",
        last_updated: LIVE_AT,
      }),
    );
    const metrics = rh.report?.readings.map((reading) => reading.metric) ?? [];
    expect(metrics).toContain("humidity_pct");
    expect(metrics).toContain("vpd_kpa");
    const tempKey = temp.report!.readings[0].idempotency_key;
    const vpdKey = rh.report!.readings.find(
      (reading) => reading.metric === "vpd_kpa",
    )!.idempotency_key;
    expect(tempKey).toContain("sensor.canopy_temperature");
    expect(tempKey).toContain("canopy");
    expect(vpdKey).toContain("sensor.canopy_humidity+sensor.canopy_temperature");

    const replayPipeline = createHaDryRunPipeline(config);
    const tempReplay = await handle(
      config,
      replayPipeline,
      "verdant/ecowitt/ha-json/canopy-temperature",
      JSON.stringify({
        entity_id: "sensor.canopy_temperature",
        value: "78.6000",
        unit: "°F",
        last_updated: LIVE_AT,
      }),
    );
    await handle(
      config,
      replayPipeline,
      "verdant/ecowitt/ha-json/canopy-humidity",
      JSON.stringify({
        entity_id: "sensor.canopy_humidity",
        state: 56,
        unit_of_measurement: "%",
        last_updated: LIVE_AT,
      }),
    );
    expect(tempReplay.report!.readings[0].idempotency_key).toBe(tempKey);
  });

  it("preserves retained provenance and never promotes retained data without a source timestamp", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = jsonConfig();
    const fresh = await handle(
      config,
      createHaDryRunPipeline(config),
      "verdant/ecowitt/ha-json/canopy-temperature",
      JSON.stringify({
        entity_id: "sensor.canopy_temperature",
        state: 78.6,
        unit_of_measurement: "°F",
        last_updated: LIVE_AT,
      }),
      true,
    );
    expect(fresh.report?.retained).toBe(true);
    expect(fresh.report?.classification).toBe("live");

    const missingTimestamp = await handle(
      config,
      createHaDryRunPipeline(config),
      "verdant/ecowitt/ha-json/canopy-temperature",
      JSON.stringify({
        entity_id: "sensor.canopy_temperature",
        state: 78.6,
        unit_of_measurement: "°F",
      }),
      true,
    );
    expect(missingTimestamp.report?.classification).toBe("invalid");
    expect(missingTimestamp.report?.reasons).toContain(
      "retained_without_source_timestamp",
    );
    expect(missingTimestamp.report?.readings).toEqual([]);
  });

  it("classifies old valid JSON envelopes as stale and emits no live readings", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = jsonConfig();
    const stale = await handle(
      config,
      createHaDryRunPipeline(config),
      "verdant/ecowitt/ha-json/canopy-temperature",
      JSON.stringify({
        entity_id: "sensor.canopy_temperature",
        state: 78.6,
        unit_of_measurement: "°F",
        last_updated: OLD_AT,
      }),
    );
    expect(stale.report?.classification).toBe("stale");
    expect(stale.report?.reasons).toContain("stale_reading");
    expect(stale.report?.readings).toEqual([]);
  });

  it("keeps same-time, same-value soil channels distinct in idempotency", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = jsonConfig();
    const pipeline = createHaDryRunPipeline(config);
    const first = await handle(
      config,
      pipeline,
      "verdant/ecowitt/ha-json/soil-a",
      JSON.stringify({
        entity_id: "sensor.soil_moisture_a",
        state: 42,
        unit_of_measurement: "%",
        last_updated: LIVE_AT,
      }),
    );
    const second = await handle(
      config,
      pipeline,
      "verdant/ecowitt/ha-json/soil-b",
      JSON.stringify({
        entity_id: "sensor.soil_moisture_b",
        state: 42,
        unit_of_measurement: "%",
        last_updated: LIVE_AT,
      }),
    );
    expect(first.report!.readings[0].idempotency_key).not.toBe(
      second.report!.readings[0].idempotency_key,
    );
  });
});

describe("ecowitt-mqtt-runner — ha_statestream end-to-end dry-run", () => {
  it("assembles independent state/attribute topics in any order, preserves retained state, and pairs VPD", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = statestreamConfig();
    const pipeline = createHaDryRunPipeline(config);

    const stateFirst = await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_temperature/state",
      '"78.6"',
      true,
    );
    expect(stateFirst.pipelineStatus).toBe("pending");
    expect(stateFirst.report).toBeNull();

    const timestamp = await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_temperature/last_updated",
      JSON.stringify(LIVE_AT),
      false,
    );
    expect(timestamp.pipelineStatus).toBe("pending");

    const temperature = await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_temperature/unit_of_measurement",
      JSON.stringify("°F"),
      false,
    );
    expect(temperature.report?.classification).toBe("live");
    expect(temperature.report?.retained).toBe(true);
    expect(temperature.report?.readings[0].metric).toBe("air_temp_f");

    await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_humidity/state",
      '"56"',
      false,
    );
    await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_humidity/unit_of_measurement",
      JSON.stringify("%"),
      false,
    );
    const humidity = await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_humidity/last_updated",
      JSON.stringify(LIVE_AT),
      false,
    );
    expect(humidity.report?.readings.map((reading) => reading.metric)).toEqual(
      expect.arrayContaining(["humidity_pct", "vpd_kpa"]),
    );
    expect(
      humidity.report?.readings.find((reading) => reading.metric === "vpd_kpa")
        ?.idempotency_key,
    ).toContain("sensor.canopy_humidity+sensor.canopy_temperature");
  });

  it("does not require a literal /attributes topic and suppresses identical complete assemblies", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = statestreamConfig();
    const pipeline = createHaDryRunPipeline(config);

    await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_temperature/unit_of_measurement",
      JSON.stringify("°F"),
    );
    await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_temperature/last_updated",
      JSON.stringify(LIVE_AT),
    );
    const first = await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_temperature/state",
      '"78.6"',
    );
    expect(first.pipelineStatus).toBe("processed");

    const duplicate = await handle(
      config,
      pipeline,
      "homeassistant/sensor/canopy_temperature/state",
      '"78.6"',
    );
    expect(duplicate.pipelineStatus).toBe("duplicate");
    expect(duplicate.report).toBeNull();
  });

  it("produces the same Statestream idempotency key for the same complete source reading", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = statestreamConfig();

    async function runOnce() {
      const pipeline = createHaDryRunPipeline(config);
      await handle(
        config,
        pipeline,
        "homeassistant/sensor/canopy_temperature/last_updated",
        JSON.stringify(LIVE_AT),
      );
      await handle(
        config,
        pipeline,
        "homeassistant/sensor/canopy_temperature/unit_of_measurement",
        JSON.stringify("°F"),
      );
      return handle(
        config,
        pipeline,
        "homeassistant/sensor/canopy_temperature/state",
        '"78.6000"',
      );
    }

    const first = await runOnce();
    const second = await runOnce();
    expect(first.report!.readings[0].idempotency_key).toBe(
      second.report!.readings[0].idempotency_key,
    );
  });

  it("keeps retained Statestream state pending and never live until source metadata exists", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = statestreamConfig();
    const pending = await handle(
      config,
      createHaDryRunPipeline(config),
      "homeassistant/sensor/canopy_temperature/state",
      '"78.6"',
      true,
    );
    expect(pending.pipelineStatus).toBe("pending");
    expect(pending.reasons).toContain("statestream_missing_source_timestamp");
    expect(pending.report).toBeNull();
  });
});

describe("ecowitt-mqtt-runner — HA dry-run safety", () => {
  it("blocks HA processing without --dry-run and cannot post", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const config = jsonConfig();
    const blocked = await handleHaDryRunMessage({
      pipeline: createHaDryRunPipeline(config),
      config,
      message: message(
        "verdant/ecowitt/ha-json/canopy-temperature",
        JSON.stringify({
          entity_id: "sensor.canopy_temperature",
          state: 78.6,
          unit_of_measurement: "°F",
          last_updated: LIVE_AT,
        }),
      ),
      flags: { ...DRY_FLAGS, dryRun: false },
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.posted).toBe(false);
    expect(blocked.report).toBeNull();
  });
});

describe("ecowitt-mqtt-runner — HA integration static safety", () => {
  const runner = readFileSync(
    resolve(process.cwd(), "scripts/dev/ecowitt-mqtt-runner.ts"),
    "utf8",
  );
  const rulesRaw = readFileSync(
    resolve(process.cwd(), "src/lib/homeAssistantMqttRunnerRules.ts"),
    "utf8",
  );
  const rules = rulesRaw
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");

  it("routes HA only through HA_MQTT_MAPPING_PATH and not adapter/topic inference envs", () => {
    expect(runner).toContain("HA_MQTT_MAPPING_PATH");
    expect(runner).not.toContain("HA_MQTT_ADAPTER");
    expect(runner).not.toContain("HA_MQTT_TOPIC");
    expect(rules).toContain("config.adapter_mode");
    expect(rules).toContain("config.mqtt_topic");
  });

  it("keeps pure HA runner rules free of network, DB, action, and device-control code", () => {
    for (const forbidden of [
      /\bfetch\s*\(/,
      /\bsupabase\b/i,
      /\.(insert|upsert|update|delete)\s*\(/,
      /service[_-]?role/i,
      /action[_-]?queue/i,
      /mqtt\.publish\s*\(/i,
      /fan\.turn_on|light\.turn_on|switch\.turn_on/i,
    ]) {
      expect(rules, `must not contain ${forbidden}`).not.toMatch(forbidden);
    }
  });
});
