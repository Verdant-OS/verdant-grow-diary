import { describe, expect, it, vi } from "vitest";
import {
  createHaDryRunPipeline,
  handleHaDryRunMessage,
  type CliFlags,
} from "../../scripts/dev/ecowitt-mqtt-runner";
import type { HaMqttRunnerConfig } from "@/lib/homeAssistantMqttRunnerRules";

const TENT = "00000000-0000-0000-0000-0000000000aa";
const NOW = new Date("2026-07-22T18:00:30.000Z");
const FLAGS: CliFlags = {
  dryRun: true,
  once: false,
  sample: false,
  invalid: false,
};

const config: HaMqttRunnerConfig = {
  version: 1,
  adapter_mode: "ha_statestream",
  mqtt_topic: "homeassistant/#",
  bridge: "home_assistant",
  upstream_mode: "ha_core_ecowitt_push",
  statestream_topic_prefix: "homeassistant",
  entities: [
    {
      entity_id: "sensor.canopy_temperature",
      metric: "air_temp_f",
      expected_unit: "°F",
      tent_id: TENT,
      plant_id: null,
      channel: "canopy",
    },
  ],
};

async function assembledTemperature(sourceTimestamp: string) {
  const pipeline = createHaDryRunPipeline(config);
  const base = {
    pipeline,
    config,
    flags: FLAGS,
    mappingPath: "fixtures/test-statestream.json",
  };

  await handleHaDryRunMessage({
    ...base,
    message: {
      topic: "homeassistant/sensor/canopy_temperature/unit_of_measurement",
      payload: JSON.stringify("°F"),
      retained: false,
      receivedAt: NOW,
      brokerReceivedAt: NOW,
      now: NOW,
    },
  });
  await handleHaDryRunMessage({
    ...base,
    message: {
      topic: "homeassistant/sensor/canopy_temperature/state",
      payload: '"78.6"',
      retained: false,
      receivedAt: NOW,
      brokerReceivedAt: NOW,
      now: NOW,
    },
  });
  return handleHaDryRunMessage({
    ...base,
    message: {
      topic: "homeassistant/sensor/canopy_temperature/last_updated",
      payload: JSON.stringify(sourceTimestamp),
      retained: false,
      receivedAt: NOW,
      brokerReceivedAt: NOW,
      now: NOW,
    },
  });
}

describe("ecowitt-mqtt-runner — Statestream freshness after assembly", () => {
  it("keeps an old valid Statestream reading stale with no live metrics", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await assembledTemperature("2026-07-22T17:40:00.000Z");

    expect(result.report?.classification).toBe("stale");
    expect(result.report?.reasons).toContain("stale_reading");
    expect(result.report?.readings).toEqual([]);
    expect(result.posted).toBe(false);
  });

  it("keeps a future Statestream source timestamp invalid", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const result = await assembledTemperature("2026-07-22T18:10:31.000Z");

    expect(result.report?.classification).toBe("invalid");
    expect(result.report?.reasons).toContain("future_timestamp");
    expect(result.report?.readings).toEqual([]);
    expect(result.posted).toBe(false);
  });
});
