import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DOCS = readFileSync(resolve(__dirname, "../../docs/ecowitt-live-soil-bridge.md"), "utf8");

describe("docs/ecowitt-live-soil-bridge.md operator-polish sections", () => {
  it("contains a Rollback section", () => {
    expect(DOCS).toMatch(/^##\s+Rollback\s*$/m);
    expect(DOCS).toMatch(/Stop the bridge process/i);
    expect(DOCS).toMatch(/ecowitt2mqtt/);
    expect(DOCS).toMatch(/ECOWITT_BRIDGE_DRY_RUN=true/);
    for (const v of [
      "VERDANT_INGEST_URL",
      "VERDANT_BRIDGE_TOKEN",
      "VERDANT_TENT_ID",
      "VERDANT_PLANT_ID",
      "ECOWITT_SOIL_CHANNEL_MAP_JSON",
    ]) {
      expect(DOCS).toContain(v);
    }
    expect(DOCS).toMatch(/Do not delete existing Verdant readings/i);
    expect(DOCS).toMatch(/Never rotate or expose bridge tokens in docs/i);
    expect(DOCS).toMatch(/Do not make direct Supabase table edits/i);
  });

  it("contains a 'If VPD or charts do not update' troubleshooting section", () => {
    expect(DOCS).toMatch(/^##\s+If VPD or charts do not update\s*$/m);
    expect(DOCS).toMatch(/mosquitto_sub|MQTT Explorer/);
    expect(DOCS).toMatch(/dry-run/i);
    expect(DOCS).toMatch(/missing VPD is blank, never `0`/);
    expect(DOCS).toMatch(/Celsius vs Fahrenheit/i);
    expect(DOCS).toMatch(/Humidity sanity/i);
    expect(DOCS).toMatch(/Soil moisture key mapping/i);
    expect(DOCS).toMatch(/Provenance label/i);
  });

  it("contains a MQTT → normalized mapping section", () => {
    expect(DOCS).toMatch(/^##\s+MQTT message → Verdant normalized payload mapping\s*$/m);
    for (const key of [
      "tempf",
      "tempc",
      "humidity",
      "soilmoisture1",
      "soilmoisture2",
      "soiltemp1f",
      "dateutc",
      "vpd_kpa",
    ]) {
      expect(DOCS).toContain(key);
    }
  });

  it("uses canonical source 'live' and provider 'ecowitt' in the mapping", () => {
    expect(DOCS).toMatch(/canonical.*source/i);
    expect(DOCS).toMatch(/"source":\s*"live"/);
    expect(DOCS).toMatch(/"provider":\s*"ecowitt"/);
    expect(DOCS).toMatch(/Do \*\*not\*\* use\s*`source: "ecowitt"`/);
  });

  it("warns not to open router ports", () => {
    expect(DOCS).toMatch(/Do \*\*not\*\* open router ports/);
  });

  it("warns to rotate exposed EcoWitt API keys", () => {
    expect(DOCS).toMatch(/rotate it immediately/i);
    expect(DOCS).toMatch(/EcoWitt cloud API key/);
  });

  it("documents EcoWitt cloud API is deferred", () => {
    expect(DOCS).toMatch(/cloud API is deferred|cloud API.*deferred/i);
  });

  it("documents no direct Supabase writes / no service-role / no device control / no automation", () => {
    expect(DOCS).toMatch(/no direct Supabase writes/i);
    expect(DOCS).toMatch(/service-role/i);
    expect(DOCS).toMatch(/no device control/i);
    expect(DOCS).toMatch(/no automation/i);
  });

  it("documents the single-tent channel map rule against VERDANT_TENT_ID", () => {
    expect(DOCS).toMatch(/Single-tent rule/);
    expect(DOCS).toMatch(
      /every soil channel[\s\S]{0,80}VERDANT_TENT_ID|VERDANT_TENT_ID[\s\S]{0,120}same tent/i,
    );
  });

  it("documents the --validate-config mode, its exit codes, and its no-UUID-leak guarantee", () => {
    expect(DOCS).toMatch(/--validate-config/);
    expect(DOCS).toMatch(/ECOWITT_BRIDGE_VALIDATE_CONFIG/);
    expect(DOCS).toMatch(/never imports the `mqtt` package|never opens a network connection/i);
    expect(DOCS).toMatch(/never prints? a tent UUID|never a tent UUID/i);
    for (const status of ["accepted", "empty", "mixed-tent", "malformed_config"]) {
      expect(DOCS).toContain(status);
    }
  });

  it("documents malformed_config as exit code 4, checked before mixed-tent/empty", () => {
    expect(DOCS).toMatch(/malformed_config/);
    expect(DOCS).toMatch(/not valid JSON/i);
    expect(DOCS).toMatch(/stable contract/i);
    expect(DOCS).toMatch(/never silently reported\s+as `empty`/);
  });

  it("documents --format json / --json-errors machine-readable output", () => {
    expect(DOCS).toMatch(/--format json/);
    expect(DOCS).toMatch(/--json-errors/);
    expect(DOCS).toMatch(/ECOWITT_BRIDGE_JSON_ERRORS/);
    expect(DOCS).toMatch(/single-line JSON envelope/);
    expect(DOCS).toMatch(/deterministic for a given logical configuration/);
    expect(DOCS).toMatch(/never contains a tent UUID, a bridge token/);
  });
});
