import { describe, expect, it } from "vitest";
import {
  routeEcoWittPayloadToTents,
  type EcoWittRouterEligibleTent,
} from "@/lib/ecowittChannelTentRouter";

const FP = "ewfp_wh52soilalphagatewayverdant";

function tentFor(channels: number[]): EcoWittRouterEligibleTent {
  return {
    tent_id: "tent-soil-alpha-0000-0000-000000000001",
    passkey_fingerprint: FP,
    air_channels: [],
    soil_channels: channels,
  };
}

describe("WH52 soil moisture mutation fences", () => {
  it.each([3, 8])("maps soil_ec_hum%s to that channel", (channel) => {
    const routed = routeEcoWittPayloadToTents({
      payload: { [`soil_ec_hum${channel}`]: " 31 " },
      eligibleTents: [tentFor([channel])],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.dropped).toEqual([]);
    expect(routed.groups[0].readings).toEqual([
      {
        metric: "soil_moisture_pct",
        channel,
        value: 31,
        source_channel_key: `soil_ec_hum${channel}`,
      },
    ]);
  });

  it("ignores a WH52 channel the tent did not list", () => {
    const routed = routeEcoWittPayloadToTents({
      payload: { soil_ec_hum3: "31", soil_ec_hum8: "18" },
      eligibleTents: [tentFor([8])],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.groups[0].readings.map((reading) => reading.channel)).toEqual([8]);
    expect(routed.dropped).toEqual([
      {
        channel_key: "soil_ec_hum3",
        channel: 3,
        metric: "soil_moisture_pct",
        reason: "no_eligible_tent_for_channel",
      },
    ]);
  });

  it.each([2, 4, 5, 6, 7])("accepts soil_ec_hum%s", (channel) => {
    const routed = routeEcoWittPayloadToTents({
      payload: { [`soil_ec_hum${channel}`]: "20" },
      eligibleTents: [tentFor([channel])],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.groups[0].readings[0]).toMatchObject({
      channel,
      value: 20,
      source_channel_key: `soil_ec_hum${channel}`,
    });
  });

  it.each([-1, 101, Number.NaN])("rejects soil_ec_hum1 value %s", (value) => {
    const routed = routeEcoWittPayloadToTents({
      payload: { soil_ec_hum1: value },
      eligibleTents: [tentFor([1])],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.groups).toEqual([]);
    expect(["channel_value_missing_or_invalid", "channel_value_out_of_plausible_range"]).toContain(
      routed.dropped[0]?.reason,
    );
  });

  it.each(["", "   ", "nope"])("drops soil_ec_hum1 %j instead of storing 0", (value) => {
    const routed = routeEcoWittPayloadToTents({
      payload: { soil_ec_hum1: value },
      eligibleTents: [tentFor([1])],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.groups).toEqual([]);
    expect(routed.dropped).toEqual([
      {
        channel_key: "soil_ec_hum1",
        channel: 1,
        metric: "soil_moisture_pct",
        reason: "channel_value_missing_or_invalid",
      },
    ]);
  });

  it("drops a missing soil_ec_hum1 value", () => {
    const routed = routeEcoWittPayloadToTents({
      payload: { soil_ec_hum1: null },
      eligibleTents: [tentFor([1])],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.groups).toEqual([]);
    expect(routed.dropped[0].reason).toBe("channel_value_missing_or_invalid");
  });

  it.each([
    { soilmoisture3: "44", soil_ec_hum3: "31" },
    { soil_ec_hum3: "31", soilmoisture3: "44" },
  ])("keeps soilmoisture3 when both keys exist", (payload) => {
    const routed = routeEcoWittPayloadToTents({
      payload,
      eligibleTents: [tentFor([3])],
      payloadPasskeyFingerprint: FP,
    });
    expect(routed.dropped).toEqual([]);
    expect(routed.groups[0].readings).toEqual([
      {
        metric: "soil_moisture_pct",
        channel: 3,
        value: 44,
        source_channel_key: "soilmoisture3",
      },
    ]);
  });
});
