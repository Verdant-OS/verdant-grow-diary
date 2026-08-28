/**
 * EcoWitt custom-HTTP bridge ingest-readiness — extra-channel + constitution tags.
 */
import { describe, expect, it } from "vitest";
import {
  applyEcowittCustomHttpStuckInvalid,
  ECOWITT_CUSTOM_HTTP_CONSTITUTION_SOURCES,
  ECOWITT_CUSTOM_HTTP_FIELD_MAP,
  ECOWITT_CUSTOM_HTTP_FORBIDDEN_SOURCE_TOKENS,
  ECOWITT_CUSTOM_HTTP_LIVE_FRESHNESS_MS,
  isEcowittCustomHttpConstitutionSource,
  isEcowittCustomHttpForbiddenSourceToken,
  listEcowittCustomHttpExtraChannelKeysAccepted,
  listEcowittCustomHttpRawPayloadOnlyKeys,
  normalizeEcowittCustomHttpMetrics,
  redactEcowittCustomHttpRawPayload,
  resolveEcowittCustomHttpConstitutionSource,
} from "@/lib/ecowittCustomHttpBridgeIngestRules";

const MULTI_CHANNEL_DEMO = {
  tempinf: "72.0",
  humidityin: "48",
  temp1f: "77.4",
  humidity1: "58",
  soilmoisture1: "33",
  co2: "721",
  temp2f: "74.0",
  humidity2: "55",
  soilmoisture3: "40",
  leafwetness1: "12",
  tf_ch1: "70.1",
  PASSKEY: "should-never-store",
  dateutc: "2026-06-17 05:40:30",
} as const;

describe("ecowittCustomHttpBridgeIngestRules — FIELD_MAP", () => {
  it("keeps existing FIELD_MAP names then accepts extra channels", () => {
    expect(ECOWITT_CUSTOM_HTTP_FIELD_MAP.temp_f).toEqual(
      expect.arrayContaining(["temp1f", "tempf", "tempinf", "temp2f", "temp8f"]),
    );
    expect(ECOWITT_CUSTOM_HTTP_FIELD_MAP.humidity_percent).toEqual(
      expect.arrayContaining(["humidity1", "humidityin", "humidity2", "humidity8"]),
    );
    expect(ECOWITT_CUSTOM_HTTP_FIELD_MAP.soil_moisture_pct).toEqual(
      expect.arrayContaining(["soilmoisture1", "soilmoisture2", "soilmoisture3", "soilmoisture16"]),
    );
    expect(ECOWITT_CUSTOM_HTTP_FIELD_MAP.co2_ppm).toEqual(
      expect.arrayContaining(["co2", "co2in", "co2_ppm"]),
    );
  });

  it("normalizes multi-channel demo payload (indoor + ch1 + soil1 + co2)", () => {
    const metrics = normalizeEcowittCustomHttpMetrics(MULTI_CHANNEL_DEMO);
    expect(metrics.temp_f).toBeCloseTo(77.4);
    expect(metrics.humidity_percent).toBe(58);
    expect(metrics.soil_moisture_pct).toBe(33);
    expect(metrics.co2_ppm).toBe(721);
  });

  it("accepts extra channels onto canonical names when primary absent", () => {
    const metrics = normalizeEcowittCustomHttpMetrics({
      temp2f: "70",
      humidity2: "50",
      soilmoisture3: "41",
      co2in: "800",
    });
    expect(metrics.temp_f).toBe(70);
    expect(metrics.humidity_percent).toBe(50);
    expect(metrics.soil_moisture_pct).toBe(41);
    expect(metrics.co2_ppm).toBe(800);
  });

  it("maps hub indoor tempinf/humidityin when canopy channels absent", () => {
    const metrics = normalizeEcowittCustomHttpMetrics({
      tempinf: 72,
      humidityin: 48,
    });
    expect(metrics.temp_f).toBe(72);
    expect(metrics.humidity_percent).toBe(48);
  });

  it("keeps leafwetness/tf_ch/WH52 EC in raw_payload only and redacts PASSKEY", () => {
    const withEc = {
      ...MULTI_CHANNEL_DEMO,
      soilad1: "1234",
      ec1: "0.8",
      unknown_probe: "keep-me",
    };
    expect(listEcowittCustomHttpRawPayloadOnlyKeys(withEc)).toEqual([
      "ec1",
      "leafwetness1",
      "soilad1",
      "tf_ch1",
    ]);
    expect(listEcowittCustomHttpExtraChannelKeysAccepted(MULTI_CHANNEL_DEMO).sort()).toEqual(
      ["humidity2", "soilmoisture3", "temp2f"].sort(),
    );
    const redacted = redactEcowittCustomHttpRawPayload(withEc);
    expect(redacted).not.toHaveProperty("PASSKEY");
    expect(redacted?.leafwetness1).toBe("12");
    expect(redacted?.tf_ch1).toBe("70.1");
    expect(redacted?.temp2f).toBe("74.0");
    expect(redacted?.dateutc).toBe("2026-06-17 05:40:30");
    expect(redacted?.soilad1).toBe("1234");
    expect(redacted?.ec1).toBe("0.8");
    expect(redacted?.unknown_probe).toBe("keep-me");
    const mapped = Object.values(ECOWITT_CUSTOM_HTTP_FIELD_MAP).flat();
    expect(mapped).not.toContain("leafwetness1");
    expect(mapped).not.toContain("tf_ch1");
    expect(mapped).not.toContain("soilad1");
    expect(mapped).not.toContain("ec1");
  });

  it("missing/unparseable → null", () => {
    const metrics = normalizeEcowittCustomHttpMetrics({
      temp1f: "NaN",
      humidity1: "abc",
      soilmoisture1: "",
    });
    expect(metrics.temp_f).toBeNull();
    expect(metrics.humidity_percent).toBeNull();
    expect(metrics.soil_moisture_pct).toBeNull();
  });
});

