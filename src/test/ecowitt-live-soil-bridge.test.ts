/**
 * Tests for the pure EcoWitt live soil ingest normalizer and the bridge
 * orchestration. No MQTT, no network — `forward` is injected.
 */
import { describe, it, expect, vi } from "vitest";
import {
  normalizeEcowittLiveSoilPayload,
  parseEcowittSoilChannelMap,
  validateChannelMapSingleTent,
  classifyEcowittChannelMapJsonInput,
  redactRawPayloadForOutbound,
  redactForLog,
  maskBridgeToken,
  fullJitterBackoffMs,
  deriveBridgeVpdKpa,
} from "@/lib/ecowittLiveSoilIngestRules";
import {
  handleMqttMessage,
  forwardWithBackoff,
  readBridgeEnv,
  buildConfigValidationSummary,
  runBridge,
  type BridgeEnv,
} from "../../scripts/ecowitt-live-soil-bridge";

const TENT = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-06-19T12:00:00.000Z");

function basePayload(extra: Record<string, unknown> = {}) {
  return {
    dateutc: "2026-06-19 12:00:00",
    tempf: 78.6,
    humidity: 56,
    ...extra,
  };
}

describe("normalizeEcowittLiveSoilPayload — air / VPD", () => {
  it("derives vpd_kpa from valid temp + RH and emits one air payload", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: basePayload(),
      defaultTentId: TENT,
      now: NOW,
    });
    expect(r.payloads).toHaveLength(1);
    const p = r.payloads[0];
    expect(p.source).toBe("ecowitt");
    expect(p.vendor).toBe("ecowitt");
    expect(p.tent_id).toBe(TENT);
    expect(p.metrics.temp_f).toBeCloseTo(78.6, 1);
    expect(p.metrics.humidity_pct).toBe(56);
    expect(typeof p.metrics.vpd_kpa).toBe("number");
    expect(p.metrics.vpd_kpa).toBeGreaterThan(0);
    expect(p.metadata.derived_vpd).toBe(true);
    expect(p.metadata.transport).toBe("mqtt");
  });

  it("accepts Celsius air temp via tempc and converts before VPD", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", tempc: 25, humidity: 55 },
      defaultTentId: TENT,
      now: NOW,
    });
    expect(r.payloads[0].metrics.temp_f).toBeCloseTo(77, 0);
    expect(r.payloads[0].metrics.vpd_kpa).toBeGreaterThan(0);
  });

  it("does NOT derive VPD when humidity is missing", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", tempf: 78.6 },
      defaultTentId: TENT,
      now: NOW,
    });
    expect(r.payloads[0].metrics.vpd_kpa).toBeUndefined();
  });

  it.each([
    ["zero", 0],
    ["over 100", 101],
    ["negative", -5],
  ])("does NOT derive VPD when RH is %s", (_label, rh) => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", tempf: 78.6, humidity: rh },
      defaultTentId: TENT,
      now: NOW,
    });
    if (r.payloads.length > 0) {
      expect(r.payloads[0].metrics.vpd_kpa).toBeUndefined();
    }
    expect(r.reasons).toContain("invalid_rh");
  });

  it("does NOT derive VPD when air temp is unrealistic", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", tempf: 9999, humidity: 55 },
      defaultTentId: TENT,
      now: NOW,
    });
    expect(r.reasons).toContain("invalid_temp");
    // No air metrics → no air payload
    expect(r.payloads.find((p) => p.metrics.vpd_kpa !== undefined)).toBeUndefined();
  });

  it("never emits vpd_kpa = 0 as a missing sentinel", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", tempf: 78.6 },
      defaultTentId: TENT,
      now: NOW,
    });
    for (const p of r.payloads) {
      expect(p.metrics.vpd_kpa === 0).toBe(false);
    }
  });

  it("deriveBridgeVpdKpa is pure: F display values must not be passed in", () => {
    // We must give Celsius. Passing the F value as C would still compute,
    // but operators of the helper must pre-convert. Verify guards anyway.
    expect(deriveBridgeVpdKpa({ airTempC: 25, rhPercent: 55 })).toBeGreaterThan(0);
    expect(deriveBridgeVpdKpa({ airTempC: null, rhPercent: 55 })).toBeNull();
    expect(deriveBridgeVpdKpa({ airTempC: 25, rhPercent: null })).toBeNull();
    expect(deriveBridgeVpdKpa({ airTempC: 25, rhPercent: 0 })).toBeNull();
    expect(deriveBridgeVpdKpa({ airTempC: 25, rhPercent: 101 })).toBeNull();
  });
});

