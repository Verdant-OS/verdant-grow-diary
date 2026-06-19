/**
 * Dry-run + docs + fixture tests for the EcoWitt local bridge rollout.
 * Pure: never touches network, never touches Supabase.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runEcowittDryRun } from "../../scripts/ecowitt-live-soil-dry-run";

const TENT = "11111111-1111-1111-1111-111111111111";
const TENT_B = "22222222-2222-2222-2222-222222222222";
const FIXTURE_PATH = resolve(__dirname, "../../fixtures/ecowitt-live-soil-sample.json");
const DOCS_PATH = resolve(__dirname, "../../docs/ecowitt-live-soil-bridge.md");

function loadFixture(): Record<string, unknown> {
  const raw = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) if (!k.startsWith("_")) out[k] = v;
  return out;
}

const fixtureNow = () => {
  const f = loadFixture();
  return new Date(`${(f.dateutc as string).replace(" ", "T")}Z`);
};

describe("ecowitt-live-soil dry-run fixture", () => {
  it("produces a normalized canonical payload from the sanitized fixture", () => {
    const out = runEcowittDryRun({
      payload: loadFixture(),
      defaultTentId: TENT,
      now: fixtureNow(),
    });
    expect(out.ok).toBe(true);
    expect(out.posted).toBe(false);
    expect(out.accepted).toBeGreaterThan(0);
    expect(out.payloads.length).toBeGreaterThan(0);
    const air = out.payloads.find((p) => p.metrics.temp_f !== undefined);
    expect(air).toBeDefined();
    expect(air!.source).toBe("ecowitt");
    expect(air!.vendor).toBe("ecowitt");
    expect(air!.metadata.transport).toBe("mqtt");
    expect(air!.tent_id).toBe(TENT);
  });

  it("derives vpd_kpa from valid temp + humidity", () => {
    const out = runEcowittDryRun({
      payload: loadFixture(),
      defaultTentId: TENT,
      now: fixtureNow(),
    });
    const air = out.payloads.find((p) => p.metrics.temp_f !== undefined)!;
    expect(typeof air.metrics.vpd_kpa).toBe("number");
    expect(air.metrics.vpd_kpa!).toBeGreaterThan(0);
  });

  it("does NOT fabricate vpd when humidity is missing", () => {
    const p = loadFixture();
    delete p.humidity;
    const out = runEcowittDryRun({ payload: p, defaultTentId: TENT, now: fixtureNow() });
    for (const pl of out.payloads) {
      expect(pl.metrics.vpd_kpa ?? null).toBeNull();
    }
  });

  it("does NOT fabricate vpd when RH is invalid (stuck at 0)", () => {
    const p = loadFixture();
    p.humidity = 0;
    const out = runEcowittDryRun({ payload: p, defaultTentId: TENT, now: fixtureNow() });
    for (const pl of out.payloads) {
      expect(pl.metrics.vpd_kpa ?? null).toBeNull();
    }
  });

  it("rejects soil moisture outside 0-100", () => {
    const p = { ...loadFixture(), soilmoisture1: 250 };
    const out = runEcowittDryRun({
      payload: p,
      defaultTentId: TENT,
      channelMap: { soilmoisture1: { tent_id: TENT_B } },
      now: fixtureNow(),
    });
    const soilB = out.payloads.find((pl) => pl.tent_id === TENT_B);
    expect(soilB?.metrics.soil_moisture_pct ?? null).toBeNull();
  });

  it("redacts sensitive keys in raw_payload preview and outbound", () => {
    const dirty = {
      ...loadFixture(),
      PASSKEY: "ABCDEF0123456789",
      MAC: "AA:BB:CC:DD:EE:FF",
      stationtype: "EasyWeatherPro_V5.1.6",
      token: "secret-token-xyz",
    };
    const out = runEcowittDryRun({ payload: dirty, defaultTentId: TENT, now: fixtureNow() });
    const preview = JSON.stringify(out.redactedRawPreview);
    expect(preview).not.toContain("ABCDEF0123456789");
    expect(preview).not.toContain("secret-token-xyz");
    expect(preview).toContain("[redacted]");
    for (const p of out.payloads) {
      const raw = JSON.stringify(p.raw_payload ?? {});
      expect(raw).not.toContain("ABCDEF0123456789");
      expect(raw).not.toContain("secret-token-xyz");
    }
  });

  it("dry-run never posts to the network (posted=false)", () => {
    const out = runEcowittDryRun({ payload: loadFixture(), defaultTentId: TENT, now: fixtureNow() });
    expect(out.posted).toBe(false);
  });
});

describe("ecowitt-live-soil docs rollout checklist", () => {
  const docs = readFileSync(DOCS_PATH, "utf8");

  it("documents the five-step rollout order", () => {
    expect(docs).toMatch(/Official Verdant EcoWitt rollout order/i);
    for (const step of [
      "Stand up the local EcoWitt custom upload",
      "Dry-run a normalized payload",
      "Send to the Verdant ingest webhook with the Verdant bridge token",
      "Confirm in Verdant",
      "EcoWitt cloud API",
    ]) {
      expect(docs).toContain(step);
    }
  });

  it("warns to rotate exposed EcoWitt API keys", () => {
    expect(docs).toMatch(/rotate it immediately/i);
    expect(docs).toMatch(/EcoWitt cloud API key/i);
  });

  it("documents that EcoWitt cloud API is deferred", () => {
    expect(docs).toMatch(/cloud API.*deferred|deferred/i);
  });

  it("warns against pasting secrets / tokens / MAC / IPs", () => {
    for (const word of ["bridge token", "PASSKEY", "MAC", "private LAN IPs"]) {
      expect(docs).toContain(word);
    }
  });

  it("documents no direct Supabase writes / no service role / no device control / no automation", () => {
    expect(docs).toMatch(/no direct Supabase writes/i);
    expect(docs).toMatch(/service-role/i);
    expect(docs).toMatch(/no device control/i);
    expect(docs).toMatch(/no automation/i);
  });

  it("lists required Verdant env vars", () => {
    for (const v of ["VERDANT_INGEST_URL", "VERDANT_BRIDGE_TOKEN", "VERDANT_TENT_ID"]) {
      expect(docs).toContain(v);
    }
  });
});

describe("ecowitt-live-soil fixture safety", () => {
  const raw = readFileSync(FIXTURE_PATH, "utf8");
  const json = JSON.parse(raw) as Record<string, unknown>;

  it("contains no forbidden secret keys", () => {
    for (const banned of ["PASSKEY", "passkey", "MAC", "mac", "stationid", "token", "password", "apikey", "api_key"]) {
      expect(json[banned]).toBeUndefined();
    }
  });

  it("contains no private IPs or MAC-shaped strings", () => {
    expect(raw).not.toMatch(/\b(10|192\.168|172\.(1[6-9]|2\d|3[01]))\.\d/);
    expect(raw).not.toMatch(/\b[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}\b/i);
  });
});

describe("ecowitt-live-soil dry-run script safety", () => {
  const script = readFileSync(
    resolve(__dirname, "../../scripts/ecowitt-live-soil-dry-run.ts"),
    "utf8",
  );

  it("does not import supabase / service-role secret", () => {
    expect(script).not.toMatch(/from\s+["']@supabase\/supabase-js["']/);
    expect(script).not.toMatch(/SERVICE_ROLE_KEY/);
  });

  it("does not perform device control or action queue writes", () => {
    expect(script).not.toMatch(/device[_-]?control/i);
    expect(script).not.toMatch(/action[_-]?queue/i);
    expect(script).not.toMatch(/\bfetch\s*\(/);
  });
});
