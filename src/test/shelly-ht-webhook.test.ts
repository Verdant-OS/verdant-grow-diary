/**
 * Shelly H&T Gen4 webhook ingest — pure normalization + static safety.
 *
 * Edge function behavior (token gate, service-role insert) is exercised
 * by mirrored logic inside the function file; tests here pin the pure
 * helpers + safety surface so a refactor cannot quietly break either.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  normalizeShellyHtPayload,
  formatSensorDeviceDetail,
  SHELLY_HT_DEVICE_LABEL,
  SHELLY_HT_DEVICE_ID_PREFIX,
} from "@/lib/shellyHtWebhookRules";
import { buildRecentSensorSnapshotHistory } from "@/lib/recentSensorSnapshotHistoryRules";
import { SOURCE_LABEL, snapshotFromReadings } from "@/lib/sensorSnapshot";

const NOW = new Date("2026-05-25T12:00:00.000Z");

describe("normalizeShellyHtPayload", () => {
  it("accepts bare `temperature` as Fahrenheit (v1 default)", () => {
    const r = normalizeShellyHtPayload({ temperature: 75.2, humidity: 58 }, { now: NOW });
    expect(r.ok).toBe(true);
    const t = r.rows.find((x) => x.metric === "temperature_c")!;
    expect(t.value).toBeCloseTo(24.0, 1);
    expect(r.rows.find((x) => x.metric === "humidity_pct")!.value).toBe(58);
    expect(r.rows.find((x) => x.metric === "vpd_kpa")!.derived).toBe(true);
  });

  it("accepts explicit temperature_f", () => {
    const r = normalizeShellyHtPayload({ temperature_f: 77, humidity: 50 }, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.rows.find((x) => x.metric === "temperature_c")!.value).toBeCloseTo(25, 1);
  });

  it("accepts explicit temperature_c", () => {
    const r = normalizeShellyHtPayload({ temperature_c: 24, humidity: 58 }, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.rows.find((x) => x.metric === "temperature_c")!.value).toBe(24);
  });

  it("rejects humidity > 100", () => {
    const r = normalizeShellyHtPayload({ temperature_c: 24, humidity: 120 }, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.rows).toEqual([]);
    expect(r.errors.some((e) => e.includes("humidity"))).toBe(true);
  });

  it("rejects humidity < 0", () => {
    const r = normalizeShellyHtPayload({ temperature_c: 24, humidity: -1 }, { now: NOW });
    expect(r.ok).toBe(false);
  });

  it("rejects missing temperature", () => {
    const r = normalizeShellyHtPayload({ humidity: 50 }, { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.rows).toEqual([]);
  });

  it("rejects unrealistic temperature (200°C)", () => {
    const r = normalizeShellyHtPayload({ temperature_c: 200, humidity: 50 }, { now: NOW });
    expect(r.ok).toBe(false);
  });

  it("computes VPD deterministically", () => {
    const a = normalizeShellyHtPayload({ temperature_c: 24, humidity: 58 }, { now: NOW });
    const b = normalizeShellyHtPayload({ temperature_c: 24, humidity: 58 }, { now: NOW });
    expect(a.rows.find((x) => x.metric === "vpd_kpa")!.value).toBe(
      b.rows.find((x) => x.metric === "vpd_kpa")!.value,
    );
  });

  it("namespaces device_id under the shelly prefix", () => {
    const r = normalizeShellyHtPayload(
      { temperature_c: 24, humidity: 58, device_id: "kitchen-1" },
      { now: NOW },
    );
    expect(r.deviceId.startsWith(SHELLY_HT_DEVICE_ID_PREFIX)).toBe(true);
    expect(r.deviceId).toContain("kitchen-1");
  });

  it("falls back to the bare prefix when device_id missing", () => {
    const r = normalizeShellyHtPayload({ temperature_c: 24, humidity: 58 }, { now: NOW });
    expect(r.deviceId).toBe(SHELLY_HT_DEVICE_ID_PREFIX);
  });

  it("ignores future-skewed captured_at beyond the 5-minute window", () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000).toISOString();
    const r = normalizeShellyHtPayload(
      { temperature_c: 24, humidity: 58, captured_at: future },
      { now: NOW },
    );
    expect(r.capturedAt).toBe(NOW.toISOString());
  });

  it("returns ok=false for null payload", () => {
    const r = normalizeShellyHtPayload(null, { now: NOW });
    expect(r.ok).toBe(false);
  });
});

describe("formatSensorDeviceDetail", () => {
  it("returns Shelly H&T Gen4 for prefixed device ids", () => {
    expect(formatSensorDeviceDetail("shelly-ht-gen4")).toBe(SHELLY_HT_DEVICE_LABEL);
    expect(formatSensorDeviceDetail("shelly-ht-gen4:kitchen-1")).toBe(SHELLY_HT_DEVICE_LABEL);
  });
  it("returns null for unknown / empty device ids", () => {
    expect(formatSensorDeviceDetail(null)).toBeNull();
    expect(formatSensorDeviceDetail("")).toBeNull();
    expect(formatSensorDeviceDetail("acme-sensor-9000")).toBeNull();
  });
});

describe("source labeling in Sensor Context / Recent Sensor Readings", () => {
  const shellyRows = [
    {
      ts: "2026-05-25T11:00:00.000Z",
      metric: "temperature_c",
      value: 24,
      source: "pi_bridge",
      device_id: "shelly-ht-gen4:kitchen-1",
    },
    {
      ts: "2026-05-25T11:00:00.000Z",
      metric: "humidity_pct",
      value: 58,
      source: "pi_bridge",
      device_id: "shelly-ht-gen4:kitchen-1",
    },
    {
      ts: "2026-05-25T11:00:00.000Z",
      metric: "vpd_kpa",
      value: 1.07,
      source: "pi_bridge",
      device_id: "shelly-ht-gen4:kitchen-1",
    },
  ];

  it("classifies pi_bridge Shelly snapshot as live (Live sensor)", () => {
    const snap = snapshotFromReadings(shellyRows)!;
    expect(snap.source).toBe("live");
    expect(SOURCE_LABEL[snap.source]).toBe("Live sensor");
  });

  it("surfaces Shelly device detail in Recent Sensor Readings", () => {
    const out = buildRecentSensorSnapshotHistory(shellyRows, {
      now: new Date("2026-05-25T11:05:00.000Z").getTime(),
    });
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("live");
    expect(out[0].deviceDetail).toBe(SHELLY_HT_DEVICE_LABEL);
  });

  it("manual rows still surface as Manual (never Live)", () => {
    const manualRows = [
      {
        ts: "2026-05-25T11:00:00.000Z",
        metric: "temperature_c",
        value: 24,
        source: "manual",
      },
    ];
    const out = buildRecentSensorSnapshotHistory(manualRows, {
      now: new Date("2026-05-25T11:05:00.000Z").getTime(),
    });
    expect(out[0].source).toBe("manual");
    expect(SOURCE_LABEL[out[0].source]).toBe("Manual");
    expect(out[0].deviceDetail).toBeNull();
  });

  it("sim rows do not surface as Live", () => {
    const simRows = [
      {
        ts: "2026-05-25T11:00:00.000Z",
        metric: "temperature_c",
        value: 24,
        source: "sim",
      },
    ];
    const out = buildRecentSensorSnapshotHistory(simRows, {
      now: new Date("2026-05-25T11:05:00.000Z").getTime(),
    });
    expect(out[0].source).toBe("sim");
    expect(SOURCE_LABEL[out[0].source]).not.toBe("Live sensor");
  });
});

describe("static safety: shelly webhook edge function", () => {
  const fnSrc = readFileSync(
    resolve(process.cwd(), "supabase/functions/shelly-ht-webhook/index.ts"),
    "utf8",
  );

  const forbidden = [
    "action_queue",
    "alert_events",
    "alerts",
    "device_control",
    "automation",
    "home_assistant",
    "homeassistant",
  ];
  for (const term of forbidden) {
    it(`does not reference \`${term}\``, () => {
      expect(fnSrc.toLowerCase()).not.toContain(term.toLowerCase());
    });
  }

  it("never reads tent_id or user_id from request body", () => {
    expect(fnSrc).not.toMatch(/payload\.user_id|payload\?\.user_id/);
    expect(fnSrc).not.toMatch(/payload\.tent_id|payload\?\.tent_id/);
  });

  it("always responds with the ack envelope", () => {
    expect(fnSrc).toMatch(/status:\s*"received"/);
  });

  it("token check uses constant-time comparison", () => {
    expect(fnSrc).toMatch(/constantTimeEqual/);
  });

  it("only inserts into sensor_readings", () => {
    const fromCalls = fnSrc.match(/\.from\(/g) ?? [];
    // tents lookup + sensor_readings insert
    expect(fromCalls.length).toBe(2);
    expect(fnSrc).toMatch(/\.from\("sensor_readings"\)/);
    expect(fnSrc).toMatch(/\.from\("tents"\)/);
  });
});

describe("static safety: no SERVICE_ROLE in client code", () => {
  it("rules file has no service_role references", () => {
    const src = readFileSync(resolve(process.cwd(), "src/lib/shellyHtWebhookRules.ts"), "utf8");
    expect(src).not.toMatch(/service_role|SERVICE_ROLE/i);
  });
  it("panel does not duplicate the SOURCE_LABEL table", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/PlantTentEnvironmentPanel.tsx"),
      "utf8",
    );
    // Must import the canonical map, not redeclare it.
    expect(src).toMatch(/SOURCE_LABEL/);
    expect(src).not.toMatch(/SOURCE_LABEL\s*[:=]\s*\{/);
  });
});