describe("normalizeEcowittLiveSoilPayload — soil channels", () => {
  const channelMap = parseEcowittSoilChannelMap(
    JSON.stringify({
      soilmoisture1: { tent_id: TENT, plant_id: "p1", label: "front_left" },
      soilmoisture2: { tent_id: TENT_B, label: "front_right" },
    }),
  );

  it("maps soilmoisture1 and soilmoisture2 to separate payloads", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: {
        dateutc: "2026-06-19 12:00:00",
        soilmoisture1: 45,
        soilmoisture2: 60,
        soiltemp1f: 70,
      },
      soilChannelMap: channelMap,
      now: NOW,
    });
    const ch1 = r.payloads.find((p) => p.metadata.channel === "soilmoisture1");
    const ch2 = r.payloads.find((p) => p.metadata.channel === "soilmoisture2");
    expect(ch1?.tent_id).toBe(TENT);
    expect(ch1?.metadata.plant_id).toBe("p1");
    expect(ch1?.metrics.soil_moisture_pct).toBe(45);
    expect(ch1?.metrics.soil_temp_f).toBe(70);
    expect(ch2?.tent_id).toBe(TENT_B);
    expect(ch2?.metrics.soil_moisture_pct).toBe(60);
  });

  it("rejects soil moisture <0 and >100 (never healthy)", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: {
        dateutc: "2026-06-19 12:00:00",
        soilmoisture1: -1,
        soilmoisture2: 101,
      },
      soilChannelMap: channelMap,
      now: NOW,
    });
    expect(r.payloads.find((p) => p.metrics.soil_moisture_pct !== undefined)).toBeUndefined();
    expect(r.reasons.filter((r) => r === "invalid_soil_moisture")).toHaveLength(2);
  });

  it("flags stuck repeated 0 and stuck repeated 100", () => {
    const hist = new Map<string, number[]>();
    for (let i = 0; i < 3; i++) {
      normalizeEcowittLiveSoilPayload({
        payload: { dateutc: "2026-06-19 12:00:00", soilmoisture1: 0 },
        soilChannelMap: channelMap,
        recentSoilHistory: hist,
        now: NOW,
      });
    }
    const stuck = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", soilmoisture1: 0 },
      soilChannelMap: channelMap,
      recentSoilHistory: hist,
      now: NOW,
    });
    expect(stuck.reasons).toContain("stuck_soil_moisture");

    const hist2 = new Map<string, number[]>();
    for (let i = 0; i < 3; i++) {
      normalizeEcowittLiveSoilPayload({
        payload: { dateutc: "2026-06-19 12:00:00", soilmoisture1: 100 },
        soilChannelMap: channelMap,
        recentSoilHistory: hist2,
        now: NOW,
      });
    }
    const stuck100 = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", soilmoisture1: 100 },
      soilChannelMap: channelMap,
      recentSoilHistory: hist2,
      now: NOW,
    });
    expect(stuck100.reasons).toContain("stuck_soil_moisture");
  });

  it("skips probes that lack a channel mapping", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", soilmoisture7: 42 },
      soilChannelMap: channelMap,
      now: NOW,
    });
    expect(r.payloads).toHaveLength(0);
    expect(r.reasons).toContain("no_routing");
  });

  it("maps soiltemp1c (Celsius) to canonical soil_temp_f", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", soilmoisture1: 40, soiltemp1c: 20 },
      soilChannelMap: channelMap,
      now: NOW,
    });
    const p = r.payloads.find((p) => p.metadata.channel === "soilmoisture1")!;
    expect(p.metrics.soil_temp_f).toBeCloseTo(68, 0);
  });
});

