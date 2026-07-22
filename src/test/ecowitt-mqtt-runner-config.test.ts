/**
 * Configuration-based routing tests for scripts/dev/ecowitt-mqtt-runner.ts.
 *
 * Pins the config contract:
 *   - UPSTREAM_MODE selects the adapter mode STRICTLY from config
 *     (ecowitt_raw | ha_json | ha_statestream) — missing/invalid values
 *     fail closed at startup with an error listing the valid modes.
 *   - ha_json / ha_statestream REQUIRE HA_MQTT_MAPPING_PATH; a missing,
 *     unreadable, or invalid mapping fails closed with a PATH-SAFE error
 *     that never echoes file contents.
 *   - ecowitt_raw keeps its existing config surface and never touches
 *     the mapping file.
 *   - The mapping file is read exactly once at startup, read-only.
 */
import { describe, expect, it, vi } from "vitest";
import { resolve } from "node:path";
import {
  RUNNER_UPSTREAM_MODES,
  RunnerConfigError,
  resolveRunnerModeConfig,
  resolveUpstreamMode,
  validateHaMappingFile,
} from "../../scripts/dev/ecowitt-mqtt-runner";

const EXAMPLE_MAPPING_PATH = resolve(
  process.cwd(),
  "fixtures/home-assistant-ecowitt-mqtt/example-mapping.json",
);
const RUNNER_SS_MAPPING_PATH = resolve(
  process.cwd(),
  "fixtures/home-assistant-ecowitt-mqtt/runner-statestream-mapping.json",
);

const VALID_MAPPING_JSON = JSON.stringify({
  version: 1,
  bridge: "home_assistant",
  upstream_mode: "ha_core_ecowitt_push",
  statestream_topic_prefix: "verdant/ecowitt",
  entities: [
    {
      entity_id: "sensor.flower_tent_temperature",
      metric: "air_temp_f",
      expected_unit: "°F",
      tent_id: "00000000-0000-0000-0000-0000000000aa",
      plant_id: null,
      channel: null,
    },
  ],
});

function env(overrides: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...overrides } as NodeJS.ProcessEnv;
}

describe("ecowitt-mqtt-runner — upstream_mode routing (config only)", () => {
  it("exposes exactly the three valid modes (adapter HaAdapterMode vocabulary)", () => {
    expect([...RUNNER_UPSTREAM_MODES]).toEqual([
      "ecowitt_raw",
      "ha_json",
      "ha_statestream",
    ]);
  });

  it("resolves each valid mode from config", () => {
    expect(resolveUpstreamMode(env({ UPSTREAM_MODE: "ecowitt_raw" }))).toBe("ecowitt_raw");
    expect(resolveUpstreamMode(env({ UPSTREAM_MODE: "ha_json" }))).toBe("ha_json");
    expect(resolveUpstreamMode(env({ UPSTREAM_MODE: "ha_statestream" }))).toBe(
      "ha_statestream",
    );
  });

  it("missing UPSTREAM_MODE fails closed with an error listing valid modes", () => {
    for (const e of [env({}), env({ UPSTREAM_MODE: "" }), env({ UPSTREAM_MODE: "   " })]) {
      let err: unknown = null;
      try {
        resolveRunnerModeConfig(e);
      } catch (thrown) {
        err = thrown;
      }
      expect(err).toBeInstanceOf(RunnerConfigError);
      const msg = (err as Error).message;
      expect(msg).toContain("UPSTREAM_MODE");
      expect(msg).toContain("ecowitt_raw");
      expect(msg).toContain("ha_json");
      expect(msg).toContain("ha_statestream");
    }
  });

  it("invalid UPSTREAM_MODE fails closed — no silent default, no inference fallback", () => {
    for (const bad of ["mqtt", "HA_JSON", "ecowitt", "auto", "statestream", "raw"]) {
      let err: unknown = null;
      try {
        resolveRunnerModeConfig(env({ UPSTREAM_MODE: bad }));
      } catch (thrown) {
        err = thrown;
      }
      expect(err, `mode "${bad}" must be rejected`).toBeInstanceOf(RunnerConfigError);
      const msg = (err as Error).message;
      expect(msg).toContain("ecowitt_raw");
      expect(msg).toContain("ha_json");
      expect(msg).toContain("ha_statestream");
    }
  });

  it("ecowitt_raw resolves with its current config surface and never reads the mapping file", () => {
    const readFile = vi.fn(() => VALID_MAPPING_JSON);
    const cfg = resolveRunnerModeConfig(
      env({
        UPSTREAM_MODE: "ecowitt_raw",
        // Even when a mapping path is present, the raw path ignores it.
        HA_MQTT_MAPPING_PATH: "/some/mapping.json",
      }),
      readFile,
    );
    expect(cfg.upstreamMode).toBe("ecowitt_raw");
    expect(cfg.mapping).toBeNull();
    expect(cfg.mappingPath).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });
});

