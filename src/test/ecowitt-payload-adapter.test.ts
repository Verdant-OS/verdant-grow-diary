/**
 * EcoWitt Payload Adapter v1 — pure adapter + handoff tests.
 *
 * Covers:
 *  - basic field mapping (temp/humidity/soil/co2)
 *  - string-valued payloads
 *  - missing/invalid timestamp behavior
 *  - configured channel mapping
 *  - gateway-indoor never silently used as canopy
 *  - unknown / device-state / credential fields never leak into readings
 *  - submitted source never trusted as "live"
 *  - client-supplied user_id never trusted
 *  - co2 only mapped when numeric AND plausible
 *  - determinism + purity
 *  - delegation to sensorBridgeIntakeRules for range / freshness / suspicion
 *  - static safety (no schema/edge writes, no device-control, no privileged
 *    surface leakage)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  adaptEcoWittPayloadToBridgeInput,
  type EcoWittAdapterResult,
} from "@/lib/ecowittPayloadAdapter";
import { evaluateBridgeIntake } from "@/lib/sensorBridgeIntakeRules";

const NOW = new Date("2026-05-23T12:00:00Z");
const minutesAgo = (m: number) =>
  new Date(NOW.getTime() - m * 60_000).toISOString();
const minutesAgoEcoWitt = (m: number) => {
  const d = new Date(NOW.getTime() - m * 60_000);
  // EcoWitt: "YYYY-MM-DD HH:MM:SS" UTC
  return d.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
};

const TENT = "11111111-2222-3333-4444-555555555555";

function adapt(
  payload: unknown,
  opts: Parameters<typeof adaptEcoWittPayloadToBridgeInput>[1] = {},
): EcoWittAdapterResult {
  return adaptEcoWittPayloadToBridgeInput(payload, { tentId: TENT, ...opts });
}

describe("adaptEcoWittPayloadToBridgeInput — basic mapping", () => {
  it("maps temp1f, humidity1, soilmoisture1, and co2 into bridge readings", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(2),
      temp1f: 75.2,
      humidity1: 55,
      soilmoisture1: 32,
      co2: 800,
    });
    expect(r.ok).toBe(true);
    const metrics = r.input.readings as Array<{ metric: string; value: number }>;
    const byMetric = Object.fromEntries(metrics.map((m) => [m.metric, m.value]));
    expect(byMetric["temperature_c"]).toBeCloseTo(24, 1);
    expect(byMetric["humidity_pct"]).toBe(55);
    expect(byMetric["soil_moisture_pct"]).toBe(32);
    expect(byMetric["co2_ppm"]).toBe(800);
    expect(r.metadata.vendor).toBe("ecowitt");
    expect(r.metadata.device_family).toBe("ecowitt_custom_upload");
  });

  it("handles string numeric values safely", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      temp1f: "70.0",
      humidity1: "44",
      co2: "612",
    });
    expect(r.ok).toBe(true);
    expect(
      (r.input.readings as Array<{ metric: string }>).map((m) => m.metric).sort(),
    ).toEqual(["co2_ppm", "humidity_pct", "temperature_c"]);
  });

  it("warns when timestamp missing and never invents freshness", () => {
    const r = adapt({ temp1f: 70, humidity1: 50 });
    expect(r.warnings).toContain("captured_at_missing");
    expect(r.input.captured_at).toBeNull();
    expect(r.metadata.server_received_at_used).toBe(false);
  });

  it("uses serverReceivedAt only when explicitly allowed and labels it", () => {
    const r = adapt(
      { temp1f: 70 },
      {
        allowServerReceivedAtFallback: true,
        serverReceivedAt: minutesAgo(1),
      },
    );
    expect(r.metadata.server_received_at_used).toBe(true);
    expect(r.warnings).toContain("server_received_at_used_as_fallback");
    expect(r.input.captured_at).toBeTruthy();
  });
});

describe("EcoWitt adapter — channel selection", () => {
  it("uses configured channel when multiple temp channels exist", () => {
    const r = adapt(
      {
        dateutc: minutesAgoEcoWitt(1),
        temp1f: 70,
        temp2f: 82,
      },
      { channelMapping: { air_temp: "2" } },
    );
    const temp = (r.input.readings as Array<{ metric: string; value: number }>).find(
      (x) => x.metric === "temperature_c",
    );
    expect(temp?.value).toBeCloseTo(27.78, 1);
    expect(r.warnings).not.toContain("multiple_temperature_channels_no_mapping");
  });

  it("warns when multiple temp/humidity/soil channels exist without mapping", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      temp1f: 70,
      temp2f: 80,
      humidity1: 40,
      humidity2: 60,
      soilmoisture1: 20,
      soilmoisture2: 30,
    });
    expect(r.warnings).toContain("multiple_temperature_channels_no_mapping");
    expect(r.warnings).toContain("multiple_humidity_channels_no_mapping");
    expect(r.warnings).toContain("multiple_soil_moisture_channels_no_mapping");
    // No reading is emitted for an ambiguous channel.
    expect(r.input.readings).toEqual([]);
  });

  it("warns when a configured channel does not exist in the payload", () => {
    const r = adapt(
      { dateutc: minutesAgoEcoWitt(1), temp1f: 70 },
      { channelMapping: { air_temp: "5" } },
    );
    expect(r.warnings).toContain("configured_channel_missing");
  });

  it("does NOT silently treat tempinf/humidityin as canopy readings", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      tempinf: 72,
      humidityin: 48,
    });
    expect(r.warnings).toContain("gateway_indoor_used_without_explicit_selection");
    expect(r.input.readings).toEqual([]);
  });

  it("maps tempinf/humidityin only when explicitly allowed, still warns", () => {
    const r = adapt(
      { dateutc: minutesAgoEcoWitt(1), tempinf: 72, humidityin: 48 },
      { allowGatewayIndoor: true },
    );
    const metrics = (r.input.readings as Array<{ metric: string }>).map((m) => m.metric).sort();
    expect(metrics).toEqual(["humidity_pct", "temperature_c"]);
    expect(r.warnings).toContain("gateway_indoor_used_without_explicit_selection");
  });
});

describe("EcoWitt adapter — safety boundaries", () => {
  it("does not map unknown fields into readings", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      temp1f: 70,
      windspeedmph: 3.4,
      uv: 5,
      hourlyrainin: 0,
    });
    const metrics = (r.input.readings as Array<{ metric: string }>).map((m) => m.metric);
    expect(metrics).toEqual(["temperature_c"]);
  });

  it("does not map device/fan/switch/relay/battery fields into readings", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      wh65batt: 1,
      soilbatt1: 1,
      signal: -67,
      fanstate: "on",
      relay1: "off",
      switch: 1,
    });
    expect(r.input.readings).toEqual([]);
    expect(r.metadata.ignored_device_state_fields).toBeGreaterThan(0);
    expect(r.warnings).toContain("device_state_field_ignored");
  });

  it("never trusts a submitted source label as live", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      temp1f: 70,
      // Caller-controlled noise: try to force "live"
      source: "live",
      submitted_source: "live",
      live: "true",
    });
    expect(r.input.submitted_source).toBe("unknown");
    expect(r.input.authenticated).toBe(false);
  });

  it("never trusts client-supplied user_id and only uses server-resolved tent/plant", () => {
    const r = adapt(
      {
        dateutc: minutesAgoEcoWitt(1),
        temp1f: 70,
        user_id: "00000000-0000-0000-0000-000000000000",
        tent_id: "11111111-1111-1111-1111-111111111111",
        plant_id: "22222222-2222-2222-2222-222222222222",
      },
      { tentId: TENT, plantId: null },
    );
    expect(r.input.tent_id).toBe(TENT);
    expect(r.input.plant_id).toBeNull();
    // ensure no user_id key leaked onto the intake payload
    expect((r.input as Record<string, unknown>)["user_id"]).toBeUndefined();
  });

  it("suppresses passkeys/tokens/secrets from any returned output", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      temp1f: 70,
      PASSKEY: "AAAA1111BBBB2222CCCC3333",
      passkey: "another-secret",
      apikey: "do-not-leak",
      mac: "DE:AD:BE:EF:00:01",
    });
    const json = JSON.stringify(r);
    expect(json).not.toMatch(/AAAA1111BBBB2222CCCC3333/);
    expect(json).not.toMatch(/another-secret/);
    expect(json).not.toMatch(/do-not-leak/);
    expect(json).not.toMatch(/DE:AD:BE:EF/);
    expect(r.metadata.suppressed_credential_fields).toBeGreaterThanOrEqual(3);
    expect(r.warnings).toContain("vendor_credential_field_suppressed");
  });

  it("maps CO2 only when numeric AND plausible", () => {
    const lo = adapt({ dateutc: minutesAgoEcoWitt(1), co2: 50 });
    const hi = adapt({ dateutc: minutesAgoEcoWitt(1), co2: 50000 });
    const bad = adapt({ dateutc: minutesAgoEcoWitt(1), co2: "n/a" });
    const ok = adapt({ dateutc: minutesAgoEcoWitt(1), co2: 800 });
    expect((lo.input.readings as unknown[]).length).toBe(0);
    expect((hi.input.readings as unknown[]).length).toBe(0);
    expect((bad.input.readings as unknown[]).length).toBe(0);
    expect((ok.input.readings as unknown[]).length).toBe(1);
    expect(lo.warnings).toContain("co2_value_implausible");
    expect(hi.warnings).toContain("co2_value_implausible");
  });

  it("is deterministic for the same input", () => {
    const p = {
      dateutc: minutesAgoEcoWitt(1),
      temp1f: 70,
      humidity1: 50,
    };
    const a = adapt(p);
    const b = adapt(p);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("rejects non-object payloads with a safe reason code", () => {
    const r = adapt("not an object" as unknown);
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("payload_not_object");
    expect(r.input.readings).toEqual([]);
  });
});

describe("EcoWitt adapter — handoff to sensorBridgeIntakeRules", () => {
  it("intake catches humidity out of range", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      temp1f: 70,
      humidity1: 150, // impossible
    });
    const result = evaluateBridgeIntake(r.input, { now: NOW });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("humidity_out_of_range");
  });

  it("intake catches stale timestamp for live and downgrades source", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(180),
      temp1f: 70,
      humidity1: 50,
    });
    const result = evaluateBridgeIntake(r.input, { now: NOW });
    expect(result.resolved_source).not.toBe("live");
  });

  it("intake flags humidity stuck-at-extreme suspicion", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      humidity1: 100,
    });
    const result = evaluateBridgeIntake(r.input, { now: NOW });
    expect(result.suspicions).toContain("humidity_stuck_extreme");
  });

  it("intake flags soil moisture stuck at 0 or 100", () => {
    const r = adapt({
      dateutc: minutesAgoEcoWitt(1),
      soilmoisture1: 0,
    });
    const result = evaluateBridgeIntake(r.input, { now: NOW });
    expect(result.suspicions).toContain("soil_moisture_stuck_extreme");
  });

  it("intake never classifies unknown/empty readings as healthy", () => {
    const r = adapt({ dateutc: minutesAgoEcoWitt(1) });
    expect(r.ok).toBe(false);
    const result = evaluateBridgeIntake(r.input, { now: NOW });
    expect(result.ok).toBe(false);
    expect(result.resolved_source).not.toBe("live");
  });

  it("intake catches missing timestamp", () => {
    const r = adapt({ temp1f: 70, humidity1: 50 });
    const result = evaluateBridgeIntake(r.input, { now: NOW });
    expect(result.reasons).toContain("captured_at_missing");
    expect(result.ok).toBe(false);
  });
});

describe("EcoWitt adapter — static safety", () => {
  const ROOT = resolve(__dirname, "../..");
  const SRC = readFileSync(
    resolve(ROOT, "src/lib/ecowittPayloadAdapter.ts"),
    "utf8",
  );

  it("contains no DB writes, no edge calls, no Supabase client usage", () => {
    expect(SRC).not.toMatch(/from\s*\(\s*["']/);
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\.insert\s*\(/);
    expect(SRC).not.toMatch(/\.update\s*\(/);
    expect(SRC).not.toMatch(/\.delete\s*\(/);
    expect(SRC).not.toMatch(/\.upsert\s*\(/);
    expect(SRC).not.toMatch(/\.rpc\s*\(/);
    expect(SRC).not.toMatch(/fetch\s*\(/);
    expect(SRC).not.toMatch(/XMLHttpRequest/);
    expect(SRC).not.toMatch(/localStorage|sessionStorage/);
    expect(SRC).not.toMatch(/Date\.now\s*\(/);
  });

  it("never writes to alerts / action_queue / ai_doctor_sessions", () => {
    expect(SRC).not.toMatch(/alerts/);
    expect(SRC).not.toMatch(/action_queue/);
    expect(SRC).not.toMatch(/ai_doctor_sessions/);
  });

  it("contains no device-control vocabulary", () => {
    const banned = [
      /turn[_\s-]?on/i,
      /turn[_\s-]?off/i,
      /actuate/i,
      /pump_command/i,
      /valve_command/i,
      /fan_command/i,
      /light_command/i,
      /set_power/i,
    ];
    for (const re of banned) expect(SRC).not.toMatch(re);
  });

  it("never logs raw payloads or embeds privileged values", () => {
    expect(SRC).not.toMatch(/console\.(log|info|warn|error)/);
    expect(SRC).not.toMatch(/service_role/i);
    expect(SRC).not.toMatch(/SUPABASE_SERVICE_ROLE/i);
    expect(SRC).not.toMatch(/sk_live_/);
    expect(SRC).not.toMatch(/bridge_tokens/);
  });
});