describe("normalizeEcowittLiveSoilPayload — provenance / safety", () => {
  it("rejects stale readings (older than 15 minutes)", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 11:00:00", tempf: 78, humidity: 55 },
      defaultTentId: TENT,
      now: NOW,
    });
    expect(r.payloads).toHaveLength(0);
    expect(r.reasons).toContain("stale_reading");
  });

  it("rejects future timestamps beyond 5-minute tolerance", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:30:00", tempf: 78, humidity: 55 },
      defaultTentId: TENT,
      now: NOW,
    });
    expect(r.payloads).toHaveLength(0);
    expect(r.reasons).toContain("future_timestamp");
  });

  it("falls back to injected clock when dateutc is missing", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { tempf: 78, humidity: 55 },
      defaultTentId: TENT,
      now: NOW,
    });
    expect(r.payloads[0].captured_at).toBe(NOW.toISOString());
  });

  it("returns malformed for non-object input", () => {
    // @ts-expect-error testing runtime guard
    const r = normalizeEcowittLiveSoilPayload({ payload: "not-an-object" });
    expect(r.reasons).toContain("malformed_payload");
  });

  it("preserves provider/source/transport labels and CO2 ppm", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: { dateutc: "2026-06-19 12:00:00", tempf: 78, humidity: 55, co2: 800 },
      defaultTentId: TENT,
      now: NOW,
    });
    const p = r.payloads[0];
    expect(p.source).toBe("ecowitt");
    expect(p.vendor).toBe("ecowitt");
    expect(p.metadata.transport).toBe("mqtt");
    expect(p.metrics.co2_ppm).toBe(800);
  });

  it("redacts PASSKEY/MAC/token-like keys from raw_payload", () => {
    const r = normalizeEcowittLiveSoilPayload({
      payload: {
        dateutc: "2026-06-19 12:00:00",
        tempf: 78,
        humidity: 55,
        PASSKEY: "ABCDEF123456",
        mac: "AA:BB:CC:DD:EE:FF",
        stationtype: "GW1200B_V1.2.3",
        password: "hunter2",
      },
      defaultTentId: TENT,
      now: NOW,
    });
    const raw = r.payloads[0].raw_payload as Record<string, unknown>;
    expect(raw.PASSKEY).toBe("[redacted]");
    expect(raw.mac).toBe("[redacted]");
    expect(raw.stationtype).toBe("[redacted]");
    expect(raw.password).toBe("[redacted]");
  });
});

describe("parseEcowittSoilChannelMap", () => {
  it("parses well-formed JSON", () => {
    const m = parseEcowittSoilChannelMap(
      JSON.stringify({ soilmoisture1: { tent_id: TENT, label: "x" } }),
    );
    expect(m.soilmoisture1?.tent_id).toBe(TENT);
  });
  it("returns empty for invalid JSON / arrays / missing tent_id", () => {
    expect(Object.keys(parseEcowittSoilChannelMap("not-json"))).toHaveLength(0);
    expect(Object.keys(parseEcowittSoilChannelMap(JSON.stringify([1, 2])))).toHaveLength(0);
    expect(
      Object.keys(parseEcowittSoilChannelMap(JSON.stringify({ soilmoisture1: { label: "x" } }))),
    ).toHaveLength(0);
  });
});

describe("redaction + token masking", () => {
  it("redactForLog scrubs nested sensitive keys + private IPs", () => {
    const out = redactForLog({
      token: "vbt_secret",
      url: "http://192.168.1.42:1883",
      nested: { Authorization: "Bearer vbt_xxx", ok: "fine" },
    }) as Record<string, unknown>;
    expect(out.token).toBe("[redacted]");
    expect(out.url).toContain("[redacted-ip]");
    expect((out.nested as Record<string, unknown>).Authorization).toBe("[redacted]");
    expect((out.nested as Record<string, unknown>).ok).toBe("fine");
  });

  it("maskBridgeToken never reveals the full token", () => {
    expect(maskBridgeToken("vbt_supersecrettoken_123")).not.toContain("supersecrettoken");
    expect(maskBridgeToken(null)).toBe("[missing]");
  });

  it("redactRawPayloadForOutbound preserves non-sensitive numeric metrics", () => {
    const out = redactRawPayloadForOutbound({
      tempf: 78,
      humidity: 55,
      PASSKEY: "x",
    });
    expect(out.tempf).toBe(78);
    expect(out.humidity).toBe(55);
    expect(out.PASSKEY).toBe("[redacted]");
  });
});

describe("fullJitterBackoffMs", () => {
  it("is bounded and grows with attempt up to cap", () => {
    const v0 = fullJitterBackoffMs(0, { random: () => 1, baseMs: 100, capMs: 10_000 });
    const v3 = fullJitterBackoffMs(3, { random: () => 1, baseMs: 100, capMs: 10_000 });
    const v99 = fullJitterBackoffMs(99, { random: () => 1, baseMs: 100, capMs: 10_000 });
    expect(v0).toBeLessThanOrEqual(100);
    expect(v3).toBeLessThanOrEqual(800);
    expect(v99).toBeLessThanOrEqual(10_000);
  });
  it("returns 0 when random() returns 0", () => {
    expect(fullJitterBackoffMs(5, { random: () => 0 })).toBe(0);
  });
});

