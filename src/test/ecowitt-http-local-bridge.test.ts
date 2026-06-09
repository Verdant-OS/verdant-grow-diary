/**
 * Behavioral tests for the local EcoWitt HTTP → MQTT bridge.
 */
import { describe, expect, it, vi } from "vitest";
import {
  buildMqttMessage,
  handleRequest,
  parseEcowittBody,
  parseFlags,
  pathMatches,
  type BridgeFlags,
  type MqttPublisher,
} from "../../scripts/dev/ecowitt-http-local-bridge";

const baseFlags = (overrides: Partial<BridgeFlags> = {}): BridgeFlags => ({
  port: 8080,
  endpoint: "/data/report",
  mqttUrl: "mqtt://127.0.0.1:1883",
  topic: "ecowitt/grow",
  dryRun: false,
  once: false,
  mqttUsername: null,
  mqttPassword: null,
  ...overrides,
});

const fakePublisher = () => {
  const calls: Array<{ topic: string; payload: string }> = [];
  const pub: MqttPublisher = {
    publish: async (topic, payload) => {
      calls.push({ topic, payload });
    },
    end: async () => {},
  };
  return { pub, calls };
};

describe("parseFlags", () => {
  it("defaults match spec", () => {
    const f = parseFlags([], {});
    expect(f.port).toBe(8080);
    expect(f.endpoint).toBe("/data/report");
    expect(f.mqttUrl).toBe("mqtt://127.0.0.1:1883");
    expect(f.topic).toBe("ecowitt/grow");
    expect(f.dryRun).toBe(false);
  });
  it("supports CLI overrides", () => {
    const f = parseFlags(
      ["--port", "9090", "--endpoint", "/x", "--mqtt-url", "mqtt://h:1", "--topic", "t", "--dry-run", "--once"],
      {},
    );
    expect(f.port).toBe(9090);
    expect(f.endpoint).toBe("/x");
    expect(f.mqttUrl).toBe("mqtt://h:1");
    expect(f.topic).toBe("t");
    expect(f.dryRun).toBe(true);
    expect(f.once).toBe(true);
  });
});

describe("pathMatches", () => {
  it("accepts trailing slash variants", () => {
    expect(pathMatches("/data/report", "/data/report")).toBe(true);
    expect(pathMatches("/data/report/", "/data/report")).toBe(true);
    expect(pathMatches("/data/report?x=1", "/data/report")).toBe(true);
  });
  it("rejects other paths", () => {
    expect(pathMatches("/other", "/data/report")).toBe(false);
    expect(pathMatches("/data/reportX", "/data/report")).toBe(false);
  });
});

describe("parseEcowittBody", () => {
  it("parses form-urlencoded numbers and strings", () => {
    const out = parseEcowittBody(
      "temp1f=77.4&humidity1=58&stationtype=GW1200",
      "application/x-www-form-urlencoded",
    );
    expect(out).toEqual({ temp1f: 77.4, humidity1: 58, stationtype: "GW1200" });
  });
  it("parses raw key=value body without content-type", () => {
    const out = parseEcowittBody("co2=721&soilmoisture1=33", undefined);
    expect(out).toEqual({ co2: 721, soilmoisture1: 33 });
  });
  it("parses JSON body", () => {
    const out = parseEcowittBody('{"temp1f":70,"stationtype":"GW1200"}', "application/json");
    expect(out).toEqual({ temp1f: 70, stationtype: "GW1200" });
  });
  it("returns null for empty/malformed", () => {
    expect(parseEcowittBody("", "application/json")).toBeNull();
    expect(parseEcowittBody("{not json", "application/json")).toBeNull();
  });
});

describe("buildMqttMessage", () => {
  it("includes received_at, transport, topic, and identifies numeric metric keys", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const msg = buildMqttMessage(
      { temp1f: 77.4, humidity1: 58, stationtype: "GW1200" },
      "ecowitt/grow",
      now,
    );
    expect(msg.topic).toBe("ecowitt/grow");
    const obj = JSON.parse(msg.payload);
    expect(obj.transport).toBe("ecowitt_http_local_bridge");
    expect(obj.topic).toBe("ecowitt/grow");
    expect(obj.received_at).toBe("2026-01-01T00:00:00.000Z");
    expect(obj.temp1f).toBe(77.4);
    expect(msg.metricKeys.sort()).toEqual(["humidity1", "temp1f"]);
  });
});

describe("handleRequest", () => {
  it("accepts POST /data/report and publishes to MQTT", async () => {
    const { pub, calls } = fakePublisher();
    const res = await handleRequest(
      {
        method: "POST",
        url: "/data/report",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: "temp1f=77.4&humidity1=58",
      },
      baseFlags(),
      pub,
    );
    expect(res.status).toBe(200);
    expect(res.published).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].topic).toBe("ecowitt/grow");
    expect(JSON.parse(calls[0].payload).temp1f).toBe(77.4);
  });

  it("accepts trailing-slash /data/report/", async () => {
    const { pub, calls } = fakePublisher();
    const res = await handleRequest(
      { method: "POST", url: "/data/report/", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "temp1f=70" },
      baseFlags(),
      pub,
    );
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("rejects wrong paths with 404", async () => {
    const { pub, calls } = fakePublisher();
    const res = await handleRequest(
      { method: "POST", url: "/other", headers: {}, body: "x=1" },
      baseFlags(),
      pub,
    );
    expect(res.status).toBe(404);
    expect(calls).toHaveLength(0);
  });

  it("rejects non-POST with 405", async () => {
    const { pub } = fakePublisher();
    const res = await handleRequest(
      { method: "GET", url: "/data/report", headers: {}, body: "" },
      baseFlags(),
      pub,
    );
    expect(res.status).toBe(405);
  });

  it("returns 400 on malformed payload", async () => {
    const { pub, calls } = fakePublisher();
    const res = await handleRequest(
      { method: "POST", url: "/data/report", headers: { "content-type": "application/json" }, body: "{not json" },
      baseFlags(),
      pub,
    );
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("dry-run parses and does NOT publish", async () => {
    const { pub, calls } = fakePublisher();
    const res = await handleRequest(
      { method: "POST", url: "/data/report", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "temp1f=77.4" },
      baseFlags({ dryRun: true }),
      pub,
    );
    expect(res.status).toBe(200);
    expect(res.published).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("logs metric keys but never raw token-like values", async () => {
    const { pub } = fakePublisher();
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    await handleRequest(
      { method: "POST", url: "/data/report", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "temp1f=77.4&apikey=vbt_secret_should_never_appear" },
      baseFlags(),
      pub,
    );
    const allLogs = spy.mock.calls.flat().map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    spy.mockRestore();
    expect(allLogs).not.toMatch(/vbt_secret_should_never_appear/);
    expect(allLogs).toMatch(/temp1f/);
  });

  it("returns 502 if MQTT publish fails", async () => {
    const pub: MqttPublisher = {
      publish: async () => { throw new Error("broker down"); },
      end: async () => {},
    };
    const res = await handleRequest(
      { method: "POST", url: "/data/report", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "temp1f=70" },
      baseFlags(),
      pub,
    );
    expect(res.status).toBe(502);
    expect(res.published).toBe(false);
  });
});
