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

  it("keeps soilmoistureN when both moisture keys exist for the same channel", () => {
    const routed = routeEcoWittPayloadToTents({
      payload: {
        soilmoisture1: "44",
        soil_ec_hum1: "31",
      },
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
    expect(EcoWittWh52SoilProbe.legacyMoisturePresent({ soilmoisture1: "44" }, 1)).toBe(true);
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