describe("classifyEcowittChannelMapJsonInput", () => {
  it("is 'absent' when unset, undefined, empty, or whitespace-only", () => {
    expect(classifyEcowittChannelMapJsonInput(undefined)).toBe("absent");
    expect(classifyEcowittChannelMapJsonInput("")).toBe("absent");
    expect(classifyEcowittChannelMapJsonInput("   ")).toBe("absent");
  });
  it("is 'malformed' for invalid JSON syntax", () => {
    expect(classifyEcowittChannelMapJsonInput("{not-json")).toBe("malformed");
  });
  it("is 'malformed' for valid JSON that isn't an object (array, string, number)", () => {
    expect(classifyEcowittChannelMapJsonInput("[1,2,3]")).toBe("malformed");
    expect(classifyEcowittChannelMapJsonInput('"just a string"')).toBe("malformed");
    expect(classifyEcowittChannelMapJsonInput("42")).toBe("malformed");
    expect(classifyEcowittChannelMapJsonInput("null")).toBe("malformed");
  });
  it("is 'parsed' for a valid JSON object, including an empty one", () => {
    expect(
      classifyEcowittChannelMapJsonInput(JSON.stringify({ soilmoisture1: { tent_id: TENT } })),
    ).toBe("parsed");
    expect(classifyEcowittChannelMapJsonInput("{}")).toBe("parsed");
  });
});

describe("readBridgeEnv — --json-errors / --format json detection", () => {
  const REQUIRED = {
    VERDANT_INGEST_URL: "https://example.test/ingest",
    VERDANT_BRIDGE_TOKEN: "vbt_test_token_xxxxxxxxxx",
    VERDANT_TENT_ID: TENT,
  } as NodeJS.ProcessEnv;

  it("jsonErrors is false by default", () => {
    expect(readBridgeEnv(REQUIRED, []).jsonErrors).toBe(false);
  });
  it("--json-errors flag sets jsonErrors", () => {
    expect(readBridgeEnv(REQUIRED, ["--validate-config", "--json-errors"]).jsonErrors).toBe(true);
  });
  it("--format json sets jsonErrors", () => {
    expect(readBridgeEnv(REQUIRED, ["--validate-config", "--format", "json"]).jsonErrors).toBe(
      true,
    );
  });
  it("--format text (or any other value) does not set jsonErrors", () => {
    expect(readBridgeEnv(REQUIRED, ["--validate-config", "--format", "text"]).jsonErrors).toBe(
      false,
    );
  });
  it("ECOWITT_BRIDGE_JSON_ERRORS=1 env var sets jsonErrors", () => {
    expect(
      readBridgeEnv({ ...REQUIRED, ECOWITT_BRIDGE_JSON_ERRORS: "1" } as NodeJS.ProcessEnv, [])
        .jsonErrors,
    ).toBe(true);
  });
  it("computes channelMapJsonState from the raw env var independent of parse fallback", () => {
    expect(readBridgeEnv(REQUIRED, []).channelMapJsonState).toBe("absent");
    expect(
      readBridgeEnv(
        { ...REQUIRED, ECOWITT_SOIL_CHANNEL_MAP_JSON: "{not-json" } as NodeJS.ProcessEnv,
        [],
      ).channelMapJsonState,
    ).toBe("malformed");
    expect(
      readBridgeEnv(
        {
          ...REQUIRED,
          ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify({ soilmoisture1: { tent_id: TENT } }),
        } as NodeJS.ProcessEnv,
        [],
      ).channelMapJsonState,
    ).toBe("parsed");
  });
});

