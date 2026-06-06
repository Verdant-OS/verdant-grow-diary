import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeSpiderFarmerGgsPayload,
  SPIDER_FARMER_GGS_PROVIDER,
} from "@/lib/spiderFarmerGgsMappingRules";

const NOW = new Date("2026-06-06T12:00:00.000Z");
const FRESH = "2026-06-06T11:59:00.000Z";
const OLD = "2026-06-06T11:00:00.000Z";

describe("normalizeSpiderFarmerGgsPayload — happy paths", () => {
  it("maps valid temp/RH/VPD payload as live", () => {
    const r = normalizeSpiderFarmerGgsPayload(
      {
        captured_at: FRESH,
        temp_f: 78,
        humidity: 55,
        vpd_kpa: 1.1,
        transport: "mqtt",
        tent_id: "tent-1",
      },
      { now: NOW },
    );
    expect(r.provider).toBe(SPIDER_FARMER_GGS_PROVIDER);
    expect(r.source).toBe("live");
    expect(r.transport).toBe("mqtt");
    expect(r.tent_id).toBe("tent-1");
    expect(r.readings).toMatchObject({ temp_f: 78, humidity: 55, vpd_kpa: 1.1 });
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it("maps PPFD and soil values", () => {
    const r = normalizeSpiderFarmerGgsPayload(
      {
        captured_at: FRESH,
        ppfd: 600,
        soil_water_content: 42,
        soil_ec: 1.8,
        soil_temp_f: 70,
      },
      { now: NOW },
    );
    expect(r.readings.ppfd).toBe(600);
    expect(r.readings.soil_water_content).toBe(42);
    expect(r.readings.soil_ec).toBe(1.8);
    expect(r.readings.soil_temp_f).toBe(70);
  });

  it("converts Celsius only when unit is explicit", () => {
    const explicit = normalizeSpiderFarmerGgsPayload(
      { captured_at: FRESH, temp_c: 25, unit: "C" },
      { now: NOW },
    );
    expect(explicit.readings.temp_c).toBe(25);
    expect(explicit.readings.temp_f).toBeCloseTo(77, 1);

    const ambiguous = normalizeSpiderFarmerGgsPayload(
      { captured_at: FRESH, temp_c: 25 },
      { now: NOW },
    );
    expect(ambiguous.readings.temp_c).toBe(25);
    expect(ambiguous.readings.temp_f).toBeUndefined();
  });

  it("preserves raw payload verbatim", () => {
    const raw = { captured_at: FRESH, temp_f: 75, humidity: 50, extra: { foo: "bar" } };
    const r = normalizeSpiderFarmerGgsPayload(raw, { now: NOW });
    expect(r.raw_payload).toBe(raw);
  });

  it("treats fan/light state as context only — never commands", () => {
    const r = normalizeSpiderFarmerGgsPayload(
      { captured_at: FRESH, temp_f: 75, humidity: 50, fan_state: "on", light_state: "off" },
      { now: NOW },
    );
    expect(r.context).toEqual({ fan_state: "on", light_state: "off" });
    const keys = Object.keys(r);
    for (const k of keys) {
      expect(k).not.toMatch(/command|control|set_|setpoint|write/i);
    }
  });

  it("is deterministic for the same input + now", () => {
    const payload = { captured_at: FRESH, temp_f: 78, humidity: 55 };
    const a = normalizeSpiderFarmerGgsPayload(payload, { now: NOW });
    const b = normalizeSpiderFarmerGgsPayload(payload, { now: NOW });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("normalizeSpiderFarmerGgsPayload — safety / invalid", () => {
  it("rejects impossible humidity", () => {
    const high = normalizeSpiderFarmerGgsPayload(
      { captured_at: FRESH, humidity: 150 },
      { now: NOW },
    );
    expect(high.readings.humidity).toBeUndefined();
    expect(high.warnings).toContain("humidity_out_of_range");

    const neg = normalizeSpiderFarmerGgsPayload(
      { captured_at: FRESH, humidity: -5 },
      { now: NOW },
    );
    expect(neg.warnings).toContain("humidity_out_of_range");
  });

  it("flags negative PPFD and CO2", () => {
    const r = normalizeSpiderFarmerGgsPayload(
      { captured_at: FRESH, ppfd: -10, co2_ppm: -1 },
      { now: NOW },
    );
    expect(r.warnings).toEqual(expect.arrayContaining(["ppfd_negative", "co2_negative"]));
    expect(r.readings.ppfd).toBeUndefined();
    expect(r.readings.co2_ppm).toBeUndefined();
  });

  it("flags pH outside realistic range", () => {
    const r = normalizeSpiderFarmerGgsPayload(
      { captured_at: FRESH, ph: 1.5, temp_f: 75 },
      { now: NOW },
    );
    expect(r.warnings).toContain("ph_out_of_realistic_range");
    expect(r.readings.ph).toBeUndefined();
  });

  it("marks an old reading stale", () => {
    const r = normalizeSpiderFarmerGgsPayload(
      { captured_at: OLD, temp_f: 75, humidity: 50 },
      { now: NOW },
    );
    expect(r.source).toBe("stale");
    expect(r.warnings).toContain("reading_stale");
  });

  it("unknown / unmappable payload never becomes live", () => {
    const r = normalizeSpiderFarmerGgsPayload(
      { captured_at: FRESH, mystery: "value" },
      { now: NOW },
    );
    expect(r.source).toBe("invalid");
    expect(r.warnings).toContain("no_readings_mapped");
  });

  it("non-object payload is invalid with zero confidence", () => {
    const r = normalizeSpiderFarmerGgsPayload("nope" as unknown, { now: NOW });
    expect(r.source).toBe("invalid");
    expect(r.confidence).toBe(0);
    expect(r.warnings).toContain("payload_not_object");
  });

  it("missing captured_at degrades to stale, never live", () => {
    const r = normalizeSpiderFarmerGgsPayload(
      { temp_f: 75, humidity: 50 },
      { now: NOW },
    );
    expect(r.source).toBe("stale");
    expect(r.warnings).toContain("captured_at_missing");
  });
});

describe("static safety scan", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/spiderFarmerGgsMappingRules.ts"),
    "utf8",
  );
  const forbidden = [
    "@/integrations/supabase/client",
    'from "react"',
    "from 'react'",
    ".insert(",
    ".from(",
    ".rpc(",
    "service_role",
    "action_queue",
    "mqtt.connect",
    "publish(",
    "fetch(",
    "axios",
  ];
  for (const term of forbidden) {
    it(`does not reference \`${term}\``, () => {
      expect(src).not.toContain(term);
    });
  }
  it("does not export any command/control symbols", () => {
    expect(src).not.toMatch(/export\s+(function|const)\s+\w*(command|control|setpoint|write)/i);
  });
});