describe("ecowitt-mqtt-runner — HA_MQTT_MAPPING_PATH fail-closed rules", () => {
  it("ha_json and ha_statestream REQUIRE HA_MQTT_MAPPING_PATH", () => {
    for (const mode of ["ha_json", "ha_statestream"]) {
      for (const e of [
        env({ UPSTREAM_MODE: mode }),
        env({ UPSTREAM_MODE: mode, HA_MQTT_MAPPING_PATH: "" }),
        env({ UPSTREAM_MODE: mode, HA_MQTT_MAPPING_PATH: "   " }),
      ]) {
        let err: unknown = null;
        try {
          resolveRunnerModeConfig(e, vi.fn(() => VALID_MAPPING_JSON));
        } catch (thrown) {
          err = thrown;
        }
        expect(err, `${mode} without mapping path must fail closed`).toBeInstanceOf(
          RunnerConfigError,
        );
        expect((err as Error).message).toContain("HA_MQTT_MAPPING_PATH");
      }
    }
  });

  it("unreadable mapping fails closed with a path-safe error (no fs detail echoed)", () => {
    const readFile = vi.fn(() => {
      throw new Error("SENTINEL_FS_DETAIL_vbt_should_never_leak");
    });
    let err: unknown = null;
    try {
      resolveRunnerModeConfig(
        env({ UPSTREAM_MODE: "ha_json", HA_MQTT_MAPPING_PATH: "/cfg/mapping.json" }),
        readFile,
      );
    } catch (thrown) {
      err = thrown;
    }
    expect(err).toBeInstanceOf(RunnerConfigError);
    const msg = (err as Error).message;
    expect(msg).toContain("/cfg/mapping.json");
    expect(msg).toContain("could not be read");
    expect(msg).not.toContain("SENTINEL_FS_DETAIL");
    expect(msg).not.toMatch(/vbt_/);
  });

  it("invalid-JSON mapping fails closed without echoing file contents", () => {
    const readFile = vi.fn(
      () => '{"version": 1, SECRET_CONTENT_SENTINEL vbt_abcdef0123456789',
    );
    let err: unknown = null;
    try {
      resolveRunnerModeConfig(
        env({ UPSTREAM_MODE: "ha_statestream", HA_MQTT_MAPPING_PATH: "/cfg/mapping.json" }),
        readFile,
      );
    } catch (thrown) {
      err = thrown;
    }
    expect(err).toBeInstanceOf(RunnerConfigError);
    const msg = (err as Error).message;
    expect(msg).toContain("/cfg/mapping.json");
    expect(msg).toContain("not valid JSON");
    expect(msg).not.toContain("SECRET_CONTENT_SENTINEL");
    expect(msg).not.toMatch(/vbt_/);
  });

  it("invalid mapping shape fails closed naming the field, never echoing the value", () => {
    const bad = {
      version: 1,
      bridge: "home_assistant",
      upstream_mode: "ha_core_ecowitt_push",
      statestream_topic_prefix: "verdant/ecowitt",
      entities: [
        {
          entity_id: "sensor.x",
          metric: "LEAKED_METRIC_VALUE_SENTINEL",
          tent_id: "00000000-0000-0000-0000-0000000000aa",
        },
      ],
    };
    let err: unknown = null;
    try {
      resolveRunnerModeConfig(
        env({ UPSTREAM_MODE: "ha_json", HA_MQTT_MAPPING_PATH: "/cfg/mapping.json" }),
        vi.fn(() => JSON.stringify(bad)),
      );
    } catch (thrown) {
      err = thrown;
    }
    expect(err).toBeInstanceOf(RunnerConfigError);
    const msg = (err as Error).message;
    expect(msg).toContain("entities[0].metric");
    expect(msg).toContain("/cfg/mapping.json");
    expect(msg).not.toContain("LEAKED_METRIC_VALUE_SENTINEL");
  });

  it("mapping upstream_mode outside the adapter HaUpstreamMode vocabulary fails closed", () => {
    const bad = JSON.parse(VALID_MAPPING_JSON) as Record<string, unknown>;
    bad.upstream_mode = "not_a_mode";
    expect(() =>
      validateHaMappingFile(bad, { path: "/cfg/mapping.json", requireStatestreamPrefix: false }),
    ).toThrow(RunnerConfigError);
  });

  it("duplicate entity_id in the mapping fails closed", () => {
    const dup = JSON.parse(VALID_MAPPING_JSON) as { entities: unknown[] };
    dup.entities.push(JSON.parse(JSON.stringify(dup.entities[0])));
    expect(() =>
      validateHaMappingFile(dup, { path: "/cfg/mapping.json", requireStatestreamPrefix: false }),
    ).toThrow(/duplicates an earlier entry/);
  });

  it("ha_statestream requires statestream_topic_prefix; ha_json does not", () => {
    const noPrefix = JSON.parse(VALID_MAPPING_JSON) as Record<string, unknown>;
    delete noPrefix.statestream_topic_prefix;
    const readFile = vi.fn(() => JSON.stringify(noPrefix));

    let err: unknown = null;
    try {
      resolveRunnerModeConfig(
        env({ UPSTREAM_MODE: "ha_statestream", HA_MQTT_MAPPING_PATH: "/cfg/mapping.json" }),
        readFile,
      );
    } catch (thrown) {
      err = thrown;
    }
    expect(err).toBeInstanceOf(RunnerConfigError);
    expect((err as Error).message).toContain("statestream_topic_prefix");

    const cfg = resolveRunnerModeConfig(
      env({ UPSTREAM_MODE: "ha_json", HA_MQTT_MAPPING_PATH: "/cfg/mapping.json" }),
      vi.fn(() => JSON.stringify(noPrefix)),
    );
    expect(cfg.mapping?.entities).toHaveLength(1);
  });

  it("mapping file is read exactly once at startup (read-only)", () => {
    const readFile = vi.fn(() => VALID_MAPPING_JSON);
    resolveRunnerModeConfig(
      env({ UPSTREAM_MODE: "ha_statestream", HA_MQTT_MAPPING_PATH: "/cfg/mapping.json" }),
      readFile,
    );
    expect(readFile).toHaveBeenCalledTimes(1);
    expect(readFile).toHaveBeenCalledWith("/cfg/mapping.json");
  });
});

