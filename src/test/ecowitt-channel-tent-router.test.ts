import { describe, it, expect } from "vitest";
import {
  routeEcoWittPayloadToTents,
  type EcoWittRouterEligibleTent,
} from "@/lib/ecowittChannelTentRouter";

const FP_A = "ewfp_aaaaaaaaaaaaaaaaaaaaaaaa";
const FP_B = "ewfp_bbbbbbbbbbbbbbbbbbbbbbbb";

const tentAir: EcoWittRouterEligibleTent = {
  tent_id: "tent-air-0000-0000-0000-000000000001",
  passkey_fingerprint: FP_A,
  air_channels: [1, 2],
  soil_channels: [],
};

const tentSoil: EcoWittRouterEligibleTent = {
  tent_id: "tent-soil-0000-0000-0000-000000000002",
  passkey_fingerprint: FP_A,
  air_channels: [],
  soil_channels: [3, 4],
};

const tentBoth: EcoWittRouterEligibleTent = {
  tent_id: "tent-both-0000-0000-0000-000000000003",
  passkey_fingerprint: FP_A,
  air_channels: [5],
  soil_channels: [5],
};

describe("routeEcoWittPayloadToTents — Option C fan-out", () => {
  it("(1) maps air channel temp/humidity to the air tent", () => {
    const r = routeEcoWittPayloadToTents({
      payload: { temp1f: "77", humidity1: "55" },
      eligibleTents: [tentAir, tentSoil],
      payloadPasskeyFingerprint: FP_A,
    });
    expect(r.dropped).toEqual([]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].tent_id).toBe(tentAir.tent_id);
    const metrics = r.groups[0].readings.map((x) => [x.metric, x.value]);
    // 77°F → 25°C
    expect(metrics).toEqual(
      expect.arrayContaining([
        ["temperature_c", 25],
        ["humidity_pct", 55],
      ]),
    );
  });

  it("(2) maps soil channel to the soil tent and keeps percent", () => {
    const r = routeEcoWittPayloadToTents({
      payload: { soilmoisture3: "42" },
      eligibleTents: [tentAir, tentSoil],
      payloadPasskeyFingerprint: FP_A,
    });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].tent_id).toBe(tentSoil.tent_id);
    expect(r.groups[0].readings[0]).toMatchObject({
      metric: "soil_moisture_pct",
      value: 42,
      channel: 3,
    });
  });

  it("(3) air and soil channels can point to different tents in one POST", () => {
    const r = routeEcoWittPayloadToTents({
      payload: {
        temp2f: "68", // → tentAir (25°C? no, 20)
        humidity2: "60",
        soilmoisture4: "33",
      },
      eligibleTents: [tentAir, tentSoil],
      payloadPasskeyFingerprint: FP_A,
    });
    expect(r.dropped).toEqual([]);
    const byTent = new Map(r.groups.map((g) => [g.tent_id, g.readings]));
    expect(byTent.get(tentAir.tent_id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "temperature_c", value: 20 }),
        expect.objectContaining({ metric: "humidity_pct", value: 60 }),
      ]),
    );
    expect(byTent.get(tentSoil.tent_id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ metric: "soil_moisture_pct", value: 33 }),
      ]),
    );
  });

  it("(4) unmapped channel drops with no_eligible_tent and produces no group", () => {
    const r = routeEcoWittPayloadToTents({
      payload: { temp7f: "70", soilmoisture8: "20" },
      eligibleTents: [tentAir, tentSoil],
      payloadPasskeyFingerprint: FP_A,
    });
    expect(r.groups).toEqual([]);
    expect(r.dropped.map((d) => d.reason)).toEqual([
      "no_eligible_tent_for_channel",
      "no_eligible_tent_for_channel",
    ]);
  });

  it("(5) fingerprint mismatch drops everything and never falls back", () => {
    const r = routeEcoWittPayloadToTents({
      payload: { temp1f: "77", humidity1: "50", soilmoisture3: "20" },
      eligibleTents: [tentAir, tentSoil],
      payloadPasskeyFingerprint: FP_B,
    });
    expect(r.groups).toEqual([]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].reason).toBe("fingerprint_mismatch");
  });

  it("(6) missing payload passkey is rejected without routing", () => {
    const r = routeEcoWittPayloadToTents({
      payload: { temp1f: "77" },
      eligibleTents: [tentAir],
      payloadPasskeyFingerprint: null,
    });
    expect(r.groups).toEqual([]);
    expect(r.dropped[0].reason).toBe("no_passkey_in_payload");
    expect(r.matched_fingerprint).toBeNull();
  });

  it("(7) malformed / non-numeric values are dropped, not coerced", () => {
    const r = routeEcoWittPayloadToTents({
      payload: {
        temp1f: "not-a-number",
        humidity1: "",
        soilmoisture3: "NaN",
      },
      eligibleTents: [tentAir, tentSoil],
      payloadPasskeyFingerprint: FP_A,
    });
    expect(r.groups).toEqual([]);
    expect(r.dropped.map((d) => d.reason)).toEqual([
      "channel_value_missing_or_invalid",
      "channel_value_missing_or_invalid",
      "channel_value_missing_or_invalid",
    ]);
  });

  it("(8) values outside plausible ranges are dropped", () => {
    const r = routeEcoWittPayloadToTents({
      payload: {
        temp1f: "300", // → ~148°C, out of range
        humidity1: "150",
        soilmoisture3: "-5",
      },
      eligibleTents: [tentAir, tentSoil],
      payloadPasskeyFingerprint: FP_A,
    });
    expect(r.groups).toEqual([]);
    expect(r.dropped.every((d) => d.reason === "channel_value_out_of_plausible_range")).toBe(true);
  });

  it("(9) one tent can hold both an air and a soil channel for the same index", () => {
    const r = routeEcoWittPayloadToTents({
      payload: { temp5f: "77", humidity5: "50", soilmoisture5: "35" },
      eligibleTents: [tentBoth],
      payloadPasskeyFingerprint: FP_A,
    });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0].tent_id).toBe(tentBoth.tent_id);
    expect(r.groups[0].readings.map((x) => x.metric).sort()).toEqual([
      "humidity_pct",
      "soil_moisture_pct",
      "temperature_c",
    ]);
  });

  it("(10) is read-only and emits no alert / action_queue / AI / device language", () => {
    const r = routeEcoWittPayloadToTents({
      payload: { temp1f: "77" },
      eligibleTents: [tentAir],
      payloadPasskeyFingerprint: FP_A,
    });
    const serialized = JSON.stringify(r);
    for (const forbidden of [
      "alert",
      "action_queue",
      "ai_doctor",
      "automation",
      "device_control",
      "passkey",
      "mac",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});
