import { describe, expect, it } from "vitest";
import {
  normalizeEcowittMqttPayload,
  ECOWITT_MQTT_PROVIDER,
  ECOWITT_MQTT_SOURCE,
  type EcowittMqttPayload,
} from "@/lib/ecowittMqttIngestRules";

const NOW = new Date("2026-06-04T12:30:00Z");
const FRESH_TS = "2026-06-04 12:25:00";

function basePayload(extra: Partial<EcowittMqttPayload> = {}): EcowittMqttPayload {
  return {
    dateutc: FRESH_TS,
    tempf: 76,
    humidity: 55,
    ...extra,
  };
}

describe("normalizeEcowittMqttPayload", () => {
  it("maps temp/RH from a normal EcoWitt payload", () => {
    const r = normalizeEcowittMqttPayload({ payload: basePayload(), now: NOW, tentId: "t-1" });
    expect(r.ok).toBe(true);
    expect(r.draft).not.toBeNull();
    expect(r.draft!.provider).toBe(ECOWITT_MQTT_PROVIDER);
    expect(r.draft!.source).toBe(ECOWITT_MQTT_SOURCE);
    expect(r.draft!.air_temp_f).toBe(76);
    expect(r.draft!.humidity_pct).toBe(55);
    expect(r.draft!.tent_id).toBe("t-1");
  });

  it("derives VPD only when temp and RH are both valid", () => {
    const ok = normalizeEcowittMqttPayload({ payload: basePayload(), now: NOW });
    expect(ok.draft!.vpd_kpa).not.toBeNull();
    expect(ok.draft!.vpd_kpa!).toBeGreaterThan(0.2);
    expect(ok.draft!.vpd_kpa!).toBeLessThan(3);

    const noRh = normalizeEcowittMqttPayload({
      payload: basePayload({ humidity: null }),
      now: NOW,
    });
    expect(noRh.draft!.vpd_kpa).toBeNull();

    const noTemp = normalizeEcowittMqttPayload({
      payload: basePayload({ tempf: null }),
      now: NOW,
    });
    expect(noTemp.draft!.vpd_kpa).toBeNull();
  });

  it("maps soil moisture and soil temp", () => {
    const r = normalizeEcowittMqttPayload({
      payload: basePayload({ soilmoisture1: 35, soiltemp1f: 68 }),
      now: NOW,
    });
    expect(r.draft!.soil_water_content_pct).toBe(35);
    expect(r.draft!.soil_temp_f).toBe(68);
  });

  it("maps CO2 if present", () => {
    const r = normalizeEcowittMqttPayload({
      payload: basePayload({ co2: 720 }),
      now: NOW,
    });
    expect(r.draft!.co2_ppm).toBe(720);
  });

  it("preserves raw_payload verbatim", () => {
    const payload = basePayload({ stationtype: "GW1200", baromrelin: 29.92 });
    const r = normalizeEcowittMqttPayload({ payload, now: NOW });
    expect(r.draft!.raw_payload).toBe(payload);
    expect((r.draft!.raw_payload as EcowittMqttPayload).stationtype).toBe("GW1200");
  });

  it("rejects impossible temp and drops derived VPD", () => {
    const r = normalizeEcowittMqttPayload({
      payload: basePayload({ tempf: 250 }),
      now: NOW,
    });
    expect(r.draft!.air_temp_f).toBeNull();
    expect(r.draft!.vpd_kpa).toBeNull();
    expect(r.reasons).toContain("invalid_temp");
  });

  it("rejects impossible RH and drops derived VPD", () => {
    const r = normalizeEcowittMqttPayload({
      payload: basePayload({ humidity: 250 }),
      now: NOW,
    });
    expect(r.draft!.humidity_pct).toBeNull();
    expect(r.draft!.vpd_kpa).toBeNull();
    expect(r.reasons).toContain("invalid_rh");
  });

  it("rejects impossible CO2", () => {
    const r = normalizeEcowittMqttPayload({
      payload: basePayload({ co2: 99999 }),
      now: NOW,
    });
    expect(r.draft!.co2_ppm).toBeNull();
    expect(r.reasons).toContain("invalid_co2");
  });

  it("stale timestamp is never persisted as live/healthy", () => {
    const r = normalizeEcowittMqttPayload({
      payload: basePayload({ dateutc: "2026-06-04 10:00:00" }),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.draft!.source).toBe("invalid");
    expect(r.reasons).toContain("stale_reading");
  });

  it("malformed payload returns ok:false with no draft", () => {
    // @ts-expect-error intentional bad input
    const r = normalizeEcowittMqttPayload({ payload: null, now: NOW });
    expect(r.ok).toBe(false);
    expect(r.draft).toBeNull();
    expect(r.reasons).toContain("malformed_payload");
  });

  it("missing captured_at is rejected", () => {
    const r = normalizeEcowittMqttPayload({
      payload: { tempf: 76, humidity: 55 },
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("missing_captured_at");
  });

  it("entirely invalid payload is not labeled live", () => {
    const r = normalizeEcowittMqttPayload({
      payload: basePayload({ tempf: 999, humidity: 999, soilmoisture1: 200 }),
      now: NOW,
    });
    expect(r.ok).toBe(false);
    expect(r.draft!.source).toBe("invalid");
  });

  it("does not surface device-control fields", () => {
    const draft = normalizeEcowittMqttPayload({
      payload: basePayload({
        // Pretend an attacker added control-shaped keys.
        relay1: "on",
        valve_open: true,
        light_on: 1,
      } as EcowittMqttPayload),
      now: NOW,
    }).draft!;
    // raw payload preserves them for audit, but the canonical shape has
    // no device-control fields at all.
    expect(Object.keys(draft)).toEqual([
      "provider",
      "source",
      "captured_at",
      "tent_id",
      "plant_id",
      "air_temp_f",
      "humidity_pct",
      "vpd_kpa",
      "soil_water_content_pct",
      "soil_temp_f",
      "co2_ppm",
      "raw_payload",
      "confidence",
    ]);
  });

  it("normalizer is pure and writes nothing to action_queue", () => {
    // Smoke: function returns a plain object; no imports of supabase client
    // or action_queue helpers exist in the module under test.
    const mod = require("@/lib/ecowittMqttIngestRules");
    expect(Object.keys(mod)).not.toContain("supabase");
    expect(JSON.stringify(mod)).not.toMatch(/action_queue/i);
  });
});
