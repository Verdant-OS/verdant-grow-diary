/**
 * EcoWitt ingest — three-tent realistic-fixture end-to-end test.
 *
 * Pins down Option C fan-out using a realistic `hardware_config` shape:
 *   - flowerTent  : air ch 1 + soil ch 1
 *   - seedlingTent: air ch 2 (no soil)
 *   - vegTent     : air ch 3 + soil ch 2
 *
 * All three share the same gateway PASSKEY (same fingerprint), simulating
 * one EcoWitt gateway with multiple WH51/WH31 channels distributed across
 * tents the user owns. The test exercises the pure
 * `buildEcoWittRoutedRows` pipeline the edge function delegates to.
 *
 * Safety pins:
 *  - No raw PASSKEY/MAC/token ever appears in built rows.
 *  - No alerts / Action Queue / AI / device-control language is emitted.
 *  - Unmapped channels (e.g. soilmoisture7) are dropped, not fanned out.
 *  - `user_id` is always the server-resolved value, never client-supplied.
 */
import { describe, it, expect } from "vitest";
import { buildEcoWittRoutedRows } from "@/lib/ecowittRoutedRowBuilder";
import { computeEcoWittPasskeyFingerprint } from "@/lib/ecowittPasskeyFingerprint";
import type { EcoWittRouterEligibleTent } from "@/lib/ecowittChannelTentRouter";

const USER = "uuuuuuuu-uuuu-uuuu-uuuu-uuuuuuuuuuuu";
const NOW = "2026-06-04T12:30:00.000Z";
const PASSKEY = "REDACTED_TEST_PASSKEY";

const FIXTURE = {
  flowerTent: {
    id: "tent-flower",
    hardware_config: {
      ecowitt: {
        passkey: PASSKEY,
        air_channels: ["1"],
        soil_channels: ["1"],
      },
    },
  },
  seedlingTent: {
    id: "tent-seedling",
    hardware_config: {
      ecowitt: {
        passkey: PASSKEY,
        air_channels: ["2"],
      },
    },
  },
  vegTent: {
    id: "tent-veg",
    hardware_config: {
      ecowitt: {
        passkey: PASSKEY,
        air_channels: ["3"],
        soil_channels: ["2"],
      },
    },
  },
} as const;

async function buildEligibleTents(): Promise<EcoWittRouterEligibleTent[]> {
  const fp = await computeEcoWittPasskeyFingerprint(PASSKEY);
  if (!fp) throw new Error("fingerprint required");
  // Mirrors how the edge function projects `tents.hardware_config` into the
  // router input: coerce channel strings to numbers and default soil to [].
  const toNums = (xs: readonly string[] | undefined): number[] =>
    (xs ?? []).map((s) => Number.parseInt(s, 10)).filter(Number.isFinite);
  return [
    {
      tent_id: FIXTURE.flowerTent.id,
      passkey_fingerprint: fp,
      air_channels: toNums(FIXTURE.flowerTent.hardware_config.ecowitt.air_channels),
      soil_channels: toNums(FIXTURE.flowerTent.hardware_config.ecowitt.soil_channels),
    },
    {
      tent_id: FIXTURE.seedlingTent.id,
      passkey_fingerprint: fp,
      air_channels: toNums(FIXTURE.seedlingTent.hardware_config.ecowitt.air_channels),
      soil_channels: [],
    },
    {
      tent_id: FIXTURE.vegTent.id,
      passkey_fingerprint: fp,
      air_channels: toNums(FIXTURE.vegTent.hardware_config.ecowitt.air_channels),
      soil_channels: toNums(FIXTURE.vegTent.hardware_config.ecowitt.soil_channels),
    },
  ];
}

