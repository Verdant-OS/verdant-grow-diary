import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkBridgeEnv } from "../../scripts/ecowitt-bridge-env-check";

const TENT = "11111111-1111-1111-1111-111111111111";
const PLANT = "22222222-2222-2222-2222-222222222222";
const URL_OK = "https://example.invalid/sensor-ingest-webhook";

describe("ecowitt-bridge env preflight", () => {
  it("dry-run passes with only VERDANT_TENT_ID", () => {
    const r = checkBridgeEnv({
      env: { VERDANT_TENT_ID: TENT },
      mode: "dry-run",
    });
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("dry-run fails without VERDANT_TENT_ID", () => {
    const r = checkBridgeEnv({ env: {}, mode: "dry-run" });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("VERDANT_TENT_ID"))).toBe(true);
  });

  it("send mode fails without ingest URL / bridge token", () => {
    const r = checkBridgeEnv({
      env: { VERDANT_TENT_ID: TENT },
      mode: "send",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("VERDANT_INGEST_URL"))).toBe(true);
    expect(r.errors.some((e) => e.includes("VERDANT_BRIDGE_TOKEN"))).toBe(true);
  });

  it("send mode passes with URL + token + tent", () => {
    const r = checkBridgeEnv({
      env: {
        VERDANT_TENT_ID: TENT,
        VERDANT_INGEST_URL: URL_OK,
        VERDANT_BRIDGE_TOKEN: "vbt_secret_value",
      },
      mode: "send",
    });
    expect(r.ok).toBe(true);
  });

  it("invalid UUID fails", () => {
    const r = checkBridgeEnv({
      env: { VERDANT_TENT_ID: "not-a-uuid" },
      mode: "dry-run",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /UUID/i.test(e))).toBe(true);
  });

  it("invalid plant_id UUID fails", () => {
    const r = checkBridgeEnv({
      env: { VERDANT_TENT_ID: TENT, VERDANT_PLANT_ID: "bad" },
      mode: "dry-run",
    });
    expect(r.ok).toBe(false);
  });

  it("valid channel map passes", () => {
    const r = checkBridgeEnv({
      env: {
        VERDANT_TENT_ID: TENT,
        ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify({
          soilmoisture1: { tent_id: TENT, plant_id: PLANT, label: "a" },
        }),
      },
      mode: "dry-run",
    });
    expect(r.ok).toBe(true);
  });

  it("malformed channel map JSON fails", () => {
    const r = checkBridgeEnv({
      env: { VERDANT_TENT_ID: TENT, ECOWITT_SOIL_CHANNEL_MAP_JSON: "{not json" },
      mode: "dry-run",
    });
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /JSON/i.test(e))).toBe(true);
  });

  it("channel map with bad tent UUID fails", () => {
    const r = checkBridgeEnv({
      env: {
        VERDANT_TENT_ID: TENT,
        ECOWITT_SOIL_CHANNEL_MAP_JSON: JSON.stringify({
          soilmoisture1: { tent_id: "bad" },
        }),
      },
      mode: "dry-run",
    });
    expect(r.ok).toBe(false);
  });

  it("never returns the bridge token value in lines", () => {
    const r = checkBridgeEnv({
      env: {
        VERDANT_TENT_ID: TENT,
        VERDANT_BRIDGE_TOKEN: "vbt_SUPER_SECRET_DO_NOT_PRINT",
      },
      mode: "dry-run",
    });
    const all = [...r.lines, ...r.errors, ...r.warnings, r.dryRunCommand].join("\n");
    expect(all).not.toContain("vbt_SUPER_SECRET_DO_NOT_PRINT");
    expect(all).toMatch(/VERDANT_BRIDGE_TOKEN:\s+present/);
  });

  it("never returns the ingest URL with embedded credentials in plain", () => {
    // Sanity: URL field is still printed, but token is never embedded.
    const r = checkBridgeEnv({
      env: { VERDANT_TENT_ID: TENT, VERDANT_INGEST_URL: URL_OK },
      mode: "dry-run",
    });
    expect(r.lines.join("\n")).not.toContain("vbt_");
  });

  it("emits a ready-to-run dry-run command using the fixture", () => {
    const r = checkBridgeEnv({ env: { VERDANT_TENT_ID: TENT }, mode: "dry-run" });
    expect(r.dryRunCommand).toContain(
      "scripts/ecowitt-live-soil-dry-run.ts",
    );
    expect(r.dryRunCommand).toContain("fixtures/ecowitt-live-soil-sample.json");
    expect(r.dryRunCommand).toContain("--dry-run");
    expect(r.dryRunCommand).not.toContain("vbt_");
  });
});

describe("ecowitt-bridge env-check script safety", () => {
  const src = readFileSync(
    resolve(__dirname, "../../scripts/ecowitt-bridge-env-check.ts"),
    "utf8",
  );
  it("does not import supabase / service_role", () => {
    expect(src).not.toMatch(/@supabase\/supabase-js/);
    expect(src).not.toMatch(/service_role/i);
    expect(src).not.toMatch(/SERVICE_ROLE/);
  });
  it("does not perform network calls", () => {
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/http\.request|https\.request/);
  });
});
