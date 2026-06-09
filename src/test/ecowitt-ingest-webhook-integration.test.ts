/**
 * Mocked integration test: local EcoWitt sender → sensor-ingest-webhook.
 *
 * Uses mocked fetch; does not hit the real network. Verifies that the
 * runner builds and posts the correct contract safely.
 */
import { describe, expect, it, vi } from "vitest";
import { normalizeEcowittMqttPayload } from "@/lib/ecowittMqttIngestRules";
import { handlePayload, buildSamplePayload } from "../../scripts/dev/ecowitt-mqtt-runner";

const URL = "https://example.supabase.co/functions/v1/sensor-ingest-webhook";
const TOKEN = "vbt_abcdef1234567890";
const TENT = "00000000-0000-4000-8000-000000000000";

const baseEnv = {
  url: URL,
  token: TOKEN,
  tentId: TENT,
  plantId: null,
  mqttUrl: "mqtt://127.0.0.1:1883",
  mqttTopic: "ecowitt/grow",
  mqttUsername: null,
  mqttPassword: null,
};

describe("ecowitt → sensor-ingest-webhook (mocked fetch)", () => {
  it("builds normalized payload from sample MQTT JSON and POSTs canonical shape", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 202 }));

    const payload = buildSamplePayload(false);
    const res = await handlePayload(
      payload,
      baseEnv,
      { dryRun: false, once: true, sample: true, invalid: false },
      fetchSpy as unknown as typeof fetch,
    );

    expect(res.posted).toBe(true);
    expect(fetchSpy).toHaveBeenCalledOnce();

    const [calledUrl, init] = fetchSpy.mock.calls[0];
    expect(calledUrl).toBe(URL);

    // Headers — Authorization is Bearer token; Idempotency-Key present.
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Bearer vbt_/);
    expect(headers["Idempotency-Key"]).toBeTruthy();
    expect(headers["Content-Type"]).toBe("application/json");

    // Canonical payload shape.
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.tent_id).toBe(TENT);
    expect(body.source).toBe("ecowitt");
    expect(body.vendor).toBe("ecowitt");
    expect(typeof body.captured_at).toBe("string");
    expect(body.metadata).toMatchObject({
      transport: "mqtt_local_bridge",
      topic: "ecowitt/grow",
    });

    // Canonical metric mapping.
    expect(body.metrics.temp_f).toBeCloseTo(78.6, 1);
    expect(body.metrics.humidity_pct).toBe(56);
    expect(body.metrics.soil_moisture_pct).toBe(45);
    expect(body.metrics.co2_ppm).toBe(720);
    // VPD included only when temp + RH are valid.
    expect(typeof body.metrics.vpd_kpa).toBe("number");
  });

  it("rejection: impossible humidity does not POST when no valid metrics remain", async () => {
    const fetchSpy = vi.fn();
    const payload = { dateutc: nowDateUtc(), tempf: 7431, humidity: 250 };
    const res = await handlePayload(
      payload,
      baseEnv,
      { dryRun: false, once: true, sample: false, invalid: true },
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.posted).toBe(false);
    expect(res.reasons).toEqual(expect.arrayContaining(["invalid_temp", "invalid_rh"]));
  });

  it("stale timestamp is never POSTed as live", async () => {
    const fetchSpy = vi.fn();
    const stale = {
      dateutc: "2025-01-01 00:00:00",
      tempf: 78.6,
      humidity: 56,
    };
    const res = await handlePayload(
      stale,
      baseEnv,
      { dryRun: false, once: true, sample: false, invalid: false },
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.reasons).toContain("stale_reading");
  });

  it("malformed payload produces clear error and does not POST", async () => {
    const fetchSpy = vi.fn();
    const res = await handlePayload(
      { tempf: 76, humidity: 56 } as never,
      baseEnv,
      { dryRun: false, once: true, sample: false, invalid: false },
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(res.reasons).toContain("missing_captured_at");
  });

  it("--dry-run never calls fetch", async () => {
    const fetchSpy = vi.fn();
    await handlePayload(
      buildSamplePayload(false),
      baseEnv,
      { dryRun: true, once: true, sample: true, invalid: false },
      fetchSpy as unknown as typeof fetch,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("normalizer also rejects impossible CO2 in isolation", () => {
    const r = normalizeEcowittMqttPayload({
      payload: { dateutc: nowDateUtc(), tempf: 76, humidity: 56, co2: 99999 },
      tentId: TENT,
    });
    expect(r.reasons).toContain("invalid_co2");
  });

  it("local bridge script imports no Supabase SDK and never user_id", async () => {
    const src = (await import("node:fs")).readFileSync(
      "scripts/dev/ecowitt-mqtt-runner.ts",
      "utf8",
    );
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).not.toMatch(/VERDANT_USER_ID/);
    expect(src).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });
});

function nowDateUtc(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