describe("EcoWitt ingest — three-tent realistic fixture", () => {
  it("fans out one POST to three tents based on air/soil channel maps", async () => {
    const eligibleTents = await buildEligibleTents();
    const fp = eligibleTents[0].passkey_fingerprint;

    // Realistic gateway POST: 3 air channels + 2 soil channels, plus an
    // unmapped soilmoisture7 (must be dropped, not silently assigned).
    const payload = {
      PASSKEY,
      stationtype: "GW2000A_V3.1.4",
      temp1f: "77.0", // 25.0 C → flowerTent
      humidity1: "55",
      temp2f: "73.4", // 23.0 C → seedlingTent
      humidity2: "60",
      temp3f: "80.6", // 27.0 C → vegTent
      humidity3: "50",
      soilmoisture1: "42", // → flowerTent
      soilmoisture2: "37", // → vegTent
      soilmoisture7: "99", // unmapped → dropped
    };

    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload,
      payloadPasskeyFingerprint: fp,
      eligibleTents,
      capturedAt: NOW,
    });

    expect(summary.accepted).toBe(true);
    expect(summary.matched_fingerprint).toBe(fp);

    // Group rows by tent → metric set.
    const byTent = new Map<string, string[]>();
    for (const r of rows) {
      const list = byTent.get(r.tent_id) ?? [];
      list.push(r.metric);
      byTent.set(r.tent_id, list);
    }
    const flower = (byTent.get("tent-flower") ?? []).sort();
    const seedling = (byTent.get("tent-seedling") ?? []).sort();
    const veg = (byTent.get("tent-veg") ?? []).sort();

    // flowerTent: temp + RH + derived VPD + soil moisture.
    expect(flower).toEqual([
      "humidity_pct",
      "soil_moisture_pct",
      "temperature_c",
      "vpd_kpa",
    ]);
    // seedlingTent: air only → temp + RH + derived VPD, NO soil.
    expect(seedling).toEqual(["humidity_pct", "temperature_c", "vpd_kpa"]);
    // vegTent: temp + RH + derived VPD + soil.
    expect(veg).toEqual([
      "humidity_pct",
      "soil_moisture_pct",
      "temperature_c",
      "vpd_kpa",
    ]);

    // Unmapped soilmoisture7 must show up in `dropped`, never in rows.
    const dropKeys = summary.dropped.map((d) => d.channel_key);
    expect(dropKeys).toContain("soilmoisture7");
    expect(rows.find((r) => r.tent_id === undefined)).toBeUndefined();
  });

  it("seedlingTent never receives soil rows even when soilmoisture for ch2 is present", async () => {
    const eligibleTents = await buildEligibleTents();
    const fp = eligibleTents[0].passkey_fingerprint;

    // soilmoisture2 belongs to vegTent (soil_channels = [2]), NOT seedling.
    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { PASSKEY, temp2f: "73.4", humidity2: "60", soilmoisture2: "33" },
      payloadPasskeyFingerprint: fp,
      eligibleTents,
      capturedAt: NOW,
    });

    const seedlingRows = rows.filter((r) => r.tent_id === "tent-seedling");
    expect(seedlingRows.every((r) => r.metric !== "soil_moisture_pct")).toBe(true);

    const soilRows = rows.filter((r) => r.metric === "soil_moisture_pct");
    expect(soilRows.map((r) => r.tent_id)).toEqual(["tent-veg"]);
  });

  it("temperature is converted °F → °C with sane rounding", async () => {
    const eligibleTents = await buildEligibleTents();
    const fp = eligibleTents[0].passkey_fingerprint;

    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { PASSKEY, temp1f: "77.0", humidity1: "55" },
      payloadPasskeyFingerprint: fp,
      eligibleTents,
      capturedAt: NOW,
    });

    const temp = rows.find(
      (r) => r.tent_id === "tent-flower" && r.metric === "temperature_c",
    );
    expect(temp).toBeDefined();
    expect(temp!.value).toBeGreaterThan(24.9);
    expect(temp!.value).toBeLessThan(25.1);
  });

  it("server-resolved user_id overrides any client-supplied user_id", async () => {
    const eligibleTents = await buildEligibleTents();
    const fp = eligibleTents[0].passkey_fingerprint;

    const { rows } = buildEcoWittRoutedRows({
      userId: USER,
      payload: {
        PASSKEY,
        user_id: "client-spoofed",
        temp1f: "77",
        humidity1: "55",
      },
      payloadPasskeyFingerprint: fp,
      eligibleTents,
      capturedAt: NOW,
    });

    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.user_id).toBe(USER);
      expect(JSON.stringify(r)).not.toContain("client-spoofed");
    }
  });

  it("never persists raw PASSKEY or MAC in built rows", async () => {
    const eligibleTents = await buildEligibleTents();
    const fp = eligibleTents[0].passkey_fingerprint;

    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: {
        PASSKEY,
        MAC: "AA:BB:CC:DD:EE:FF",
        temp1f: "77",
        humidity1: "55",
        soilmoisture1: "42",
      },
      payloadPasskeyFingerprint: fp,
      eligibleTents,
      capturedAt: NOW,
    });

    const blob = JSON.stringify({ rows, summary });
    expect(blob).not.toContain(PASSKEY);
    expect(blob).not.toContain("AA:BB:CC:DD:EE:FF");
    // Only the safe fingerprint is allowed.
    expect(blob).toContain(fp);
    expect(fp.startsWith("ewfp_")).toBe(true);
  });

  it("emits no alert / action_queue / AI / device-control fields", async () => {
    const eligibleTents = await buildEligibleTents();
    const fp = eligibleTents[0].passkey_fingerprint;

    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { PASSKEY, temp1f: "77", humidity1: "55", soilmoisture1: "42" },
      payloadPasskeyFingerprint: fp,
      eligibleTents,
      capturedAt: NOW,
    });

    const blob = JSON.stringify({ rows, summary }).toLowerCase();
    for (const banned of [
      "alert",
      "action_queue",
      "ai_doctor",
      "automation",
      "relay",
      "setpoint",
      "device_command",
    ]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("returns no rows + accepted:false when PASSKEY fingerprint does not match any tent", async () => {
    const eligibleTents = await buildEligibleTents();
    const otherFp = await computeEcoWittPasskeyFingerprint("DIFFERENT_GATEWAY_PASSKEY");

    const { rows, summary } = buildEcoWittRoutedRows({
      userId: USER,
      payload: { temp1f: "77", humidity1: "55" },
      payloadPasskeyFingerprint: otherFp,
      eligibleTents,
      capturedAt: NOW,
    });

    expect(rows).toEqual([]);
    expect(summary.accepted).toBe(false);
    expect(summary.rows_built).toBe(0);
  });
});
