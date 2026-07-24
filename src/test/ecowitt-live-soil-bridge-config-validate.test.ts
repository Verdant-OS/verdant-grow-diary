import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { runConfigValidate } from "../../scripts/ecowitt-live-soil-bridge";

const TENT_A = "11111111-1111-4111-8111-111111111111";
const TENT_B = "22222222-2222-4222-8222-222222222222";
const PLANT_A = "33333333-3333-4333-8333-333333333333";

function bunAvailable(): boolean {
  const r = spawnSync("bun", ["--version"], { encoding: "utf8" });
  return r.status === 0;
}

describe("runConfigValidate (pure)", () => {
  it("ok when tent is a UUID and no channel map is set", () => {
    expect(runConfigValidate({ VERDANT_TENT_ID: TENT_A })).toEqual({ ok: true });
  });

  it("missing_tent_id when VERDANT_TENT_ID is absent", () => {
    const r = runConfigValidate({});
    expect(r.ok).toBe(false);
    expect(r.code).toBe("missing_tent_id");
  });

  it("invalid_tent_id when VERDANT_TENT_ID is not a UUID", () => {
    const r = runConfigValidate({ VERDANT_TENT_ID: "not-a-uuid" });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("invalid_tent_id");
  });

  it("invalid_channel_map_schema when JSON does not match schema", () => {
    const r = runConfigValidate({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: "not json",
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("invalid_channel_map_schema");
  });

  it("mixed_tent_channel_map when channels map to different tents", () => {
    const map = {
      soilmoisture1: { tent_id: TENT_A, plant_id: PLANT_A },
      soilmoisture2: { tent_id: TENT_B },
    };
    const r = runConfigValidate({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify(map),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("mixed_tent_channel_map");
  });

  it("channel_map_tent_mismatch when channel tent != VERDANT_TENT_ID", () => {
    const map = { soilmoisture1: { tent_id: TENT_B } };
    const r = runConfigValidate({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify(map),
    });
    expect(r.ok).toBe(false);
    expect(r.code).toBe("channel_map_tent_mismatch");
  });

  it("does not leak the tent id in the error message", () => {
    const r = runConfigValidate({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify({
        soilmoisture1: { tent_id: TENT_B },
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.message ?? "").not.toContain(TENT_A);
    expect(r.message ?? "").not.toContain(TENT_B);
  });
});

describe("`config validate` CLI subcommand", () => {
  if (!bunAvailable()) {
    it.skip("skipped — bun runtime not available", () => {});
    return;
  }

  const run = (env: Record<string, string | undefined>) =>
    spawnSync(
      "bun",
      ["run", "scripts/ecowitt-live-soil-bridge.ts", "config", "validate"],
      {
        encoding: "utf8",
        env: { ...process.env, ...env, ECOWITT_MQTT_URL: "mqtt://127.0.0.1:1" },
        timeout: 15_000,
      },
    );

  it("exits 0 with config_ok on a valid tent-only config", () => {
    const r = run({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: undefined,
    });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"event":"config_ok"');
  });

  it("exits 2 with missing_tent_id when tent is absent", () => {
    const r = run({
      VERDANT_TENT_ID: undefined,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: undefined,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/code=missing_tent_id/);
    expect(r.stderr).toContain('"code":"missing_tent_id"');
  });

  it("exits 2 with mixed_tent_channel_map on cross-tent channel map", () => {
    const map = {
      soilmoisture1: { tent_id: TENT_A },
      soilmoisture2: { tent_id: TENT_B },
    };
    const r = run({
      VERDANT_TENT_ID: TENT_A,
      ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify(map),
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('"code":"mixed_tent_channel_map"');
    // never imports mqtt / connects to broker
    expect(r.stderr).not.toMatch(/ECONNREFUSED|mqtt_connected|Cannot find module/i);
  });
});

import { CONFIG_ERROR_FIX_HINTS, fixHintForCode } from "../../scripts/ecowitt-live-soil-bridge";

describe("runConfigValidate --fix-hints", () => {
  it("omits fix by default", () => {
    const r = runConfigValidate({});
    expect(r.ok).toBe(false);
    expect(r.fix).toBeUndefined();
  });

  it("includes a concise fix hint when includeFixHints is true", () => {
    const r = runConfigValidate({}, { includeFixHints: true });
    expect(r.ok).toBe(false);
    expect(r.fix).toBe(CONFIG_ERROR_FIX_HINTS.missing_tent_id);
    expect(r.fix ?? "").toMatch(/VERDANT_TENT_ID/);
  });

  it("has a fix hint for every documented error code", () => {
    const codes = [
      "missing_tent_id",
      "invalid_tent_id",
      "invalid_channel_map_schema",
      "mixed_tent_channel_map",
      "channel_map_tent_mismatch",
      "missing_ingest_url",
      "missing_bridge_token",
      "mqtt_package_missing",
      "channel_map_parse_error",
    ];
    for (const c of codes) {
      expect(CONFIG_ERROR_FIX_HINTS[c]).toBeTruthy();
      expect(fixHintForCode(c)).toBe(CONFIG_ERROR_FIX_HINTS[c]);
    }
  });

  it("falls back to a docs pointer for unknown codes", () => {
    expect(fixHintForCode("some_future_code")).toMatch(/docs\//);
  });

  it("still returns ok:true with no fix when config is valid", () => {
    const TENT_A = "11111111-1111-4111-8111-111111111111";
    const r = runConfigValidate({ VERDANT_TENT_ID: TENT_A }, { includeFixHints: true });
    expect(r).toEqual({ ok: true });
  });
});

describe("`config validate --fix-hints` CLI", () => {
  if (!bunAvailable()) {
    it.skip("skipped — bun runtime not available", () => {});
    return;
  }
  it("adds fix field to the JSON envelope on failure", () => {
    const r = spawnSync(
      "bun",
      ["run", "scripts/ecowitt-live-soil-bridge.ts", "config", "validate", "--fix-hints"],
      { encoding: "utf8", env: { ...process.env, VERDANT_TENT_ID: undefined }, timeout: 15_000 },
    );
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('"code":"missing_tent_id"');
    expect(r.stderr).toContain('"fix":');
    expect(r.stderr).toMatch(/VERDANT_TENT_ID/);
  });
});

import { buildRedactedEffectiveConfig, maskUuid, hostOnly } from "../../scripts/ecowitt-live-soil-bridge";

describe("buildRedactedEffectiveConfig (pure)", () => {
  const TENT = "11111111-1111-4111-8111-111111111111";
  const PLANT = "33333333-3333-4333-8333-333333333333";
  const map = { soilmoisture1: { tent_id: TENT, plant_id: PLANT, label: "A" } };

  it("masks tent and plant UUIDs to last-4", () => {
    expect(maskUuid(TENT)).toBe("uuid:…1111");
    expect(maskUuid("not-a-uuid")).toBe("uuid:invalid");
    expect(maskUuid(null)).toBeNull();
  });

  it("hostOnly strips paths and query", () => {
    expect(hostOnly("https://a.b.co/functions/v1/x?y=1")).toBe("https://a.b.co");
    expect(hostOnly("bogus")).toBe("invalid_url");
    expect(hostOnly(null)).toBeNull();
  });

  it("never leaks raw UUIDs, tokens, ingest paths, or MQTT credentials", () => {
    const cfg = buildRedactedEffectiveConfig(
      {
        VERDANT_TENT_ID: TENT,
        VERDANT_PLANT_ID: PLANT,
        VERDANT_INGEST_URL: "https://proj.functions.supabase.co/sensor-ingest-webhook",
        VERDANT_BRIDGE_TOKEN: "vbt_supersecrettoken_1234567890",
        ECOWITT_MQTT_URL: "mqtt://broker.local:1883",
        ECOWITT_MQTT_USERNAME: "u",
        ECOWITT_MQTT_PASSWORD: "p",
        ECOWITT_MQTT_TOPIC: "ecowitt/grow",
        ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify(map),
      },
      [],
    );
    const serialized = JSON.stringify(cfg);
    expect(serialized).not.toContain(TENT);
    expect(serialized).not.toContain(PLANT);
    expect(serialized).not.toContain("supersecrettoken");
    expect(serialized).not.toContain("sensor-ingest-webhook");
    expect(serialized).not.toContain('"u"');
    expect(serialized).not.toContain('"p"');
    expect(cfg.event).toBe("config_effective");
    expect(cfg.channel_map.count).toBe(1);
    expect(cfg.channel_map.channels[0].tent_id).toBe("uuid:…1111");
    expect(cfg.mqtt.username_present).toBe(true);
    expect(cfg.mqtt.password_present).toBe(true);
    expect(cfg.ingest_url_host).toBe("https://proj.functions.supabase.co");
  });
});

describe("`config validate --dry-run` CLI", () => {
  if (!bunAvailable()) {
    it.skip("skipped — bun runtime not available", () => {});
    return;
  }
  const TENT = "11111111-1111-4111-8111-111111111111";

  it("exits 0 and prints config_ok + config_effective on success", () => {
    const r = spawnSync(
      "bun",
      ["run", "scripts/ecowitt-live-soil-bridge.ts", "config", "validate", "--dry-run"],
      { encoding: "utf8", env: { ...process.env, VERDANT_TENT_ID: TENT, ECOWITT_SOIL_CHANNEL_MAP_JSON: undefined }, timeout: 15_000 },
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('"event":"config_ok"');
    expect(r.stdout).toContain('"event":"config_effective"');
    expect(r.stdout).toContain('"tent_id":"uuid:…1111"');
    // Never imports mqtt or connects
    expect(r.stderr).not.toMatch(/mqtt_connected|ECONNREFUSED|Cannot find module/i);
  });

  it("exits 2 without printing config_effective on failure", () => {
    const r = spawnSync(
      "bun",
      ["run", "scripts/ecowitt-live-soil-bridge.ts", "config", "validate", "--dry-run"],
      { encoding: "utf8", env: { ...process.env, VERDANT_TENT_ID: undefined }, timeout: 15_000 },
    );
    expect(r.status).toBe(2);
    expect(r.stdout).not.toContain('"config_effective"');
    expect(r.stderr).toContain('"code":"missing_tent_id"');
  });
});