describe("ecowittCustomHttpBridgeIngestRules — constitution Sensor Truth", () => {
  it("allows only constitution tags", () => {
    expect([...ECOWITT_CUSTOM_HTTP_CONSTITUTION_SOURCES]).toEqual([
      "live",
      "manual",
      "csv",
      "demo",
      "stale",
      "invalid",
    ]);
    for (const tag of ECOWITT_CUSTOM_HTTP_CONSTITUTION_SOURCES) {
      expect(isEcowittCustomHttpConstitutionSource(tag)).toBe(true);
    }
  });

  it("never promotes vendor/transport/sim tokens", () => {
    for (const token of ECOWITT_CUSTOM_HTTP_FORBIDDEN_SOURCE_TOKENS) {
      expect(isEcowittCustomHttpForbiddenSourceToken(token)).toBe(true);
      expect(isEcowittCustomHttpConstitutionSource(token)).toBe(false);
    }
  });

  it("uses a 15-minute live freshness window", () => {
    expect(ECOWITT_CUSTOM_HTTP_LIVE_FRESHNESS_MS).toBe(15 * 60 * 1000);
  });

  it("marks stuck humidity/soil as invalid", () => {
    const metrics = normalizeEcowittCustomHttpMetrics({
      temp1f: 77,
      humidity1: 0,
      soilmoisture1: 33,
    });
    expect(applyEcowittCustomHttpStuckInvalid("demo", metrics)).toBe("invalid");
    expect(
      applyEcowittCustomHttpStuckInvalid("live", {
        temp_f: 77,
        humidity_percent: 55,
        soil_moisture_pct: 100,
        co2_ppm: null,
      }),
    ).toBe("invalid");
    expect(
      applyEcowittCustomHttpStuckInvalid("demo", {
        temp_f: 77,
        humidity_percent: 55,
        soil_moisture_pct: 33,
        co2_ppm: 700,
      }),
    ).toBe("demo");
  });

  it("normalizes multi-channel demo GET/loopback as demo", () => {
    expect(
      resolveEcowittCustomHttpConstitutionSource({
        payload: MULTI_CHANNEL_DEMO,
        remoteAddr: "127.0.0.1",
        now: new Date("2026-06-17T05:45:30Z"),
      }),
    ).toBe("demo");
  });

  it("tags a real LAN packet with live opt-in and dateutc ≤15 min as live", () => {
    expect(
      resolveEcowittCustomHttpConstitutionSource({
        payload: {
          stationtype: "GW1200B_V1.4.7",
          model: "GW1200B",
          dateutc: "2026-06-17 05:31:00",
          temp1f: "77.4",
          humidity1: "58",
        },
        remoteAddr: "192.168.68.75",
        headerMode: "live",
        now: new Date("2026-06-17T05:45:30Z"),
      }),
    ).toBe("live");
  });

  it("tags dateutc >15 min as stale", () => {
    expect(
      resolveEcowittCustomHttpConstitutionSource({
        payload: {
          stationtype: "GW1200B_V1.4.7",
          model: "GW1200B",
          dateutc: "2026-06-17 05:30:29",
          temp1f: "77.4",
          humidity1: "58",
        },
        remoteAddr: "192.168.68.75",
        now: new Date("2026-06-17T05:45:30Z"),
      }),
    ).toBe("stale");
  });

  it("does not promote vendor/unknown to live via freshness", () => {
    expect(
      resolveEcowittCustomHttpConstitutionSource({
        payload: {
          ...MULTI_CHANNEL_DEMO,
          source: "ecowitt",
          stationtype: "GW1200B_V1.4.7",
          model: "GW1200B",
        },
        remoteAddr: "192.168.68.75",
        now: new Date("2026-06-17T05:45:30Z"),
      }),
    ).toBe("invalid");
  });
});
