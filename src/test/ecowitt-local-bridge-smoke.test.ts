/**
 * Tests for scripts/dev/ecowitt-local-bridge-smoke.ts
 *
 * - PASS only when fake payload is received on MQTT
 * - FAIL with bridge_down message + start hint when bridge is unreachable
 * - FAIL with mqtt_unreachable when broker is down
 * - Fake payload is clearly labeled FAKE LOCAL TEST
 * - Smoke script imports nothing from supabase and never reads tokens
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FAKE_BODY,
  FAKE_TEST_LABEL,
  buildFakePostInit,
  runSmoke,
} from "../../scripts/dev/ecowitt-local-bridge-smoke";

const SCRIPT_PATH = resolve(__dirname, "../../scripts/dev/ecowitt-local-bridge-smoke.ts");
const SRC = readFileSync(SCRIPT_PATH, "utf8");
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .map((l) => l.replace(/\/\/.*$/, ""))
  .join("\n");

describe("ecowitt-local-bridge-smoke — static safety", () => {
  it("does not import the supabase SDK", () => {
    expect(SRC).not.toMatch(/@supabase\/supabase-js/);
    expect(SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });
  it("does not require any token or service_role", () => {
    expect(CODE).not.toMatch(/VERDANT_BRIDGE_TOKEN/);
    expect(CODE).not.toMatch(/service[_-]?role/i);
  });
  it("does not call the Verdant ingest webhook", () => {
    expect(CODE).not.toMatch(/sensor-ingest-webhook/);
    expect(CODE).not.toMatch(/VERDANT_INGEST_URL/);
  });
  it("never writes to a database", () => {
    expect(CODE).not.toMatch(/\.(insert|upsert|update|delete)\s*\(/);
  });
  it("labels its test payload as FAKE LOCAL TEST", () => {
    expect(FAKE_TEST_LABEL).toBe("FAKE LOCAL TEST");
    expect(SRC).toMatch(/FAKE LOCAL TEST/);
  });
});

describe("buildFakePostInit", () => {
  it("targets the local bridge with form-urlencoded fake payload", () => {
    const { url, init, label } = buildFakePostInit();
    expect(url).toBe("http://127.0.0.1:8080/data/report");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(FAKE_BODY);
    expect(label).toBe("FAKE LOCAL TEST");
  });
});

describe("runSmoke", () => {
  const fakePayloadJson = JSON.stringify({
    temp1f: 77.4,
    humidity1: 58,
    soilmoisture1: 33,
    co2: 721,
    received_at: "2026-01-01T00:00:00.000Z",
    transport: "ecowitt_http_local_bridge",
    topic: "ecowitt/grow",
  });

  it("PASS when fake payload arrives on MQTT", async () => {
    const fetchImpl = async () => new Response("ok", { status: 200 });
    const subscribe = async (
      _u: string,
      _t: string,
      onMessage: (p: string) => void,
    ) => {
      setTimeout(() => onMessage(fakePayloadJson), 10);
      return { close: async () => {} };
    };
    const res = await runSmoke({ timeoutMs: 500 }, { fetchImpl: fetchImpl as unknown as typeof fetch, subscribe });
    expect(res.ok).toBe(true);
    expect(res.matched).toBe(true);
  });

  it("FAIL with bridge_down hint when fetch throws", async () => {
    const fetchImpl = async () => {
      throw new Error("ECONNREFUSED");
    };
    const subscribe = async () => ({ close: async () => {} });
    const res = await runSmoke({ timeoutMs: 100 }, { fetchImpl: fetchImpl as unknown as typeof fetch, subscribe });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/bridge_down/);
    expect(res.reason).toMatch(/dev:ecowitt-http-bridge/);
  });

  it("FAIL with mqtt_unreachable when subscribe throws", async () => {
    const fetchImpl = async () => new Response("ok", { status: 200 });
    const subscribe = async () => {
      throw new Error("broker down");
    };
    const res = await runSmoke({ timeoutMs: 100 }, { fetchImpl: fetchImpl as unknown as typeof fetch, subscribe });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/mqtt_unreachable/);
  });

  it("FAIL when no MQTT message arrives in time", async () => {
    const fetchImpl = async () => new Response("ok", { status: 200 });
    const subscribe = async () => ({ close: async () => {} });
    const res = await runSmoke({ timeoutMs: 100 }, { fetchImpl: fetchImpl as unknown as typeof fetch, subscribe });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/no_mqtt_message/);
  });
});
