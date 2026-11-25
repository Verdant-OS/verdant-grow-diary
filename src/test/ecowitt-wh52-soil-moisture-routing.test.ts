import { describe, expect, it } from "vitest";
import {
  EcoWittWh52SoilProbe,
  routeEcoWittPayloadToTents,
  type EcoWittRouterEligibleTent,
} from "@/lib/ecowittChannelTentRouter";

const FP = "ewfp_wh52soilalphagatewayverdant";

const tent: EcoWittRouterEligibleTent = {
  tent_id: "tent-soil-alpha-0000-0000-000000000001",
  passkey_fingerprint: FP,
  air_channels: [],
  soil_channels: [1],
};

describe("EcoWitt WH52 soil_ec_hum moisture", () => {
  it("maps soil_ec_hum1 to soil_moisture_pct and ignores soil temp and EC", () => {
    const routed = routeEcoWittPayloadToTents({
      payload: {
        PASSKEY: "not-used-for-routing",
        soil_ec_hum1: "31",
        soil_ec_temp1: "75.6",
        soil_ec1: "3290",
      },
      eligibleTents: [tent],
      payloadPasskeyFingerprint: FP,
    });

    expect(routed.dropped).toEqual([]);
    expect(routed.groups).toEqual([
      {
        tent_id: tent.tent_id,
        readings: [
          {
            metric: "soil_moisture_pct",
            channel: 1,
            value: 31,
            source_channel_key: "soil_ec_hum1",
          },
        ],
      },
    ]);
  });

  it.each([
    ["soilmoisture before soil_ec_hum", { soilmoisture1: "44", soil_ec_hum1: "31" }],
    ["soil_ec_hum before soilmoisture", { soil_ec_hum1: "31", soilmoisture1: "44" }],
  ])("keeps soilmoisture1 when both keys exist (%s)", (_label, payload) => {
    const routed = routeEcoWittPayloadToTents({
      payload,
      eligibleTents: [tent],
      payloadPasskeyFingerprint: FP,
    });

    expect(routed.dropped).toEqual([]);
    expect(routed.groups[0].readings).toEqual([
      {
        metric: "soil_moisture_pct",
        channel: 1,
        value: 44,
        source_channel_key: "soilmoisture1",
      },
    ]);
  });

  it("sees a mixed-case soilmoisture key as the legacy reading", () => {
    expect(EcoWittWh52SoilProbe.legacyMoisturePresent({ SoilMoisture5: "12" }, 5)).toBe(true);
    const routed = routeEcoWittPayloadToTents({
      payload: { SoilMoisture5: "12", soil_ec_hum5: "40" },
      eligibleTents: [{ ...tent, soil_channels: [5] }],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.groups[0].readings).toEqual([
      {
        metric: "soil_moisture_pct",
        channel: 5,
        value: 12,
        source_channel_key: "soilmoisture5",
      },
    ]);
  });

  it("routes soil_ec_hum5 only to the tent that lists channel 5", () => {
    const channelFive = { ...tent, tent_id: "tent-ch5", soil_channels: [5] };
    const routed = routeEcoWittPayloadToTents({
      payload: { soil_ec_hum5: "55", soil_ec_hum3: "33" },
      eligibleTents: [channelFive],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.groups).toEqual([
      {
        tent_id: "tent-ch5",
        readings: [
          {
            metric: "soil_moisture_pct",
            channel: 5,
            value: 55,
            source_channel_key: "soil_ec_hum5",
          },
        ],
      },
    ]);
    expect(routed.dropped).toEqual([
      {
        channel_key: "soil_ec_hum3",
        channel: 3,
        metric: "soil_moisture_pct",
        reason: "no_eligible_tent_for_channel",
      },
    ]);
  });

  it.each([2, 3, 4, 6, 7, 8])("maps soil_ec_hum%s when that channel is listed", (channel) => {
    const routed = routeEcoWittPayloadToTents({
      payload: { [`soil_ec_hum${channel}`]: "20" },
      eligibleTents: [{ ...tent, soil_channels: [channel] }],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.dropped).toEqual([]);
    expect(routed.groups[0].readings[0]).toMatchObject({
      metric: "soil_moisture_pct",
      channel,
      value: 20,
      source_channel_key: `soil_ec_hum${channel}`,
    });
  });

  it.each([-1, 101])("drops soil_ec_hum1 value %s as out of range", (value) => {
    const routed = routeEcoWittPayloadToTents({
      payload: { soil_ec_hum1: String(value) },
      eligibleTents: [tent],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.groups).toEqual([]);
    expect(routed.dropped).toEqual([
      {
        channel_key: "soil_ec_hum1",
        channel: 1,
        metric: "soil_moisture_pct",
        reason: "channel_value_out_of_plausible_range",
      },
    ]);
  });

  it.each(["", "   ", "nope", "true", "false"])(
    "does not emit 0 when soil_ec_hum1 is %j",
    (value) => {
      const routed = routeEcoWittPayloadToTents({
        payload: { soil_ec_hum1: value },
        eligibleTents: [tent],
        payloadPasskeyFingerprint: FP,
      });
      expect(routed.groups).toEqual([]);
      expect(routed.dropped[0]).toMatchObject({
        channel_key: "soil_ec_hum1",
        reason: "channel_value_missing_or_invalid",
      });
    },
  );

  it("does not emit 0 when soil_ec_hum1 is null or a boolean", () => {
    for (const value of [null, true, false]) {
      const routed = routeEcoWittPayloadToTents({
        payload: { soil_ec_hum1: value },
        eligibleTents: [tent],
        payloadPasskeyFingerprint: FP,
      });
      expect(routed.groups).toEqual([]);
      expect(routed.dropped.map((drop) => drop.reason)).toEqual([
        "channel_value_missing_or_invalid",
      ]);
    }
  });

  it("does not fall back to soil_ec_humN when soilmoistureN is present but invalid", () => {
    const routed = routeEcoWittPayloadToTents({
      payload: {
        soilmoisture1: "nope",
        soil_ec_hum1: "31",
      },
      eligibleTents: [tent],
      payloadPasskeyFingerprint: FP,
    });

    expect(routed.groups).toEqual([]);
    expect(routed.dropped).toEqual([
      {
        channel_key: "soilmoisture1",
        channel: 1,
        metric: "soil_moisture_pct",
        reason: "channel_value_missing_or_invalid",
      },
    ]);
  });

  it("does not treat soil_ec_hum9 as a soil channel", () => {
    expect(EcoWittWh52SoilProbe.moistureChannel("soil_ec_hum9")).toBeNull();
    const routed = routeEcoWittPayloadToTents({
      payload: { soil_ec_hum9: "31" },
      eligibleTents: [{ ...tent, soil_channels: [9] }],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.groups).toEqual([]);
    expect(routed.dropped).toEqual([]);
  });
});
