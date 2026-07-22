import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  loadHaMqttRunnerConfig,
  readEnv,
} from "../../scripts/dev/ecowitt-mqtt-runner";
import {
  configuredAdapterMode,
  configuredSubscriptionTopic,
} from "@/lib/homeAssistantMqttRunnerRules";

const FIXTURES = resolve(
  process.cwd(),
  "fixtures/home-assistant-ecowitt-mqtt",
);

describe("ecowitt-mqtt-runner — HA_MQTT_MAPPING_PATH config boundary", () => {
  it("loads the HA JSON route, topic, and upstream mode from the configured file", async () => {
    const path = resolve(FIXTURES, "example-mapping.json");
    const env = readEnv({ HA_MQTT_MAPPING_PATH: path });

    expect(env.haMappingPath).toBe(path);
    const config = await loadHaMqttRunnerConfig(env.haMappingPath);
    expect(configuredAdapterMode(config)).toBe("ha_json");
    expect(configuredSubscriptionTopic(config)).toBe(
      "verdant/ecowitt/ha-json/#",
    );
    expect(config.upstream_mode).toBe("ha_core_ecowitt_push");
  });

  it("loads the Statestream route, topic, prefix, and upstream mode from the configured file", async () => {
    const path = resolve(FIXTURES, "example-statestream-mapping.json");
    const env = readEnv({
      HA_MQTT_MAPPING_PATH: path,
      ECOWITT_MQTT_TOPIC: "must/not/select/the/ha/adapter",
    });

    const config = await loadHaMqttRunnerConfig(env.haMappingPath);
    expect(configuredAdapterMode(config)).toBe("ha_statestream");
    expect(configuredSubscriptionTopic(config)).toBe("homeassistant/#");
    expect(config.statestream_topic_prefix).toBe("homeassistant");
    expect(config.upstream_mode).toBe("ha_ecowitt_iot_poll");
  });

  it("fails closed when the mapping path is absent", async () => {
    await expect(loadHaMqttRunnerConfig(null)).rejects.toThrow(
      /HA_MQTT_MAPPING_PATH/,
    );
  });
});
