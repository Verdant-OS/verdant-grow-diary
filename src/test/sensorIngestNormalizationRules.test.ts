import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  normalizeIngestPayload,
  isSensorSourcePersistable,
  type ExternalSensorIngestPayload,
} from "@/lib/sensorIngestNormalizationRules";
import { validateSensorReadingBatch } from "@/hooks/useInsertSensorReadings";

const TENT = "11111111-1111-1111-1111-111111111111";
const NOW = new Date("2026-05-23T12:00:00.000Z");

function base(over: Partial<ExternalSensorIngestPayload> = {}): ExternalSensorIngestPayload {
  return {
    tent_id: TENT,
    source: "pi_bridge",
    readings: [{ metric: "temperature_c", value: 22, unit: "temperature_c" }],
    ...over,
  };
}

describe("normalizeIngestPayload — unit conversion", () => {
  it("converts temperature_f → temperature_c", () => {
    const r = normalizeIngestPayload(
      base({
        readings: [{ metric: "temperature_c", value: 68, unit: "temperature_f" }],
      }),
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(r.rows[0].value).toBeCloseTo(20, 5);
  });
  it("leaves temperature_c unchanged", () => {
    const r = normalizeIngestPayload(base(), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.rows[0].value).toBe(22);
  });
  it("accepts humidity_pct with percent unit", () => {
    const r = normalizeIngestPayload(
      base({ readings: [{ metric: "humidity_pct", value: 55, unit: "percent" }] }),
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(r.rows[0]).toMatchObject({ metric: "humidity_pct", value: 55 });
  });
  it("accepts vpd_kpa with kPa unit", () => {
    const r = normalizeIngestPayload(
      base({ readings: [{ metric: "vpd_kpa", value: 1.1, unit: "kPa" }] }),
      { now: NOW },
    );
    expect(r.ok).toBe(true);
  });
  it("accepts co2_ppm with ppm unit", () => {
    const r = normalizeIngestPayload(
      base({ readings: [{ metric: "co2_ppm", value: 800, unit: "ppm" }] }),
      { now: NOW },
    );
    expect(r.ok).toBe(true);
  });
  it("accepts soil_moisture_pct with percent unit", () => {
    const r = normalizeIngestPayload(
      base({
        readings: [{ metric: "soil_moisture_pct", value: 40, unit: "percent" }],
      }),
      { now: NOW },
    );
    expect(r.ok).toBe(true);
  });
  it("accepts ph with ph unit", () => {
    const r = normalizeIngestPayload(
      base({ readings: [{ metric: "ph", value: 6.2, unit: "ph" }] }),
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(r.rows[0]).toMatchObject({ metric: "ph", value: 6.2 });
  });
  it("accepts ec with mS/cm unit", () => {
    const r = normalizeIngestPayload(
      base({ readings: [{ metric: "ec", value: 1.8, unit: "mS/cm" }] }),
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(r.rows[0]).toMatchObject({ metric: "ec", value: 1.8 });
  });
  it("accepts ppfd with umol unit", () => {
    const r = normalizeIngestPayload(
      base({ readings: [{ metric: "ppfd", value: 600, unit: "umol" }] }),
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(r.rows[0]).toMatchObject({ metric: "ppfd", value: 600 });
  });
});

describe("normalizeIngestPayload — rejections", () => {
  it("rejects unknown metric", () => {
    const r = normalizeIngestPayload(
      base({ readings: [{ metric: "lux", value: 600, unit: "lux" }] }),
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/invalid metric/);
  });
  it("rejects unknown unit", () => {
    const r = normalizeIngestPayload(
      base({
        readings: [{ metric: "temperature_c", value: 295, unit: "kelvin" }],
      }),
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/unknown unit/);
  });
  it("rejects unknown source", () => {
    const r = normalizeIngestPayload(base({ source: "mqtt" }), { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/invalid source/);
  });
  it("rejects non-finite value", () => {
    const r = normalizeIngestPayload(
      base({
        readings: [{ metric: "temperature_c", value: "NaN", unit: "temperature_c" }],
      }),
      { now: NOW },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/non-finite/);
  });
  it("rejects missing tent_id", () => {
    const r = normalizeIngestPayload(base({ tent_id: "" }), { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/tent_id/);
  });
  it("rejects captured_at more than 5 minutes in the future", () => {
    const future = new Date(NOW.getTime() + 6 * 60 * 1000).toISOString();
    const r = normalizeIngestPayload(base({ captured_at: future }), { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/future/);
  });
  it("does not silently clamp captured_at", () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    const r = normalizeIngestPayload(base({ captured_at: future }), { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.rows).toEqual([]);
  });
});

describe("normalizeIngestPayload — passthrough + safety", () => {
  it("preserves raw payload verbatim into raw_payload", () => {
    const raw = { foo: "bar", nested: { x: 1 } };
    const r = normalizeIngestPayload(base({ raw_payload: raw }), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.rows[0].raw_payload).toEqual(raw);
  });
  it("does not include user_id", () => {
    const r = normalizeIngestPayload(base(), { now: NOW });
    expect(r.ok).toBe(true);
    expect("user_id" in r.rows[0]).toBe(false);
  });
  it("output passes validateSensorReadingBatch", () => {
    const r = normalizeIngestPayload(
      base({
        readings: [
          { metric: "temperature_c", value: 68, unit: "temperature_f" },
          { metric: "humidity_pct", value: 50, unit: "percent" },
        ],
      }),
      { now: NOW },
    );
    expect(r.ok).toBe(true);
    expect(() => validateSensorReadingBatch(r.rows)).not.toThrow();
  });
});

describe("isSensorSourcePersistable", () => {
  it("manual → true", () => expect(isSensorSourcePersistable("manual")).toBe(true));
  it("pi_bridge → true", () => expect(isSensorSourcePersistable("pi_bridge")).toBe(true));
  it("webhook_generic → true", () =>
    expect(isSensorSourcePersistable("webhook_generic")).toBe(true));
  it("esp32_mqtt_bridge → true", () =>
    expect(isSensorSourcePersistable("esp32_mqtt_bridge")).toBe(true));
  it("home_assistant_bridge → true", () =>
    expect(isSensorSourcePersistable("home_assistant_bridge")).toBe(true));
  it("ha_forwarded → true", () => expect(isSensorSourcePersistable("ha_forwarded")).toBe(true));
  it("sim → false", () => expect(isSensorSourcePersistable("sim")).toBe(false));
});

describe("static safety: pure helper", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/lib/sensorIngestNormalizationRules.ts"),
    "utf8",
  );
  const forbidden = [
    "@/integrations/supabase/client",
    'from "react"',
    "from 'react'",
    "useState",
    "useEffect",
    ".insert(",
    ".from(",
    ".rpc(",
    "service_role",
    "action_queue",
    "alerts",
    "automation",
    "device_control",
    "homeassistant",
  ];
  for (const term of forbidden) {
    it(`does not reference \`${term}\``, () => {
      expect(src).not.toContain(term);
    });
  }
});
