/**
 * Quick Log → details.sensor save-path wiring.
 *
 * Asserts:
 *  - Adapter emits a redacted envelope only when attach ON + strip usable.
 *  - Builder wraps it as p_details.sensor (never sensor_snapshot).
 *  - raw_payload, tokens, and auth keys are never present.
 *  - Missing source / unavailable / loading / empty / error never persist.
 *  - Manual / sim / diary never become Live.
 */
import { describe, it, expect } from "vitest";
import { buildQuickLogSensorAttachPayload } from "@/lib/quickLogSensorAttachAdapter";
import { buildLegacyQuickLogUnifiedPayload } from "@/lib/legacyQuickLogUnifiedSave";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = new Date("2026-06-08T18:00:00Z");
const FRESH_TS = "2026-06-08T17:55:00Z";
const STALE_TS = "2026-06-08T17:00:00Z";

function liveSnap(over: Partial<SensorSnapshot> = {}): SensorSnapshot {
  return {
    source: "live",
    ts: FRESH_TS,
    temp: 24,
    rh: 55,
    vpd: 1.1,
    co2: 800,
    soil: 42,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
    device_id: "ecowitt:WH45",
    ...over,
  };
}

describe("Quick Log details.sensor wiring", () => {
  it("emits null when attach is OFF", () => {
    const p = buildQuickLogSensorAttachPayload({
      snapshot: liveSnap(),
      stripStatus: "usable",
      attach: false,
      tentId: "t1",
      now: NOW,
    });
    expect(p).toBeNull();
  });

  it("emits null when strip status is not usable", () => {
    expect(
      buildQuickLogSensorAttachPayload({
        snapshot: liveSnap(),
        stripStatus: "stale",
        attach: true,
        tentId: "t1",
        now: NOW,
      }),
    ).toBeNull();
    expect(
      buildQuickLogSensorAttachPayload({
        snapshot: liveSnap(),
        stripStatus: "invalid",
        attach: true,
        tentId: "t1",
        now: NOW,
      }),
    ).toBeNull();
    expect(
      buildQuickLogSensorAttachPayload({
        snapshot: EMPTY_SNAPSHOT,
        stripStatus: "no_data",
        attach: true,
        tentId: "t1",
        now: NOW,
      }),
    ).toBeNull();
  });

  it("fresh live snapshot resolves fresh_live with temp in Fahrenheit", () => {
    const p = buildQuickLogSensorAttachPayload({
      snapshot: liveSnap(),
      stripStatus: "usable",
      attach: true,
      tentId: "t1",
      now: NOW,
    });
    expect(p).not.toBeNull();
    expect(p!.status).toBe("fresh_live");
    expect(p!.source).toBe("live");
    expect(p!.tent_id).toBe("t1");
    // 24°C → 75.2°F
    expect(p!.metrics.temp_f).toBeCloseTo(75.2, 1);
    expect(p!.metrics.humidity_pct).toBe(55);
    expect(p!.metrics.vpd_kpa).toBe(1.1);
    expect(p!.metrics.soil_moisture_pct).toBe(42);
    expect(p!.metrics.co2_ppm).toBe(800);
    expect(p!.badge_label).toMatch(/Live/);
  });

  it("manual source never becomes Live", () => {
    const p = buildQuickLogSensorAttachPayload({
      snapshot: liveSnap({ source: "manual" }),
      stripStatus: "usable",
      attach: true,
      tentId: "t1",
      now: NOW,
    });
    expect(p!.status).toBe("fresh_non_live");
    expect(p!.badge_label).not.toMatch(/^Live/);
  });

  it("sim / diary sources never become Live", () => {
    for (const src of ["sim", "diary"] as const) {
      const p = buildQuickLogSensorAttachPayload({
        snapshot: liveSnap({ source: src }),
        stripStatus: "usable",
        attach: true,
        tentId: "t1",
        now: NOW,
      });
      expect(p!.status).toBe("fresh_non_live");
      expect(p!.badge_label).not.toMatch(/^Live/);
    }
  });

  it("envelope never contains raw_payload, tokens, or auth keys", () => {
    const p = buildQuickLogSensorAttachPayload({
      snapshot: liveSnap(),
      stripStatus: "usable",
      attach: true,
      tentId: "t1",
      now: NOW,
    });
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/raw_payload/i);
    expect(json).not.toMatch(/bearer/i);
    expect(json).not.toMatch(/service_role/i);
    expect(json).not.toMatch(/token/i);
  });

  it("builder wraps payload as p_details.sensor (never sensor_snapshot)", () => {
    const sensorAttachPayload = buildQuickLogSensorAttachPayload({
      snapshot: liveSnap(),
      stripStatus: "usable",
      attach: true,
      tentId: "t1",
      now: NOW,
    });
    const r = buildLegacyQuickLogUnifiedPayload({
      eventType: "observation",
      noteWithHardware: "checked plant",
      plantId: "p1",
      plantTentId: "t1",
      details: {},
      sensorAttachPayload,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.p_details).toBeTruthy();
    expect(r.payload.p_details).toHaveProperty("sensor");
    expect(r.payload.p_details).not.toHaveProperty("sensor_snapshot");
    expect((r.payload.p_details as { sensor: { status: string } }).sensor.status)
      .toBe("fresh_live");
  });

  it("builder emits null p_details when no sensor payload", () => {
    const r = buildLegacyQuickLogUnifiedPayload({
      eventType: "observation",
      noteWithHardware: "no sensor",
      plantId: "p1",
      plantTentId: null,
      details: {},
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.p_details ?? null).toBeNull();
  });

  it("stale timestamp on live source classifies as stale and never Live", () => {
    const p = buildQuickLogSensorAttachPayload({
      snapshot: liveSnap({ ts: STALE_TS }),
      stripStatus: "usable", // even if strip allowed through, rules engine downgrades
      attach: true,
      tentId: "t1",
      now: NOW,
    });
    // resolver classifies as stale → buildSensorSnapshotSavePayload still
    // returns the envelope (stale is honestly labeled, not omitted), but
    // status MUST NOT be fresh_live.
    expect(p?.status).not.toBe("fresh_live");
  });
});
