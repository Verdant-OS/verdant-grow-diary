/**
 * Static + behavioral safety scans for scripts/dev/ecowitt-mqtt-runner.ts.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SCRIPT_PATH = resolve(__dirname, "../../scripts/dev/ecowitt-mqtt-runner.ts");
const SRC = readFileSync(SCRIPT_PATH, "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("ecowitt-mqtt-runner — static safety", () => {
  it("does not import the supabase client / SDK", () => {
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });

  it("does not perform direct DB writes", () => {
    expect(SRC).not.toMatch(/\.from\(\s*["']sensor_readings/);
    expect(SRC).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });

  it("never references service_role in executable code", () => {
    expect(CODE).not.toMatch(/service[_-]?role/i);
  });

  it("does not contain device-control or action_queue strings", () => {
    expect(CODE).not.toMatch(/action_queue/i);
    expect(CODE).not.toMatch(/device_command|relay_on|valve_open|light_on/i);
  });

  it("uses the configured ingest URL and bridge token via env", () => {
    expect(SRC).toMatch(/VERDANT_INGEST_URL/);
    expect(SRC).toMatch(/VERDANT_BRIDGE_TOKEN/);
    expect(SRC).toMatch(/VERDANT_TENT_ID/);
  });

  it("does not require VERDANT_USER_ID", () => {
    expect(SRC).not.toMatch(/VERDANT_USER_ID/);
  });

  it("supports --dry-run, --once, --sample, --invalid flags", () => {
    expect(SRC).toMatch(/--dry-run/);
    expect(SRC).toMatch(/--once/);
    expect(SRC).toMatch(/--sample/);
    expect(SRC).toMatch(/--invalid/);
  });

  it("redacts the bridge token in logs", () => {
    expect(SRC).toMatch(/redactBridgeToken\(/);
    const rawTokenLogs =
      ((CODE.match(/console\.log\([^)]*\benv\.token\b[^)]*\)/g) ?? []) as string[]).filter(
        (l) => !l.includes("redactBridgeToken"),
      );
    expect(rawTokenLogs).toEqual([]);
  });

  it("defaults MQTT broker URL and topic", () => {
    expect(SRC).toMatch(/mqtt:\/\/127\.0\.0\.1:1883/);
    expect(SRC).toMatch(/ecowitt\/grow/);
  });

  it("declares the configuration-routing knobs (UPSTREAM_MODE + HA_MQTT_MAPPING_PATH)", () => {
    expect(SRC).toMatch(/UPSTREAM_MODE/);
    expect(SRC).toMatch(/HA_MQTT_MAPPING_PATH/);
    // All three valid modes are spelled out for the fail-closed error.
    expect(SRC).toMatch(/ecowitt_raw/);
    expect(SRC).toMatch(/ha_json/);
    expect(SRC).toMatch(/ha_statestream/);
  });

  it("mapping file access is read-only and read once at startup (no watchers, no writers)", () => {
    expect(CODE).not.toMatch(/fs\.watch|watchFile|chokidar/i);
    // The only fs write surface remains the redacted report writer.
    const writeCalls = (CODE.match(/writeFile\s*\(/g) ?? []).length;
    expect(writeCalls).toBeLessThanOrEqual(1);
  });

  it("no continuous-live claims in runner copy", () => {
    expect(SRC).not.toMatch(/continuous(ly)?[-\s]?(live|monitoring)/i);
    expect(SRC).not.toMatch(/24\/7/);
    expect(SRC).not.toMatch(/always[-\s]on/i);
  });

  it("runner-level HA fixtures contain no secrets or tokens", () => {
    const SECRET_PATTERNS = [
      /password/i,
      /passkey/i,
      /service[_-]?role/i,
      /vbt_[a-z0-9]+/i,
      /sk_live_/i,
      /Bearer\s+ey/i,
      /eyJ[A-Za-z0-9_-]{20,}/,
      /VERDANT_BRIDGE_TOKEN/i,
      /SUPABASE_[A-Z_]+/,
      /long[_-]?lived/i,
    ];
    const text = readFileSync(
      resolve(
        __dirname,
        "../../fixtures/home-assistant-ecowitt-mqtt/runner-statestream-mapping.json",
      ),
      "utf8",
    );
    for (const re of SECRET_PATTERNS) {
      expect(text, `runner-statestream-mapping.json must not contain ${re}`).not.toMatch(re);
    }
  });
});

describe("ecowitt-mqtt-runner — runtime behavior", () => {
  it("dry-run does not call fetch even with a valid sample", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    const fetchSpy = vi.fn();
    const env = {
      url: "https://example/functions/v1/sensor-ingest-webhook",
      token: "vbt_abcdef1234567890",
      tentId: "00000000-0000-4000-8000-000000000000",
      plantId: null,
      mqttUrl: "mqtt://127.0.0.1:1883",
      mqttTopic: "ecowitt/grow",
      mqttUsername: null,
      mqttPassword: null,
    };
    const res = await mod.handlePayload(
      mod.buildSamplePayload(false),
      env,
      { dryRun: true, once: true, sample: true, invalid: false },
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.posted).toBe(false);
    expect(res.status).toBe("dry_run");
  });

  it("invalid sample does not POST as accepted", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    const fetchSpy = vi.fn();
    const env = {
      url: "https://example/functions/v1/sensor-ingest-webhook",
      token: "vbt_abcdef1234567890",
      tentId: "00000000-0000-4000-8000-000000000000",
      plantId: null,
      mqttUrl: "mqtt://127.0.0.1:1883",
      mqttTopic: "ecowitt/grow",
      mqttUsername: null,
      mqttPassword: null,
    };
    const res = await mod.handlePayload(
      mod.buildSamplePayload(true),
      env,
      { dryRun: false, once: true, sample: false, invalid: true },
      fetchSpy as unknown as typeof fetch,
    );
    // Invalid normalizer result must NOT POST.
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.posted).toBe(false);
    expect(res.classification).not.toBe("accepted");
  });

  it("valid sample builds canonical webhook body and posts only to env URL", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fakeFetch = vi
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return new Response("ok", { status: 202 });
      });
    const env = {
      url: "https://example/functions/v1/sensor-ingest-webhook",
      token: "vbt_abcdef1234567890",
      tentId: "00000000-0000-4000-8000-000000000000",
      plantId: null,
      mqttUrl: "mqtt://127.0.0.1:1883",
      mqttTopic: "ecowitt/grow",
      mqttUsername: null,
      mqttPassword: null,
    };
    const res = await mod.handlePayload(
      mod.buildSamplePayload(false),
      env,
      { dryRun: false, once: true, sample: true, invalid: false },
      fakeFetch as unknown as typeof fetch,
    );
    expect(res.posted).toBe(true);
    expect(calls.length).toBe(1);
    expect(calls[0].url).toBe(env.url);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.tent_id).toBe(env.tentId);
    expect(body.source).toBe("ecowitt");
    expect(body.vendor).toBe("ecowitt");
    expect(body.metrics).toHaveProperty("temp_f");
    expect(body.metrics).toHaveProperty("humidity_pct");
    expect(body.metadata.transport).toBe("mqtt_local_bridge");
    expect(body.metadata.topic).toBe("ecowitt/grow");
    // Authorization header is Bearer + the raw token (sent to server)
    // but the runner never logs it plaintext (covered above).
    expect((calls[0].init.headers as Record<string, string>).Authorization).toMatch(
      /^Bearer vbt_/,
    );
    expect(
      (calls[0].init.headers as Record<string, string>)["Idempotency-Key"],
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Configuration-based routing fences (fail closed, no inference)
// ---------------------------------------------------------------------------

const FIXTURES = resolve(__dirname, "../../fixtures/home-assistant-ecowitt-mqtt");

const TEST_ENV = {
  url: "https://example/functions/v1/sensor-ingest-webhook",
  token: "vbt_abcdef1234567890",
  tentId: "00000000-0000-4000-8000-000000000000",
  plantId: null,
  mqttUrl: "mqtt://127.0.0.1:1883",
  mqttTopic: "ecowitt/grow",
  mqttUsername: null,
  mqttPassword: null,
};
const LIVE_FLAGS = { dryRun: false, once: false, sample: false, invalid: false };
const SS_NOW = new Date("2026-07-22T18:00:30.000Z");

describe("ecowitt-mqtt-runner — fail-closed configuration routing", () => {
  it("missing or invalid upstream_mode throws before any message is consumed", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    for (const env of [{}, { UPSTREAM_MODE: "" }, { UPSTREAM_MODE: "bogus" }]) {
      expect(() => mod.resolveRunnerModeConfig(env as NodeJS.ProcessEnv)).toThrow(
        mod.RunnerConfigError,
      );
      try {
        mod.resolveRunnerModeConfig(env as NodeJS.ProcessEnv);
      } catch (e) {
        const msg = (e as Error).message;
        expect(msg).toContain("ecowitt_raw");
        expect(msg).toContain("ha_json");
        expect(msg).toContain("ha_statestream");
      }
    }
  });

  it("HA modes without HA_MQTT_MAPPING_PATH fail closed; errors never echo mapping contents", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    for (const mode of ["ha_json", "ha_statestream"]) {
      expect(() =>
        mod.resolveRunnerModeConfig({ UPSTREAM_MODE: mode } as NodeJS.ProcessEnv),
      ).toThrow(/HA_MQTT_MAPPING_PATH/);
    }
    // Invalid-JSON mapping: the error names the path only, never contents.
    try {
      mod.resolveRunnerModeConfig(
        {
          UPSTREAM_MODE: "ha_json",
          HA_MQTT_MAPPING_PATH: "/cfg/mapping.json",
        } as NodeJS.ProcessEnv,
        () => "{CONTENT_SENTINEL_vbt_deadbeef",
      );
      expect.unreachable("invalid JSON mapping must fail closed");
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain("/cfg/mapping.json");
      expect(msg).not.toContain("CONTENT_SENTINEL");
      expect(msg).not.toMatch(/vbt_deadbeef/);
    }
  });
});

describe("ecowitt-mqtt-runner — HA modes are dry-run only (no-write posture)", () => {
  it("ha_statestream never calls fetch even for live-valid fixture data", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    const fixture = JSON.parse(
      readFileSync(resolve(FIXTURES, "ha-statestream-scenarios.json"), "utf8"),
    ) as {
      scenarios: Record<
        string,
        { parts: Array<{ topic: string; payload: string; retained: boolean; receivedAt: string }> }
      >;
    };
    const config = mod.resolveRunnerModeConfig({
      UPSTREAM_MODE: "ha_statestream",
      HA_MQTT_MAPPING_PATH: resolve(FIXTURES, "runner-statestream-mapping.json"),
    } as NodeJS.ProcessEnv);
    const state = mod.createHaDryRunState(config);
    const fetchSpy = vi.fn();
    let sawReading = false;
    for (const p of fixture.scenarios.separate_topics.parts) {
      const outcome = await mod.handleIncomingMqttMessage({
        topic: p.topic,
        payloadText: p.payload,
        retained: p.retained,
        config,
        env: TEST_ENV,
        flags: LIVE_FLAGS,
        haState: state,
        fetchImpl: fetchSpy as unknown as typeof fetch,
        receivedAt: new Date(p.receivedAt),
        now: SS_NOW,
      });
      expect(outcome.kind).toBe("ha_dry_run");
      if (outcome.kind === "ha_dry_run") {
        expect(outcome.report.dry_run).toBe(true);
        expect(outcome.report.posted).toBe(false);
        if (outcome.report.outcome === "reading") sawReading = true;
      }
    }
    // The fixture DID produce a live reading — and still nothing was fetched.
    expect(sawReading).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ha_json never calls fetch even for a live-valid envelope", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    const config = mod.resolveRunnerModeConfig({
      UPSTREAM_MODE: "ha_json",
      HA_MQTT_MAPPING_PATH: resolve(FIXTURES, "example-mapping.json"),
    } as NodeJS.ProcessEnv);
    const state = mod.createHaDryRunState(config);
    const fetchSpy = vi.fn();
    const outcome = await mod.handleIncomingMqttMessage({
      topic: "verdant/ha_json/ingest",
      payloadText: JSON.stringify({
        entity_id: "sensor.ecowitt_gw1200_outdoor_temperature",
        state: "78.6",
        unit_of_measurement: "°F",
        last_updated: "2026-07-22T18:00:00.000Z",
      }),
      retained: false,
      config,
      env: TEST_ENV,
      flags: LIVE_FLAGS,
      haState: state,
      fetchImpl: fetchSpy as unknown as typeof fetch,
      receivedAt: SS_NOW,
      now: SS_NOW,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(outcome.kind).toBe("ha_dry_run");
    if (outcome.kind === "ha_dry_run") {
      expect(outcome.report.outcome).toBe("reading");
      expect(outcome.report.posted).toBe(false);
      expect(outcome.report.dry_run).toBe(true);
    }
  });

  it("HA dry-run reports never contain the bridge token or an Authorization header", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    const config = mod.resolveRunnerModeConfig({
      UPSTREAM_MODE: "ha_json",
      HA_MQTT_MAPPING_PATH: resolve(FIXTURES, "example-mapping.json"),
    } as NodeJS.ProcessEnv);
    const state = mod.createHaDryRunState(config);
    const outcome = await mod.handleIncomingMqttMessage({
      topic: "verdant/ha_json/ingest",
      payloadText: JSON.stringify({
        entity_id: "sensor.ecowitt_gw1200_outdoor_temperature",
        state: "78.6",
        unit_of_measurement: "°F",
        last_updated: "2026-07-22T18:00:00.000Z",
      }),
      retained: false,
      config,
      env: TEST_ENV, // carries a vbt_ token — it must never reach HA output
      flags: LIVE_FLAGS,
      haState: state,
      receivedAt: SS_NOW,
      now: SS_NOW,
    });
    const serialized = JSON.stringify(outcome);
    expect(serialized).not.toMatch(/vbt_[a-z0-9]+/i);
    expect(serialized).not.toMatch(/Authorization/i);
    expect(serialized).not.toMatch(/service[_-]?role/i);
  });
});

describe("ecowitt-mqtt-runner — no topic-shape inference", () => {
  it("a statestream-shaped topic arriving in ecowitt_raw mode is NOT statestream-parsed", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    const config = mod.resolveRunnerModeConfig({
      UPSTREAM_MODE: "ecowitt_raw",
    } as NodeJS.ProcessEnv);
    const fetchSpy = vi.fn();
    // Exact wire shape a Statestream bridge would publish.
    const outcome = await mod.handleIncomingMqttMessage({
      topic: "verdant/ecowitt/sensor/flower_tent_temperature/state",
      payloadText: "78.6",
      retained: false,
      config,
      env: TEST_ENV,
      flags: LIVE_FLAGS,
      haState: null,
      fetchImpl: fetchSpy as unknown as typeof fetch,
      receivedAt: SS_NOW,
      now: SS_NOW,
    });
    // Routed to the RAW path purely by config; the scalar payload is a
    // malformed raw EcoWitt payload — never a statestream part.
    expect(outcome.kind).toBe("ecowitt_raw");
    if (outcome.kind === "ecowitt_raw") {
      expect(outcome.result.posted).toBe(false);
      expect(outcome.result.reasons).toContain("malformed_payload");
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    // No hav2 idempotency key can appear on the raw branch for this input.
    expect(JSON.stringify(outcome)).not.toContain("hav2|");
  });

  it("a raw EcoWitt payload on the raw topic in ha_statestream mode is NOT raw-parsed", async () => {
    const mod = await import("../../scripts/dev/ecowitt-mqtt-runner");
    const config = mod.resolveRunnerModeConfig({
      UPSTREAM_MODE: "ha_statestream",
      HA_MQTT_MAPPING_PATH: resolve(FIXTURES, "runner-statestream-mapping.json"),
    } as NodeJS.ProcessEnv);
    const state = mod.createHaDryRunState(config);
    const fetchSpy = vi.fn();
    const outcome = await mod.handleIncomingMqttMessage({
      topic: "ecowitt/grow",
      payloadText: JSON.stringify({
        dateutc: "2026-07-22 18:00:00",
        tempf: 78.6,
        humidity: 56,
        stationtype: "GW1200",
      }),
      retained: false,
      config,
      env: TEST_ENV,
      flags: LIVE_FLAGS,
      haState: state,
      fetchImpl: fetchSpy as unknown as typeof fetch,
      receivedAt: SS_NOW,
      now: SS_NOW,
    });
    expect(outcome.kind).toBe("ha_dry_run");
    if (outcome.kind === "ha_dry_run") {
      // Counted as outside the configured prefix — never normalized as a
      // raw gateway payload, never POSTed, never dropped silently.
      expect(outcome.report.outcome).toBe("ignored");
      expect(outcome.report.reason_counts.statestream_topic_ignored).toBe(1);
      expect(outcome.report.readings).toHaveLength(0);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
