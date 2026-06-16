import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeSensorReading } from "@/lib/sensors/normalizeSensorReading";

const TENT = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-06-15T12:00:00Z");
const FRESH = "2026-06-15T11:50:00Z"; // 10 min ago
const OLD = "2026-06-15T08:00:00Z"; // 4h ago

describe("normalizeSensorReading", () => {
  it("manual reading: normalizes temp/RH and calculates VPD", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      {
        source: "manual",
        sourceIdentity: "manual_entry",
        transport: "manual",
        tentId: TENT,
        capturedAt: FRESH,
        now: NOW,
      },
    );
    expect(r.source).toBe("manual");
    expect(r.metrics.temperature_c).toBe(24);
    expect(r.metrics.temperature_f).toBeCloseTo(75.2, 1);
    expect(r.metrics.humidity_pct).toBe(50);
    expect(r.metrics.vpd_kpa).not.toBeNull();
    expect(r.warnings).not.toContain("stale_reading");
  });

  it("CSV reading preserves csv truth and csv_import identity", () => {
    const r = normalizeSensorReading(
      { temp_f: 75, rh: 55 },
      {
        source: "csv",
        sourceIdentity: "csv_import",
        transport: "csv",
        tentId: TENT,
        capturedAt: FRESH,
        now: NOW,
      },
    );
    expect(r.source).toBe("csv");
    expect(r.source_identity).toBe("csv_import");
    expect(r.transport).toBe("csv");
    expect(r.metrics.temperature_c).not.toBeNull();
  });

  it("EcoWitt webhook reading is live + ecowitt + webhook", () => {
    const r = normalizeSensorReading(
      { tempf: 76, humidity: 52 },
      {
        source: "live",
        sourceIdentity: "ecowitt",
        transport: "webhook",
        tentId: TENT,
        capturedAt: FRESH,
        now: NOW,
      },
    );
    expect(r.source).toBe("live");
    expect(r.source_identity).toBe("ecowitt");
    expect(r.transport).toBe("webhook");
  });

  it("Pi bridge reading uses live + raspberry_pi + local_bridge", () => {
    const r = normalizeSensorReading(
      { temperature_c: 23, humidity: 60 },
      {
        source: "live",
        sourceIdentity: "raspberry_pi",
        transport: "local_bridge",
        tentId: TENT,
        capturedAt: FRESH,
        now: NOW,
      },
    );
    expect(r.source).toBe("live");
    expect(r.source_identity).toBe("raspberry_pi");
    expect(r.transport).toBe("local_bridge");
  });

  it("demo reading stays demo with confidence ≤ 50", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      {
        source: "demo",
        sourceIdentity: "unknown",
        transport: "unknown",
        tentId: TENT,
        capturedAt: FRESH,
        now: NOW,
      },
    );
    expect(r.source).toBe("demo");
    expect(r.confidence).toBeLessThanOrEqual(50);
  });

  it("stale reading becomes source: stale (unless invalid/demo)", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      {
        source: "live",
        sourceIdentity: "ecowitt",
        transport: "webhook",
        tentId: TENT,
        capturedAt: OLD,
        now: NOW,
      },
    );
    expect(r.is_stale).toBe(true);
    expect(r.source).toBe("stale");
    expect(r.warnings).toContain("stale_reading");
  });

  it("invalid wins over stale", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24 },
      {
        source: "invalid",
        tentId: TENT,
        capturedAt: OLD,
        now: NOW,
      },
    );
    expect(r.source).toBe("invalid");
  });

  it("demo stays demo even when stale", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      {
        source: "demo",
        tentId: TENT,
        capturedAt: OLD,
        now: NOW,
      },
    );
    expect(r.source).toBe("demo");
    expect(r.warnings).toContain("stale_reading");
  });

  it("missing tent_id adds warning", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      { source: "manual", capturedAt: FRESH, now: NOW },
    );
    expect(r.warnings).toContain("missing_tent_id");
    expect(r.tent_id).toBeNull();
  });

  it("missing captured_at adds warning", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      { source: "manual", tentId: TENT, now: NOW },
    );
    expect(r.warnings).toContain("missing_captured_at");
    expect(r.captured_at).toBeNull();
  });

  it("no usable metrics → source becomes invalid", () => {
    const r = normalizeSensorReading(
      {},
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(r.source).toBe("invalid");
    expect(r.warnings).toContain("no_usable_metrics");
  });

  it("humidity 0 or 100 creates stuck-value warning", () => {
    for (const h of [0, 100]) {
      const r = normalizeSensorReading(
        { temperature_c: 24, humidity: h },
        { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
      );
      expect(r.warnings).toContain("humidity_stuck_value");
    }
  });

  it("soil moisture 0 or 100 creates stuck-value warning", () => {
    for (const v of [0, 100]) {
      const r = normalizeSensorReading(
        { soil_moisture: v },
        { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
      );
      expect(r.warnings).toContain("soil_moisture_stuck_value");
    }
  });

  it("µS/cm EC converts to mS/cm when field name says so", () => {
    const r = normalizeSensorReading(
      { soil_ec_us_cm: 1450 },
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(r.metrics.soil_ec_ms_cm).toBeCloseTo(1.45, 2);
    expect(r.warnings).not.toContain("soil_ec_likely_us_cm");
  });

  it("EC like 1450 in an mS/cm field creates warning", () => {
    const r = normalizeSensorReading(
      { soil_ec_ms_cm: 1450 },
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(r.warnings).toContain("soil_ec_likely_us_cm");
  });

  it("pH outside realistic range creates warning", () => {
    const r1 = normalizeSensorReading(
      { ph: 1.5 },
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(r1.warnings).toContain("ph_out_of_realistic_range");
    const r2 = normalizeSensorReading(
      { ph: 99 },
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(r2.warnings).toContain("ph_out_of_range");
  });

  it("preserves raw payload, source identity, and transport", () => {
    const raw = { temperature_c: 24, humidity: 50, extra: "anything" };
    const r = normalizeSensorReading(raw, {
      source: "live",
      sourceIdentity: "sensorpush",
      transport: "mqtt",
      tentId: TENT,
      capturedAt: FRESH,
      now: NOW,
    });
    expect(r.raw_payload).toBe(raw);
    expect(r.source_identity).toBe("sensorpush");
    expect(r.transport).toBe("mqtt");
  });

  it("unknown input shape adds warning", () => {
    const r = normalizeSensorReading(42, {
      source: "live",
      tentId: TENT,
      capturedAt: FRESH,
      now: NOW,
    });
    expect(r.warnings).toContain("unknown_input_shape");
  });

  it("null input does not throw and yields invalid", () => {
    const r = normalizeSensorReading(null, {
      source: "live",
      tentId: TENT,
      capturedAt: FRESH,
      now: NOW,
    });
    expect(r.source).toBe("invalid");
    expect(r.warnings).toContain("unknown_input_shape");
    expect(r.warnings).toContain("no_usable_metrics");
  });

  it("parses numeric string values safely", () => {
    const r = normalizeSensorReading(
      { temperature_c: "24.5", humidity: " 55 " },
      { source: "manual", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(r.metrics.temperature_c).toBe(24.5);
    expect(r.metrics.humidity_pct).toBe(55);
  });

  it("rejects bad string values without producing metrics", () => {
    const r = normalizeSensorReading(
      { temperature_c: "hello", humidity: "n/a" },
      { source: "manual", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(r.metrics.temperature_c).toBeNull();
    expect(r.metrics.humidity_pct).toBeNull();
    expect(r.source).toBe("invalid");
  });

  it("ec_ms_cm alias is honored and large values warn as µS/cm", () => {
    const ok = normalizeSensorReading(
      { ec_ms_cm: 1.4 },
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(ok.metrics.reservoir_ec_ms_cm).toBe(1.4);
    const warn = normalizeSensorReading(
      { ec_ms_cm: 1450 },
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(warn.warnings).toContain("reservoir_ec_likely_us_cm");
  });

  it("demo identity uses demo_fixture cleanly", () => {
    const r = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      {
        source: "demo",
        sourceIdentity: "demo_fixture",
        transport: "unknown",
        tentId: TENT,
        capturedAt: FRESH,
        now: NOW,
      },
    );
    expect(r.source).toBe("demo");
    expect(r.source_identity).toBe("demo_fixture");
    expect(r.confidence).toBeLessThanOrEqual(50);
  });

  it("is deterministic with injected now", () => {
    const a = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    const b = normalizeSensorReading(
      { temperature_c: 24, humidity: 50 },
      { source: "live", tentId: TENT, capturedAt: FRESH, now: NOW },
    );
    expect(a).toEqual(b);
  });

  it("does not import Supabase, Action Queue, automation, or device-control code", () => {
    const source = readFileSync(
      resolve(__dirname, "../lib/sensors/normalizeSensorReading.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(source).not.toMatch(/insertSensorReading/);
    expect(source).not.toMatch(/\.insert\(/);
    expect(source).not.toMatch(/\.upsert\(/);
    expect(source).not.toMatch(/\.update\(/);
    expect(source).not.toMatch(/\.delete\(/);
    expect(source).not.toMatch(/\.upload\(/);
    expect(source).not.toMatch(/supabase\.from\(["']sensor_readings["']\)/);
    expect(source).not.toMatch(/functions\.invoke/);
    expect(source).not.toMatch(/action_queue/);
    expect(source).not.toMatch(/alerts/);
    expect(source).not.toMatch(/device[_-]?control/i);
    expect(source).not.toMatch(/automation/i);
    expect(source).not.toMatch(/service_role/);
    expect(source).not.toMatch(/bridge[_\s-]?token/i);
  });
});
