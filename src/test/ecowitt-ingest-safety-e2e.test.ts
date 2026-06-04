/**
 * EcoWitt ingest — E2E safety tests for malformed values, source/redaction
 * invariants, and single-tent multi-channel fan-out.
 *
 * IMPORTANT: The current canonical destination is `sensor_readings` with
 * `source = "ecowitt"`. The task description mentions a possible
 * `environment_logs` + `source = "ecowitt_live"` shape; that table/source
 * does NOT exist in this repo. Per the spec ("do not silently change
 * implementation"), these tests are aligned to the current canonical
 * destination and pin it down so future refactors can't drift undetected.
 *
 * Scope: pure tests over `buildEcoWittRoutedRows` (the row shape the edge
 * function inserts) + grep over the edge function source for safety pins.
 * No fetch, no Deno, no Supabase client. Runs in Vitest.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildEcoWittRoutedRows } from "@/lib/ecowittRoutedRowBuilder";
import { computeEcoWittPasskeyFingerprint } from "@/lib/ecowittPasskeyFingerprint";
import type { EcoWittRouterEligibleTent } from "@/lib/ecowittChannelTentRouter";

const EDGE_FN_SRC = readFileSync(
  resolve(__dirname, "../../supabase/functions/ecowitt-ingest/index.ts"),
  "utf-8",
);

const USER = "uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu";
const NOW = "2026-06-04T12:30:00.000Z";
const PASSKEY = "REDACTED_TEST_PASSKEY";

async function flowerOnlyTents(): Promise<EcoWittRouterEligibleTent[]> {
  const fp = await computeEcoWittPasskeyFingerprint(PASSKEY);
  if (!fp) throw new Error("fingerprint required");
  return [
    {
      tent_id: "tent-flower",
      passkey_fingerprint: fp,
      air_channels: [1],
      soil_channels: [1],
    },
  ];
}

async function multiChannelTents(): Promise<EcoWittRouterEligibleTent[]> {
  // Realistic fixture: one tent maps two air channels (1,2) and two
  // soil channels (1,2). Mirrors a grower with two WH31 air sensors and
  // two WH51 soil probes inside the same tent.
  const fp = await computeEcoWittPasskeyFingerprint(PASSKEY);
  if (!fp) throw new Error("fingerprint required");
  return [
    {
      tent_id: "tent-multi",
      passkey_fingerprint: fp,
      air_channels: [1, 2],
      soil_channels: [1, 2],
    },
  ];
}

describe("EcoWitt ingest — destination + source pin (current canonical shape)", () => {
  it("inserts into `sensor_readings` with `source = 'ecowitt'` (canonical destination)", () => {
    // Pin the canonical destination at the source level so a silent flip to
    // environment_logs / 'ecowitt_live' fails CI loudly.
    expect(EDGE_FN_SRC).toMatch(/\.from\("sensor_readings"\)/);
    expect(EDGE_FN_SRC).not.toMatch(/\.from\("environment_logs"\)/);
    expect(EDGE_FN_SRC).not.toMatch(/source[^a-z]*['"]ecowitt_live['"]/i);
  });

  it("every built row carries source = 'ecowitt' (never 'ecowitt_live', never 'manual', never empty)", async () => {
    const tents = await flowerOnlyTents();
    const fp = tents[0].passkey_fingerprint;
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { PASSKEY, temp1f: "77", humidity1: "55", soilmoisture1: "42" },
      payloadPasskeyFingerprint: fp,
      eligibleTents: tents,
      capturedAt: NOW,
    });
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.source).toBe("ecowitt");
  });
});

describe("EcoWitt ingest — malformed value handling (per metric)", () => {
  const cases: Array<{
    name: string;
    payload: Record<string, unknown>;
    expectMetrics: string[]; // sorted
    droppedKey: string | null;
  }> = [
    {
      name: "temp1f missing; humidity1 + soilmoisture1 valid",
      payload: { PASSKEY, humidity1: "55", soilmoisture1: "42" },
      // No temp → no VPD derivation.
      expectMetrics: ["humidity_pct", "soil_moisture_pct"],
      droppedKey: null,
    },
    {
      name: "temp1f=abc; humidity1 + soilmoisture1 valid",
      payload: { PASSKEY, temp1f: "abc", humidity1: "55", soilmoisture1: "42" },
      expectMetrics: ["humidity_pct", "soil_moisture_pct"],
      droppedKey: "temp1f",
    },
    {
      name: "humidity1 missing; temp1f + soilmoisture1 valid",
      payload: { PASSKEY, temp1f: "77", soilmoisture1: "42" },
      // No humidity → no VPD derivation.
      expectMetrics: ["soil_moisture_pct", "temperature_c"],
      droppedKey: null,
    },
    {
      name: "humidity1=abc; temp1f + soilmoisture1 valid",
      payload: { PASSKEY, temp1f: "77", humidity1: "abc", soilmoisture1: "42" },
      expectMetrics: ["soil_moisture_pct", "temperature_c"],
      droppedKey: "humidity1",
    },
    {
      name: "soilmoisture1 missing; temp1f + humidity1 valid → temp + RH + VPD",
      payload: { PASSKEY, temp1f: "77", humidity1: "55" },
      expectMetrics: ["humidity_pct", "temperature_c", "vpd_kpa"],
      droppedKey: null,
    },
    {
      name: "soilmoisture1=abc; temp1f + humidity1 valid → temp + RH + VPD, soil dropped",
      payload: { PASSKEY, temp1f: "77", humidity1: "55", soilmoisture1: "abc" },
      expectMetrics: ["humidity_pct", "temperature_c", "vpd_kpa"],
      droppedKey: "soilmoisture1",
    },
  ];

  for (const c of cases) {
    it(`malformed: ${c.name}`, async () => {
      const tents = await flowerOnlyTents();
      const fp = tents[0].passkey_fingerprint;

      const { rows, summary } = buildEcoWittRoutedRows({
        userId: USER,
        payload: c.payload,
        payloadPasskeyFingerprint: fp,
        eligibleTents: tents,
        capturedAt: NOW,
      });

      // Only valid metrics inserted; bad/missing skipped.
      const metrics = rows.map((r) => r.metric).sort();
      expect(metrics).toEqual(c.expectMetrics);

      // No NaN / Infinity ever reaches a row.
      for (const r of rows) {
        expect(Number.isFinite(r.value)).toBe(true);
        expect(Number.isNaN(r.value)).toBe(false);
      }

      // VPD only when BOTH valid temp and valid humidity exist for the
      // same mapped air channel.
      const hasTemp = metrics.includes("temperature_c");
      const hasHum = metrics.includes("humidity_pct");
      const hasVpd = metrics.includes("vpd_kpa");
      expect(hasVpd).toBe(hasTemp && hasHum);

      // Bad explicit values land in `dropped`; missing keys do not.
      if (c.droppedKey) {
        const keys = summary.dropped.map((d) => d.channel_key);
        expect(keys).toContain(c.droppedKey);
      }

      // Handler-equivalent: row presence drives accepted=true.
      expect(summary.accepted).toBe(rows.length > 0);
    });
  }
});

describe("EcoWitt ingest — raw_payload redaction & safe-fields-only contract", () => {
  it("only persists the documented safe fields in raw_payload (no full payload echo)", async () => {
    const tents = await flowerOnlyTents();
    const fp = tents[0].passkey_fingerprint;

    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: {
        PASSKEY,
        MAC: "AA:BB:CC:DD:EE:FF",
        api_key: "ak_super_secret",
        application_key: "appk_super_secret",
        token: "tok_super_secret",
        auth: "Bearer leak-me",
        service_role: "sr_super_secret",
        user_id: "client-spoofed",
        stationtype: "GW2000A_V3.1.4",
        dateutc: "2026-06-04 12:30:00",
        // Real readings
        temp1f: "77",
        humidity1: "55",
        soilmoisture1: "42",
      },
      payloadPasskeyFingerprint: fp,
      eligibleTents: tents,
      capturedAt: NOW,
    });

    expect(rows.length).toBeGreaterThan(0);

    const ALLOWED_KEYS = new Set([
      "provider",
      "mapping_type",
      "channel",
      "raw_key",
      "raw_value",
      "passkey_fingerprint",
      "calculated",
    ]);

    for (const r of rows) {
      const rp = r.raw_payload as unknown as Record<string, unknown>;
      // Whitelist: no unexpected keys ever appear.
      for (const k of Object.keys(rp)) {
        expect(ALLOWED_KEYS.has(k)).toBe(true);
      }
      // Provider pinned.
      expect(rp.provider).toBe("ecowitt");
      // mapping_type matches metric family.
      if (r.metric === "soil_moisture_pct") {
        expect(rp.mapping_type).toBe("soil");
      } else {
        expect(rp.mapping_type).toBe("air");
      }
      // Fingerprint, not raw passkey.
      expect(String(rp.passkey_fingerprint).startsWith("ewfp_")).toBe(true);

      // None of these credentials/identity fields ever appear anywhere in
      // the row (key OR value).
      const blob = JSON.stringify(r);
      for (const secret of [
        PASSKEY,
        "AA:BB:CC:DD:EE:FF",
        "ak_super_secret",
        "appk_super_secret",
        "tok_super_secret",
        "Bearer leak-me",
        "sr_super_secret",
        "client-spoofed",
      ]) {
        expect(blob).not.toContain(secret);
      }
      // And the credential KEYS themselves never appear as raw_payload props.
      for (const banned of [
        "api_key",
        "application_key",
        "token",
        "auth",
        "service_role",
        "user_id",
        "mac",
        "passkey",
        "stationtype",
        "dateutc",
      ]) {
        expect(Object.keys(rp)).not.toContain(banned);
      }
    }
  });

  it("edge function source sanitizes credential keys before persisting raw_payload", () => {
    // Cross-check: the edge function's sanitizer list still covers each
    // forbidden key (existing contract test covers some; this one pins
    // the full set we asserted above).
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
      expect(EDGE_FN_SRC).toMatch(new RegExp(`"${key}"`));
    }
    expect(EDGE_FN_SRC).toMatch(/sanitizePayload\(payload\)/);
  });
});

describe("EcoWitt ingest — single-tent multi-channel fan-out", () => {
  it("two air channels + two soil channels all land in the same tent with per-channel VPD", async () => {
    const tents = await multiChannelTents();
    const fp = tents[0].passkey_fingerprint;

    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: {
        PASSKEY,
        temp1f: "77.0", // 25 C
        humidity1: "55",
        temp2f: "73.4", // 23 C
        humidity2: "60",
        soilmoisture1: "42",
        soilmoisture2: "37",
      },
      payloadPasskeyFingerprint: fp,
      eligibleTents: tents,
      capturedAt: NOW,
    });

    // All rows land on the same tent.
    expect(new Set(rows.map((r) => r.tent_id))).toEqual(new Set(["tent-multi"]));

    // Two temps, two RHs, two soils, two derived VPDs (one per air channel).
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.metric] = (counts[r.metric] ?? 0) + 1;
    expect(counts.temperature_c).toBe(2);
    expect(counts.humidity_pct).toBe(2);
    expect(counts.soil_moisture_pct).toBe(2);
    expect(counts.vpd_kpa).toBe(2);

    // Per-channel VPD: derived rows reference their source channel.
    const vpdChannels = rows
      .filter((r) => r.metric === "vpd_kpa")
      .map((r) => (r.raw_payload as { channel: number }).channel)
      .sort();
    expect(vpdChannels).toEqual([1, 2]);

    // Per-tent summary reflects the full count.
    const perTent = summary.per_tent.find((p) => p.tent_id === "tent-multi");
    expect(perTent?.rows).toBe(rows.length);
    expect(summary.accepted).toBe(true);
  });

  it("unmapped channels (ch3+) are dropped with `no_eligible_tent_for_channel`, not silently routed", async () => {
    const tents = await multiChannelTents();
    const fp = tents[0].passkey_fingerprint;

    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: {
        PASSKEY,
        temp1f: "77",
        humidity1: "55",
        // Unmapped:
        temp3f: "75",
        humidity3: "50",
        soilmoisture5: "30",
      },
      payloadPasskeyFingerprint: fp,
      eligibleTents: tents,
      capturedAt: NOW,
    });

    // Only ch1 air metrics land (+ derived VPD).
    expect(rows.every((r) => r.tent_id === "tent-multi")).toBe(true);
    const channels = new Set(
      rows.map((r) => (r.raw_payload as { channel: number }).channel),
    );
    expect(channels).toEqual(new Set([1]));

    const droppedKeys = summary.dropped
      .filter((d) => d.reason === "no_eligible_tent_for_channel")
      .map((d) => d.channel_key)
      .sort();
    expect(droppedKeys).toEqual(["humidity3", "soilmoisture5", "temp3f"]);
  });

  it("partial validity on a multi-channel tent: ch1 RH bad, ch2 fully valid → ch1 temp+soil land, ch2 gets full set", async () => {
    const tents = await multiChannelTents();
    const fp = tents[0].passkey_fingerprint;

    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: {
        PASSKEY,
        temp1f: "77",
        humidity1: "abc", // bad → ch1 VPD must NOT derive
        soilmoisture1: "42",
        temp2f: "73.4",
        humidity2: "60",
        soilmoisture2: "37",
      },
      payloadPasskeyFingerprint: fp,
      eligibleTents: tents,
      capturedAt: NOW,
    });

    // ch1: temp + soil only (no RH, no VPD).
    const ch1 = rows
      .filter((r) => (r.raw_payload as { channel: number }).channel === 1)
      .map((r) => r.metric)
      .sort();
    expect(ch1).toEqual(["soil_moisture_pct", "temperature_c"]);

    // ch2: full set including derived VPD.
    const ch2 = rows
      .filter((r) => (r.raw_payload as { channel: number }).channel === 2)
      .map((r) => r.metric)
      .sort();
    expect(ch2).toEqual([
      "humidity_pct",
      "soil_moisture_pct",
      "temperature_c",
      "vpd_kpa",
    ]);

    expect(
      summary.dropped.some(
        (d) => d.channel_key === "humidity1" && d.reason === "channel_value_missing_or_invalid",
      ),
    ).toBe(true);

    // No NaN/Infinity leaked.
    for (const r of rows) expect(Number.isFinite(r.value)).toBe(true);
  });
});

describe("EcoWitt ingest — handler shell still 200s on zero-row outcomes", () => {
  it("handler source returns 200 with accepted=false on empty/unmapped payloads (no 4xx for malformed bodies)", () => {
    // The handler returns json({ accepted, rows_inserted, ... }, 200) for
    // the routed path. Pin that with a regex over the source.
    expect(EDGE_FN_SRC).toMatch(/status:\s*200/);
    // It does NOT return 4xx when the payload is well-formed JSON but has
    // no mappable channels — only auth/JSON-parse errors should 4xx.
    expect(EDGE_FN_SRC).not.toMatch(/return\s+json\([^)]*accepted[^)]*\),\s*\{\s*status:\s*4\d\d/);
  });
});
