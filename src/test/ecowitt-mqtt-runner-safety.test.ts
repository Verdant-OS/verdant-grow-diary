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
