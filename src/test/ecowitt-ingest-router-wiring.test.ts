/**
 * EcoWitt ingest endpoint contract — Option C router-wired.
 *
 * The Deno edge function (supabase/functions/ecowitt-ingest/index.ts) is a
 * thin shell around `buildEcoWittRoutedRows`. These tests pin down the
 * response shape, the auth preservation, and the safety invariants the
 * function must satisfy every release: no raw PASSKEY/MAC in DB or
 * response, no SQL detail leaks, no service-role exposure, no alert /
 * Action Queue / AI / automation language.
 *
 * Pure unit tests — no network, no Deno, no Supabase. Runs in Vitest.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildEcoWittRoutedRows } from "@/lib/ecowittRoutedRowBuilder";
import { computeEcoWittPasskeyFingerprint } from "@/lib/ecowittPasskeyFingerprint";

const EDGE_FN_SRC = readFileSync(
  resolve(__dirname, "../../supabase/functions/ecowitt-ingest/index.ts"),
  "utf-8",
);

const USER = "uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu";
const TENT_AIR = "11111111-1111-1111-1111-111111111111";
const TENT_SOIL = "22222222-2222-2222-2222-222222222222";
const NOW = "2026-06-04T12:30:00.000Z";

async function fpFor(passkey: string) {
  const fp = await computeEcoWittPasskeyFingerprint(passkey);
  if (!fp) throw new Error("expected fingerprint");
  return fp;
}

describe("EcoWitt ingest endpoint — Option C wiring contract", () => {
  it("(12) edge function source never references service role in responses", () => {
    // Allowed: SUPABASE_SERVICE_ROLE_KEY (env var name, server-side only).
    // Forbidden: writing the value into any response body field.
    const fnSrc = EDGE_FN_SRC;
    // Ensure no response JSON ever includes "service_role" as a key.
    expect(fnSrc).not.toMatch(/json\([^)]*service_role[^)]*\)/i);
    // Ensure SUPABASE_SERVICE_ROLE_KEY is only read from env, never logged.
    const usages = fnSrc.match(/SUPABASE_SERVICE_ROLE_KEY/g) ?? [];
    expect(usages.length).toBeGreaterThan(0);
    expect(fnSrc).not.toMatch(/console\.[a-z]+\([^)]*SUPABASE_SERVICE_ROLE_KEY/);
  });

  it("(12) edge function never echoes raw PASSKEY/MAC/SQL detail into responses", () => {
    const fnSrc = EDGE_FN_SRC;
    // No response builders that include SQL error objects directly.
    expect(fnSrc).not.toMatch(/json\([^)]*insErr[^)]*\)/);
    expect(fnSrc).not.toMatch(/json\([^)]*tentErr[^)]*\)/);
    // No response builders that include the raw passkey variable.
    expect(fnSrc).not.toMatch(/json\([^)]*rawPasskey[^)]*\)/);
    // No response builders that pass the raw payload through.
    expect(fnSrc).not.toMatch(/json\([^)]*\bpayload\b[^)]*\)/);
  });

  it("(13) edge function source contains no alert / action_queue / AI / device-control wiring", () => {
    const src = EDGE_FN_SRC.toLowerCase();
    for (const banned of [
      "from(\"alerts\")",
      "from('alerts')",
      "from(\"action_queue\")",
      "from('action_queue')",
      "ai_doctor",
      "openai",
      "anthropic",
      "automation_rules",
      "device_control",
      "relay",
      "setpoint",
      "functions.invoke",
    ]) {
      expect(src).not.toContain(banned);
    }
  });

  it("preserves bearer-token auth (still 401 on missing/invalid bearer)", () => {
    const fnSrc = EDGE_FN_SRC;
    expect(fnSrc).toMatch(/authHeader\?\.startsWith\("Bearer "\)/);
    expect(fnSrc).toMatch(/unauthorized/);
    // PASSKEY is NEVER used as auth.
    expect(fnSrc).not.toMatch(/auth.*=.*PASSKEY/i);
    expect(fnSrc).not.toMatch(/authenticate.*passkey/i);
  });

  it("stamps server-resolved user_id on every row (never trusts client user_id)", async () => {
    const fingerprint = await fpFor("GATEWAY_PASSKEY_X");
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { user_id: "client-supplied", temp1f: "77", humidity1: "50" },
      payloadPasskeyFingerprint: fingerprint,
      eligibleTents: [
        {
          tent_id: TENT_AIR,
          passkey_fingerprint: fingerprint,
          air_channels: [1],
          soil_channels: [],
        },
      ],
      capturedAt: NOW,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.user_id).toBe(USER);
      expect(JSON.stringify(r)).not.toContain("client-supplied");
    }
  });

  it("for bridge auth, eligible tents are scoped to the bridge tent (cross-tent fan-out only spans the bridge scope)", () => {
    const fnSrc = EDGE_FN_SRC;
    // The wiring uses `scopedTentId = auth.tentScope` when bridge, and then
    // adds an `.eq("id", scopedTentId)` filter to the tents query.
    expect(fnSrc).toMatch(/auth\.kind === "bridge"/);
    expect(fnSrc).toMatch(/scopedTentId = auth\.tentScope/);
    expect(fnSrc).toMatch(/\.eq\("id", scopedTentId\)/);
  });

  it("returns 200 OK with accepted:false when fingerprint is missing or unmapped", async () => {
    // Pure mirror of the edge function's 0-row path. We assert via the
    // builder summary (the edge function returns it as-is in JSON).
    const fp = await fpFor("KNOWN_GATEWAY");
    const noPasskey = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77" },
      payloadPasskeyFingerprint: null,
      eligibleTents: [
        { tent_id: TENT_AIR, passkey_fingerprint: fp, air_channels: [1], soil_channels: [] },
      ],
      capturedAt: NOW,
    });
    expect(noPasskey.summary.accepted).toBe(false);
    expect(noPasskey.rows).toEqual([]);

    const unknown = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77" },
      payloadPasskeyFingerprint: await fpFor("DIFFERENT_GATEWAY"),
      eligibleTents: [
        { tent_id: TENT_AIR, passkey_fingerprint: fp, air_channels: [1], soil_channels: [] },
      ],
      capturedAt: NOW,
    });
    expect(unknown.summary.accepted).toBe(false);
    expect(unknown.rows).toEqual([]);
  });

  it("air channel temp+RH and a soil channel can land in different tents in one POST", async () => {
    const fp = await fpFor("GW_MULTI");
    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77", humidity1: "50", soilmoisture3: "42" },
      payloadPasskeyFingerprint: fp,
      eligibleTents: [
        { tent_id: TENT_AIR, passkey_fingerprint: fp, air_channels: [1], soil_channels: [] },
        { tent_id: TENT_SOIL, passkey_fingerprint: fp, air_channels: [], soil_channels: [3] },
      ],
      capturedAt: NOW,
    });
    const tents = new Set(rows.map((r) => r.tent_id));
    expect(tents).toEqual(new Set([TENT_AIR, TENT_SOIL]));
    // Air tent gets temp + RH + derived VPD.
    expect(rows.filter((r) => r.tent_id === TENT_AIR).map((r) => r.metric).sort()).toEqual([
      "humidity_pct",
      "temperature_c",
      "vpd_kpa",
    ]);
    expect(rows.filter((r) => r.tent_id === TENT_SOIL).map((r) => r.metric)).toEqual([
      "soil_moisture_pct",
    ]);
    expect(summary.accepted).toBe(true);
  });

  it("sanitization list in the edge function covers passkey/mac/api_key/application_key/token/auth/service_role/user_id", () => {
    const fnSrc = EDGE_FN_SRC;
    for (const key of [
      "passkey",
      "mac",
      "api_key",
      "application_key",
      "token",
      "auth",
      "service_role",
      "user_id",
    ]) {
      expect(fnSrc).toMatch(new RegExp(`"${key}"`));
    }
    // And the sanitizer is actually used.
    expect(fnSrc).toMatch(/sanitizePayload\(payload\)/);
  });

  it("only supports the four allowed metrics (temperature_c, humidity_pct, soil_moisture_pct, vpd_kpa)", () => {
    // No code path should emit pressure / wind / solar / battery / etc.
    const fnSrc = EDGE_FN_SRC.toLowerCase();
    for (const banned of [
      "pressure",
      "barom",
      "windspeed",
      "winddir",
      "solarradiation",
      "uv",
      "rain",
      "battery",
      "batt1",
    ]) {
      expect(fnSrc).not.toContain(banned);
    }
  });
});