describe("handleMqttMessage (bridge orchestration)", () => {
  const baseEnv = readBridgeEnv(
    {
      VERDANT_INGEST_URL: "https://example.test/ingest",
      VERDANT_BRIDGE_TOKEN: "vbt_test_token_xxxxxxxxxx",
      VERDANT_TENT_ID: TENT,
    } as NodeJS.ProcessEnv,
    [],
  );

  it("dry-run does not call forward()", async () => {
    const forward = vi.fn();
    const log = vi.fn();
    const res = await handleMqttMessage(JSON.stringify(basePayload()), {
      env: { ...baseEnv, dryRun: true },
      forward,
      log,
      now: NOW,
    });
    expect(forward).not.toHaveBeenCalled();
    expect(res.accepted).toBeGreaterThan(0);
  });

  it("enabled mode posts to forward() once per accepted payload", async () => {
    const forward = vi.fn(async () => ({ ok: true, status: 200 }));
    const log = vi.fn();
    const res = await handleMqttMessage(JSON.stringify(basePayload()), {
      env: baseEnv,
      forward,
      log,
      now: NOW,
    });
    expect(forward).toHaveBeenCalledTimes(res.accepted);
    expect(res.accepted).toBeGreaterThan(0);
  });

  it("malformed JSON does not crash and is logged", async () => {
    const forward = vi.fn();
    const log = vi.fn();
    const res = await handleMqttMessage("{not-json", { env: baseEnv, forward, log, now: NOW });
    expect(forward).not.toHaveBeenCalled();
    expect(res.rejected).toBe(1);
  });

  it("invalid telemetry is never forwarded as healthy", async () => {
    const forward = vi.fn();
    const log = vi.fn();
    const bad = JSON.stringify({
      dateutc: "2026-06-19 12:00:00",
      tempf: 9999,
      humidity: 999,
      soilmoisture1: -50,
    });
    const res = await handleMqttMessage(bad, {
      env: { ...baseEnv, channelMap: { soilmoisture1: { tent_id: TENT } } },
      forward,
      log,
      now: NOW,
    });
    expect(forward).not.toHaveBeenCalled();
    expect(res.accepted).toBe(0);
  });

  it("no log call ever contains the raw bridge token", async () => {
    const forward = vi.fn(async () => ({ ok: true, status: 200 }));
    const log = vi.fn();
    await handleMqttMessage(JSON.stringify(basePayload()), {
      env: baseEnv,
      forward,
      log,
      now: NOW,
    });
    for (const call of log.mock.calls) {
      const dump = JSON.stringify(call);
      expect(dump).not.toContain("vbt_test_token_xxxxxxxxxx");
    }
  });
});

describe("forwardWithBackoff", () => {
  it("sends Authorization bearer header and returns ok on 2xx", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;
    const r = await forwardWithBackoff(
      {
        tent_id: TENT,
        source: "ecowitt",
        captured_at: NOW.toISOString(),
        vendor: "ecowitt",
        metrics: { temp_f: 78 },
        metadata: { transport: "mqtt" },
        raw_payload: {},
      },
      {
        url: "https://example.test/ingest",
        bridgeToken: "vbt_x",
        fetchImpl,
        sleepImpl: async () => {},
      },
    );
    expect(r.ok).toBe(true);
    const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer vbt_x");
  });

  it("retries on 5xx then succeeds (bounded attempts)", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      if (calls < 3) return new Response("err", { status: 503 });
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const r = await forwardWithBackoff(
      {
        tent_id: TENT,
        source: "ecowitt",
        captured_at: NOW.toISOString(),
        vendor: "ecowitt",
        metrics: {},
        metadata: { transport: "mqtt" },
        raw_payload: {},
      },
      {
        url: "https://example.test/ingest",
        bridgeToken: "vbt_x",
        fetchImpl,
        sleepImpl: async () => {},
        maxAttempts: 4,
        random: () => 0,
      },
    );
    expect(r.ok).toBe(true);
    expect(calls).toBe(3);
  });

  it("does not retry on 4xx (bad payload)", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async () => {
      calls++;
      return new Response("bad", { status: 400 });
    }) as unknown as typeof fetch;
    const r = await forwardWithBackoff(
      {
        tent_id: TENT,
        source: "ecowitt",
        captured_at: NOW.toISOString(),
        vendor: "ecowitt",
        metrics: {},
        metadata: { transport: "mqtt" },
        raw_payload: {},
      },
      {
        url: "https://example.test/ingest",
        bridgeToken: "vbt_x",
        fetchImpl,
        sleepImpl: async () => {},
      },
    );
    expect(r.ok).toBe(false);
    expect(calls).toBe(1);
  });
});

