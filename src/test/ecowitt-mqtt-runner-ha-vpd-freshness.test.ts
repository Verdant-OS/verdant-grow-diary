import { describe, expect, it, vi } from "vitest";
import {
  createHaDryRunState,
  handleIncomingMqttMessage,
  type HaDryRunState,
  type RunnerModeConfig,
} from "../../scripts/dev/ecowitt-mqtt-runner";
import {
  HA_IDEMPOTENCY_KEY_VERSION,
  type HaMqttMappingFile,
} from "@/lib/homeAssistantEcowittMqttAdapter";
import { calculateAirVpdKpa } from "@/lib/vpdRules";

const TENT = "00000000-0000-0000-0000-0000000000aa";
const TEMP_ENTITY = "sensor.flower_tent_temperature";
const RH_ENTITY = "sensor.flower_tent_humidity";
const NOW = new Date("2026-07-22T18:00:30.000Z");
const LIVE_ISO = "2026-07-22T18:00:00.000Z";

const MAPPING: HaMqttMappingFile = {
  version: 1,
  bridge: "home_assistant",
  upstream_mode: "ha_core_ecowitt_push",
  statestream_topic_prefix: "homeassistant",
  entities: [
    {
      entity_id: TEMP_ENTITY,
      metric: "air_temp_f",
      expected_unit: "°F",
      tent_id: TENT,
      plant_id: null,
      channel: "canopy",
    },
    {
      entity_id: RH_ENTITY,
      metric: "humidity_pct",
      expected_unit: "%",
      tent_id: TENT,
      plant_id: null,
      channel: "canopy",
    },
    {
      entity_id: "sensor.other_channel_humidity",
      metric: "humidity_pct",
      expected_unit: "%",
      tent_id: TENT,
      plant_id: null,
      channel: "other",
    },
  ],
};

const ENV = {
  url: null,
  token: null,
  tentId: null,
  plantId: null,
  mqttUrl: "mqtt://127.0.0.1:1883",
  mqttTopic: "verdant/ha-json/#",
  mqttUsername: null,
  mqttPassword: null,
};

const FLAGS = {
  dryRun: true,
  once: false,
  sample: false,
  invalid: false,
};

function config(mode: "ha_json" | "ha_statestream"): RunnerModeConfig {
  return {
    upstreamMode: mode,
    mappingPath: "inline-test-mapping.json",
    mapping: MAPPING,
  };
}

async function feed(
  cfg: RunnerModeConfig,
  state: HaDryRunState,
  args: {
    topic: string;
    payloadText: string;
    retained?: boolean;
    receivedAt?: Date;
    now?: Date;
    fetchSpy?: ReturnType<typeof vi.fn>;
  },
) {
  const fetchSpy = args.fetchSpy ?? vi.fn();
  const outcome = await handleIncomingMqttMessage({
    topic: args.topic,
    payloadText: args.payloadText,
    retained: args.retained ?? false,
    config: cfg,
    env: ENV,
    flags: FLAGS,
    haState: state,
    fetchImpl: fetchSpy as unknown as typeof fetch,
    receivedAt: args.receivedAt ?? NOW,
    now: args.now ?? NOW,
  });
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(outcome.kind).toBe("ha_dry_run");
  if (outcome.kind !== "ha_dry_run") {
    throw new Error("expected HA dry-run outcome");
  }
  return outcome.report;
}

function jsonEnvelope(args: {
  entityId: string;
  state: string | number;
  unit: string;
  capturedAt?: string;
}) {
  return JSON.stringify({
    entity_id: args.entityId,
    state: args.state,
    unit_of_measurement: args.unit,
    ...(args.capturedAt === undefined ? {} : { last_updated: args.capturedAt }),
  });
}

async function feedStatestreamEntity(args: {
  cfg: RunnerModeConfig;
  state: HaDryRunState;
  entityId: string;
  value: string;
  unit: string;
  capturedAt?: string;
  retained?: boolean;
  order?: "normal" | "out_of_order";
}) {
  const [domain, objectId] = args.entityId.split(".");
  const root = `homeassistant/${domain}/${objectId}`;
  const parts = {
    state: {
      topic: `${root}/state`,
      payloadText: args.value,
      retained: args.retained ?? false,
    },
    unit: {
      topic: `${root}/unit_of_measurement`,
      payloadText: args.unit,
      retained: false,
    },
    timestamp: {
      topic: `${root}/last_updated`,
      payloadText:
        args.capturedAt === undefined ? "" : JSON.stringify(args.capturedAt),
      retained: false,
    },
  };
  const ordered =
    args.order === "out_of_order"
      ? [parts.timestamp, parts.unit, parts.state]
      : [parts.state, parts.unit, parts.timestamp];

  let last = null as Awaited<ReturnType<typeof feed>> | null;
  for (const part of ordered) {
    last = await feed(args.cfg, args.state, part);
  }
  if (!last) throw new Error("statestream entity produced no report");
  return last;
}