describe("ecowitt-mqtt-runner — committed mapping fixtures load through the real reader", () => {
  it("example-mapping.json resolves for ha_json and ha_statestream", () => {
    for (const mode of ["ha_json", "ha_statestream"]) {
      const cfg = resolveRunnerModeConfig(
        env({ UPSTREAM_MODE: mode, HA_MQTT_MAPPING_PATH: EXAMPLE_MAPPING_PATH }),
      );
      expect(cfg.upstreamMode).toBe(mode);
      expect(cfg.mapping?.bridge).toBe("home_assistant");
      expect(cfg.mapping?.upstream_mode).toBe("ha_core_ecowitt_push");
      expect(cfg.mapping?.statestream_topic_prefix).toBe("homeassistant");
      expect(cfg.mapping?.entities.length).toBeGreaterThanOrEqual(6);
    }
  });

  it("runner-statestream-mapping.json resolves and matches the statestream fixture prefix", () => {
    const cfg = resolveRunnerModeConfig(
      env({ UPSTREAM_MODE: "ha_statestream", HA_MQTT_MAPPING_PATH: RUNNER_SS_MAPPING_PATH }),
    );
    expect(cfg.mapping?.statestream_topic_prefix).toBe("verdant/ecowitt");
    const ids = cfg.mapping?.entities.map((e) => e.entity_id) ?? [];
    expect(ids).toContain("sensor.flower_tent_temperature");
    expect(ids).toContain("sensor.flower_tent_soil_1");
    expect(ids).toContain("sensor.flower_tent_soil_2");
  });
});