describe("static safety", () => {
  it("bridge script and rules contain no device-control / Supabase / service_role strings", async () => {
    const fs = await import("node:fs/promises");
    const files = ["src/lib/ecowittLiveSoilIngestRules.ts", "scripts/ecowitt-live-soil-bridge.ts"];
    for (const f of files) {
      const src = await fs.readFile(f, "utf8");
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
      expect(src).not.toMatch(/createClient\(/); // no Supabase client
      expect(src).not.toMatch(
        /execute_device|setpoint_write|irrigation_control|light_control|fan_control/,
      );
      expect(src).not.toMatch(/action_queue/);
      // No hardcoded bridge token
      expect(src).not.toMatch(/vbt_[A-Za-z0-9]{8,}/);
    }
  });
});

describe("validateChannelMapSingleTent", () => {
  it("reports 'empty' with no channels configured", () => {
    const r = validateChannelMapSingleTent({}, TENT);
    expect(r.status).toBe("empty");
    expect(r.channelCount).toBe(0);
    expect(r.offendingChannels).toHaveLength(0);
  });

  it("reports 'accepted' when every channel matches VERDANT_TENT_ID", () => {
    const map = parseEcowittSoilChannelMap(
      JSON.stringify({
        soilmoisture1: { tent_id: TENT },
        soilmoisture2: { tent_id: TENT },
      }),
    );
    const r = validateChannelMapSingleTent(map, TENT);
    expect(r.status).toBe("accepted");
    expect(r.channelCount).toBe(2);
    expect(r.distinctTentCount).toBe(1);
    expect(r.offendingChannels).toHaveLength(0);
  });

  it("reports 'mixed-tent' when one channel names a different tent than VERDANT_TENT_ID", () => {
    const map = parseEcowittSoilChannelMap(
      JSON.stringify({
        soilmoisture1: { tent_id: TENT },
        soilmoisture2: { tent_id: TENT_B },
      }),
    );
    const r = validateChannelMapSingleTent(map, TENT);
    expect(r.status).toBe("mixed-tent");
    expect(r.distinctTentCount).toBe(2);
    expect(r.offendingChannels).toEqual(["soilmoisture2"]);
  });

  it("without VERDANT_TENT_ID: 'accepted' when channels agree with each other", () => {
    const map = parseEcowittSoilChannelMap(
      JSON.stringify({
        soilmoisture1: { tent_id: TENT },
        soilmoisture2: { tent_id: TENT },
      }),
    );
    const r = validateChannelMapSingleTent(map, null);
    expect(r.status).toBe("accepted");
  });

  it("without VERDANT_TENT_ID: 'mixed-tent' when channels disagree with each other", () => {
    const map = parseEcowittSoilChannelMap(
      JSON.stringify({
        soilmoisture1: { tent_id: TENT },
        soilmoisture2: { tent_id: TENT_B },
      }),
    );
    const r = validateChannelMapSingleTent(map, null);
    expect(r.status).toBe("mixed-tent");
    expect(r.offendingChannels).toEqual(["soilmoisture2"]);
  });

  it("never returns a tent_id string anywhere in the result", () => {
    const map = parseEcowittSoilChannelMap(
      JSON.stringify({
        soilmoisture1: { tent_id: TENT },
        soilmoisture2: { tent_id: TENT_B },
      }),
    );
    const r = validateChannelMapSingleTent(map, TENT);
    const dump = JSON.stringify(r);
    expect(dump).not.toContain(TENT);
    expect(dump).not.toContain(TENT_B);
  });
});

describe("buildConfigValidationSummary", () => {
  const withEnv = (overrides: Partial<BridgeEnv>): BridgeEnv => ({
    ingestUrl: "https://example.test/ingest",
    bridgeToken: "vbt_test_token_xxxxxxxxxx",
    defaultTentId: TENT,
    defaultPlantId: null,
    channelMap: {},
    dryRun: false,
    validateConfig: true,
    jsonErrors: false,
    channelMapJsonState: "absent" as const,
    ...overrides,
  });

  it("exits 0 for an accepted config", () => {
    const env = withEnv({
      channelMap: parseEcowittSoilChannelMap(JSON.stringify({ soilmoisture1: { tent_id: TENT } })),
    });
    const r = buildConfigValidationSummary(env);
    expect(r.status).toBe("accepted");
    expect(r.exitCode).toBe(0);
  });

  it("exits 0 for an empty config", () => {
    const r = buildConfigValidationSummary(withEnv({ channelMap: {} }));
    expect(r.status).toBe("empty");
    expect(r.exitCode).toBe(0);
  });

  it("exits 3 (non-zero, with the documented code) for a mixed-tent config", () => {
    const env = withEnv({
      channelMap: parseEcowittSoilChannelMap(
        JSON.stringify({
          soilmoisture1: { tent_id: TENT },
          soilmoisture2: { tent_id: TENT_B },
        }),
      ),
    });
    const r = buildConfigValidationSummary(env);
    expect(r.status).toBe("mixed-tent");
    expect(r.exitCode).toBe(3);
    expect(r.exitCode).not.toBe(0);
  });

  it("the printed summary never contains a tent UUID or raw channel-map JSON", () => {
    const rawChannelMapJson = JSON.stringify({
      soilmoisture1: { tent_id: TENT },
      soilmoisture2: { tent_id: TENT_B },
    });
    const env = withEnv({ channelMap: parseEcowittSoilChannelMap(rawChannelMapJson) });
    const r = buildConfigValidationSummary(env);
    const dump = JSON.stringify(r.summary);
    expect(dump).not.toContain(TENT);
    expect(dump).not.toContain(TENT_B);
    expect(dump).not.toContain(rawChannelMapJson);
    // Only counts and channel keys are expected to appear.
    expect(r.summary).toMatchObject({
      mode: "validate-config",
      status: "mixed-tent",
      channelCount: 2,
      distinctTentCount: 2,
      offendingChannelCount: 1,
    });
  });
});

describe("runBridge — validate-config never touches mqtt/forward", () => {
  const baseEnv: BridgeEnv = {
    ingestUrl: "https://example.test/ingest",
    bridgeToken: "vbt_test_token_xxxxxxxxxx",
    defaultTentId: TENT,
    defaultPlantId: null,
    channelMap: {},
    dryRun: false,
    validateConfig: false,
    jsonErrors: false,
    channelMapJsonState: "absent",
  };

  it("mixed-tent config: never calls connectAndListen, exits with code 3", async () => {
    const connectAndListen = vi.fn();
    const exit = vi.fn();
    const log = vi.fn();
    const writeJson = vi.fn();
    const env: BridgeEnv = {
      ...baseEnv,
      validateConfig: true,
      channelMap: parseEcowittSoilChannelMap(
        JSON.stringify({
          soilmoisture1: { tent_id: TENT },
          soilmoisture2: { tent_id: TENT_B },
        }),
      ),
    };

    await runBridge(env, { log, connectAndListen, exit, writeJson });

    expect(connectAndListen).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(3);
  });

  it("accepted config: never calls connectAndListen, exits with code 0", async () => {
    const connectAndListen = vi.fn();
    const exit = vi.fn();
    const log = vi.fn();
    const writeJson = vi.fn();
    const env: BridgeEnv = {
      ...baseEnv,
      validateConfig: true,
      channelMap: parseEcowittSoilChannelMap(JSON.stringify({ soilmoisture1: { tent_id: TENT } })),
    };

    await runBridge(env, { log, connectAndListen, exit, writeJson });

    expect(connectAndListen).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("empty config: never calls connectAndListen, exits with code 0", async () => {
    const connectAndListen = vi.fn();
    const exit = vi.fn();
    const log = vi.fn();
    const writeJson = vi.fn();
    const env: BridgeEnv = { ...baseEnv, validateConfig: true, channelMap: {} };

    await runBridge(env, { log, connectAndListen, exit, writeJson });

    expect(connectAndListen).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("malformed channel-map JSON: never calls connectAndListen, exits with code 4", async () => {
    const connectAndListen = vi.fn();
    const exit = vi.fn();
    const log = vi.fn();
    const writeJson = vi.fn();
    const env: BridgeEnv = {
      ...baseEnv,
      validateConfig: true,
      channelMapJsonState: "malformed",
    };

    await runBridge(env, { log, connectAndListen, exit, writeJson });

    expect(connectAndListen).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(4);
  });

  it("no log call in validate-config mode contains a tent UUID", async () => {
    const connectAndListen = vi.fn();
    const exit = vi.fn();
    const log = vi.fn();
    const writeJson = vi.fn();
    const env: BridgeEnv = {
      ...baseEnv,
      validateConfig: true,
      channelMap: parseEcowittSoilChannelMap(
        JSON.stringify({
          soilmoisture1: { tent_id: TENT },
          soilmoisture2: { tent_id: TENT_B },
        }),
      ),
    };

    await runBridge(env, { log, connectAndListen, exit, writeJson });

    for (const call of log.mock.calls) {
      const dump = JSON.stringify(call);
      expect(dump).not.toContain(TENT);
      expect(dump).not.toContain(TENT_B);
    }
  });

  it("--json-errors: writes only the JSON envelope, never calls log", async () => {
    const connectAndListen = vi.fn();
    const exit = vi.fn();
    const log = vi.fn();
    const writeJson = vi.fn();
    const env: BridgeEnv = {
      ...baseEnv,
      validateConfig: true,
      jsonErrors: true,
      channelMap: parseEcowittSoilChannelMap(JSON.stringify({ soilmoisture1: { tent_id: TENT } })),
    };

    await runBridge(env, { log, connectAndListen, exit, writeJson });

    expect(connectAndListen).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
    expect(writeJson).toHaveBeenCalledTimes(1);
    expect(writeJson).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "validate-config", status: "accepted" }),
    );
    expect(exit).toHaveBeenCalledWith(0);
  });

  it("without --json-errors, validate-config never calls writeJson", async () => {
    const connectAndListen = vi.fn();
    const exit = vi.fn();
    const log = vi.fn();
    const writeJson = vi.fn();
    const env: BridgeEnv = { ...baseEnv, validateConfig: true };

    await runBridge(env, { log, connectAndListen, exit, writeJson });

    expect(writeJson).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("normal (listen) mode still calls connectAndListen exactly once and never exits", async () => {
    const connectAndListen = vi.fn(async () => {});
    const exit = vi.fn();
    const log = vi.fn();
    const writeJson = vi.fn();

    await runBridge(baseEnv, { log, connectAndListen, exit, writeJson });

    expect(connectAndListen).toHaveBeenCalledTimes(1);
    expect(exit).not.toHaveBeenCalled();
  });

  it("missing VERDANT_INGEST_URL: exits 2 and never calls connectAndListen (regression guard)", async () => {
    const connectAndListen = vi.fn();
    const exit = vi.fn();
    const log = vi.fn();
    const writeJson = vi.fn();
    const env: BridgeEnv = { ...baseEnv, ingestUrl: null };

    await runBridge(env, { log, connectAndListen, exit, writeJson });

    expect(connectAndListen).not.toHaveBeenCalled();
    expect(exit).toHaveBeenCalledWith(2);
  });
});

describe("buildConfigValidationSummary — determinism and malformed config", () => {
  const withEnv = (overrides: Partial<BridgeEnv>): BridgeEnv => ({
    ingestUrl: "https://example.test/ingest",
    bridgeToken: "vbt_test_token_xxxxxxxxxx",
    defaultTentId: TENT,
    defaultPlantId: null,
    channelMap: {},
    dryRun: false,
    validateConfig: true,
    jsonErrors: false,
    channelMapJsonState: "absent",
    ...overrides,
  });

  it("malformed ECOWITT_SOIL_CHANNEL_MAP_JSON: status malformed_config, exit 4", () => {
    const env = withEnv({ channelMapJsonState: "malformed" });
    const r = buildConfigValidationSummary(env);
    expect(r.status).toBe("malformed_config");
    expect(r.exitCode).toBe(4);
  });

  it("malformed config message never contains a tent UUID or raw JSON", () => {
    const env = withEnv({ channelMapJsonState: "malformed", defaultTentId: TENT });
    const r = buildConfigValidationSummary(env);
    const dump = JSON.stringify(r.summary);
    expect(dump).not.toContain(TENT);
    expect(typeof r.summary.message).toBe("string");
    expect((r.summary.message as string).length).toBeGreaterThan(0);
  });

  it("mixed-tent message is deterministic and identical regardless of channel-map key insertion order", () => {
    const mapA = parseEcowittSoilChannelMap(
      JSON.stringify({
        soilmoisture1: { tent_id: TENT },
        soilmoisture2: { tent_id: TENT_B },
        soilmoisture3: { tent_id: TENT_B },
      }),
    );
    const mapB = parseEcowittSoilChannelMap(
      JSON.stringify({
        soilmoisture3: { tent_id: TENT_B },
        soilmoisture1: { tent_id: TENT },
        soilmoisture2: { tent_id: TENT_B },
      }),
    );
    const messageA = buildConfigValidationSummary(withEnv({ channelMap: mapA })).summary.message;
    const messageB = buildConfigValidationSummary(withEnv({ channelMap: mapB })).summary.message;
    expect(messageA).toBe(messageB);
  });

  it("mixed-tent message never contains a tent UUID or bridge token", () => {
    const env = withEnv({
      bridgeToken: "vbt_super_secret_token_zzzz",
      channelMap: parseEcowittSoilChannelMap(
        JSON.stringify({
          soilmoisture1: { tent_id: TENT },
          soilmoisture2: { tent_id: TENT_B },
        }),
      ),
    });
    const r = buildConfigValidationSummary(env);
    const message = r.summary.message as string;
    expect(message).not.toContain(TENT);
    expect(message).not.toContain(TENT_B);
    expect(message).not.toContain("vbt_super_secret_token_zzzz");
  });
});
