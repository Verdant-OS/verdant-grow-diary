import { describe, expect, it } from "vitest";
import { routeEcoWittPayloadToTents } from "@/lib/ecowittChannelTentRouter";

/**
 * WH52 customized-upload keys are a separate namespace from WH51 soilmoistureN.
 * Source: Home Assistant core issue 162782 records a gateway body of
 * soil_ec_hum1, soil_ec_temp1, soil_ec1, soil_ec_ad1, soil_ec_hum_ad1, soil_ec_batt1.
 * Both ecowitt-ingest and ecowitt-custom-upload route through this function.
 */
describe("WH52 soil_ec channel versus soilmoistureN", () => {
  it("stores soilmoisture1 and drops soil_ec_hum1 on the same channel number", () => {
    const result = routeEcoWittPayloadToTents({
      payload: {
        temp5f: "77",
        humidity5: "55",
        soil_ec_hum1: "40",
        soil_ec1: "170",
        soil_ec_temp1: "66.02",
        soilmoisture1: "10",
      },
      eligibleTents: [
        {
          tent_id: "78f51773-c576-4891-a9aa-240ed532337a",
          passkey_fingerprint: "ewfp_aaaaaaaaaaaaaaaaaaaaaaaa",
          air_channels: [5],
          soil_channels: [1],
        },
      ],
      payloadPasskeyFingerprint: "ewfp_aaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const readings = result.groups.flatMap((group) => group.readings);
    expect(readings.filter((reading) => reading.metric === "soil_moisture_pct")).toEqual([
      {
        metric: "soil_moisture_pct",
        channel: 1,
        value: 10,
        source_channel_key: "soilmoisture1",
      },
    ]);
    expect(readings.some((reading) => reading.source_channel_key.startsWith("soil_ec"))).toBe(
      false,
    );
    expect(JSON.stringify(result)).not.toContain("soil_ec_hum1");
    expect(readings.map((reading) => reading.metric).sort()).toEqual([
      "humidity_pct",
      "soil_moisture_pct",
      "temperature_c",
    ]);
  });

  it("inserts no soil reading when the payload has only WH52 keys", () => {
    const result = routeEcoWittPayloadToTents({
      payload: {
        soil_ec_hum1: "40",
        soil_ec1: "170",
        soil_ec_temp1: "66.02",
      },
      eligibleTents: [
        {
          tent_id: "78f51773-c576-4891-a9aa-240ed532337a",
          passkey_fingerprint: "ewfp_aaaaaaaaaaaaaaaaaaaaaaaa",
          air_channels: [],
          soil_channels: [1],
        },
      ],
      payloadPasskeyFingerprint: "ewfp_aaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(result.groups).toEqual([]);
    expect(result.dropped).toEqual([]);
  });
});