describe("ecowitt-mqtt-runner — HA dry-run VPD pairing", () => {
  it("ha_json pairs same-identity live temp/RH, emits deterministic VPD, and suppresses replay keys", async () => {
    const cfg = config("ha_json");
    const state = createHaDryRunState(cfg);

    const temp = await feed(cfg, state, {
      topic: "verdant/ha-json/temperature",
      payloadText: jsonEnvelope({
        entityId: TEMP_ENTITY,
        state: 78.6,
        unit: "°F",
        capturedAt: LIVE_ISO,
      }),
    });
    expect(temp.readings.map((r) => r.metric)).toEqual(["air_temp_f"]);

    const rh = await feed(cfg, state, {
      topic: "verdant/ha-json/humidity",
      payloadText: jsonEnvelope({
        entityId: RH_ENTITY,
        state: 56,
        unit: "%",
        capturedAt: LIVE_ISO,
      }),
    });
    expect(rh.source).toBe("live");
    expect(rh.readings.map((r) => r.metric)).toEqual([
      "humidity_pct",
      "vpd_kpa",
    ]);

    const vpd = rh.readings.find((r) => r.metric === "vpd_kpa");
    expect(vpd).toBeTruthy();
    expect(vpd!.value).toBeCloseTo(
      calculateAirVpdKpa({ tempF: 78.6, rhPercent: 56 })!,
      3,
    );
    expect(vpd!.entity_id).toBe(
      `vpd_derived:${TEMP_ENTITY}+${RH_ENTITY}`,
    );
    expect(vpd!.idempotency_key.startsWith(`${HA_IDEMPOTENCY_KEY_VERSION}|`)).toBe(
      true,
    );
    expect(state.readingsEmitted).toBe(3);

    const replay = await feed(cfg, state, {
      topic: "verdant/ha-json/humidity",
      payloadText: jsonEnvelope({
        entityId: RH_ENTITY,
        state: 56,
        unit: "%",
        capturedAt: LIVE_ISO,
      }),
    });
    expect(replay.readings.find((r) => r.metric === "vpd_kpa")?.idempotency_key).toBe(
      vpd!.idempotency_key,
    );
    expect(state.readingsEmitted).toBe(3);
    expect(state.duplicatesSuppressed).toBe(2);
  });

  it("ha_statestream produces the same VPD reading for normal and out-of-order sibling topics", async () => {
    const run = async (order: "normal" | "out_of_order") => {
      const cfg = config("ha_statestream");
      const state = createHaDryRunState(cfg);
      await feedStatestreamEntity({
        cfg,
        state,
        entityId: TEMP_ENTITY,
        value: "78.6",
        unit: "°F",
        capturedAt: LIVE_ISO,
        order,
      });
      const report = await feedStatestreamEntity({
        cfg,
        state,
        entityId: RH_ENTITY,
        value: "56",
        unit: "%",
        capturedAt: LIVE_ISO,
        order,
      });
      return {
        report,
        vpd: report.readings.find((r) => r.metric === "vpd_kpa"),
        state,
      };
    };

    const normal = await run("normal");
    const outOfOrder = await run("out_of_order");
    expect(normal.report.source).toBe("live");
    expect(normal.vpd).toBeTruthy();
    expect(outOfOrder.vpd).toEqual(normal.vpd);
    expect(outOfOrder.state.idempotencyKeys).toEqual(normal.state.idempotencyKeys);
  });

  it("does not pair temperature and humidity from different configured channels", async () => {
    const cfg = config("ha_json");
    const state = createHaDryRunState(cfg);
    await feed(cfg, state, {
      topic: "verdant/ha-json/temperature",
      payloadText: jsonEnvelope({
        entityId: TEMP_ENTITY,
        state: 78.6,
        unit: "°F",
        capturedAt: LIVE_ISO,
      }),
    });
    const otherRh = await feed(cfg, state, {
      topic: "verdant/ha-json/humidity-other",
      payloadText: jsonEnvelope({
        entityId: "sensor.other_channel_humidity",
        state: 56,
        unit: "%",
        capturedAt: LIVE_ISO,
      }),
    });
    expect(otherRh.readings.map((r) => r.metric)).toEqual(["humidity_pct"]);
  });
});

describe("ecowitt-mqtt-runner — HA dry-run freshness and retained truth", () => {
  it("ha_json reports a valid old reading as stale and emits no reading", async () => {
    const cfg = config("ha_json");
    const state = createHaDryRunState(cfg);
    const staleIso = new Date(NOW.getTime() - 16 * 60 * 1000).toISOString();
    const report = await feed(cfg, state, {
      topic: "verdant/ha-json/temperature",
      payloadText: jsonEnvelope({
        entityId: TEMP_ENTITY,
        state: 78.6,
        unit: "°F",
        capturedAt: staleIso,
      }),
    });
    expect(report.outcome).toBe("rejected");
    expect(report.source).toBe("stale");
    expect(report.reasons).toContain("stale_reading");
    expect(report.readings).toHaveLength(0);
  });

  it("ha_statestream reports a future source timestamp as invalid", async () => {
    const cfg = config("ha_statestream");
    const state = createHaDryRunState(cfg);
    const futureIso = new Date(NOW.getTime() + 6 * 60 * 1000).toISOString();
    const report = await feedStatestreamEntity({
      cfg,
      state,
      entityId: TEMP_ENTITY,
      value: "78.6",
      unit: "°F",
      capturedAt: futureIso,
    });
    expect(report.outcome).toBe("rejected");
    expect(report.source).toBe("invalid");
    expect(report.reasons).toContain("future_timestamp");
    expect(report.readings).toHaveLength(0);
  });

  it("retained Statestream state without a source timestamp is never live", async () => {
    const cfg = config("ha_statestream");
    const state = createHaDryRunState(cfg);
    const report = await feedStatestreamEntity({
      cfg,
      state,
      entityId: TEMP_ENTITY,
      value: "78.6",
      unit: "°F",
      retained: true,
      capturedAt: undefined,
    });
    expect(report.outcome).toBe("rejected");
    expect(report.source).toBe("invalid");
    expect(report.reasons).toContain("retained_without_source_timestamp");
    expect(report.readings).toHaveLength(0);
  });
});
