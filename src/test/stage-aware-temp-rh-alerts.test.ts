/**
 * Stage-aware Temperature & RH alert generation in
 * defaultEnvironmentThresholds. Mirrors the VPD slice and verifies:
 *   - high/low alerts emitted only for below_target / above_target
 *   - in_target / unknown / harvest / unavailable → no alert
 *   - stale / sim / unavailable snapshots never emit persisted alerts
 *   - stable dedupe-friendly title + id across observed values + timestamps
 *   - cautious recommendation copy (no device control, no nutrients)
 *   - existing VPD behavior unchanged (smoke check)
 *   - static safety: no action_queue / AI Doctor / automation / device-control
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildDefaultThresholdAlerts,
  DEFAULT_RECOMMENDATIONS,
} from "@/lib/defaultEnvironmentThresholds";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";

const NOW = new Date("2026-05-20T12:00:00Z").getTime();

function snap(p: Partial<SensorSnapshot>): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "manual",
    ts: new Date(NOW).toISOString(),
    ...p,
  };
}

const RULES_SRC = readFileSync(
  resolve(__dirname, "../lib/defaultEnvironmentThresholds.ts"),
  "utf8",
);

describe("stage-aware Temp/RH alerts — direction + stage routing", () => {
  it("1. seedling high temp → high-temp stage alert", () => {
    // Seedling temp band 22–26°C.
    const s = snap({ temp: 30, rh: 70, vpd: 0.8 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "seedling" });
    const a = out.find((x) => x.metric === "temp");
    expect(a).toBeDefined();
    expect(a?.id).toBe("default_target:temp:high");
    expect(a?.title).toBe("Temperature above stage range");
    expect(a?.reason).toMatch(/seedling/i);
    expect(a?.reason).toContain(DEFAULT_RECOMMENDATIONS.temp.high);
  });

  it("2. flower temp in target → NO temp alert", () => {
    // Flower temp band 20–26°C.
    const s = snap({ temp: 23, rh: 50, vpd: 1.2 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "flower" });
    expect(out.find((a) => a.metric === "temp")).toBeUndefined();
  });

  it("3. late_flower high RH → high-RH stage alert", () => {
    // Late flower RH band 35–50%.
    const s = snap({ temp: 22, rh: 70, vpd: 0.8 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "late_flower" });
    const a = out.find((x) => x.metric === "rh");
    expect(a?.id).toBe("default_target:rh:high");
    expect(a?.title).toBe("Humidity above stage range");
    expect(a?.reason).toMatch(/late flower/i);
    expect(a?.reason).toContain(DEFAULT_RECOMMENDATIONS.rh.high);
  });

  it("4. veg low RH → low-RH stage alert", () => {
    // Veg RH band 55–70%.
    const s = snap({ temp: 25, rh: 30, vpd: 1.2 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "veg" });
    const a = out.find((x) => x.metric === "rh");
    expect(a?.id).toBe("default_target:rh:low");
    expect(a?.title).toBe("Humidity below stage range");
    expect(a?.reason).toContain(DEFAULT_RECOMMENDATIONS.rh.low);
  });

  it("5. unknown stage → no misleading Temp/RH alert", () => {
    const s = snap({ temp: 40, rh: 90, vpd: 1.0 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: null });
    expect(out.find((a) => a.metric === "temp")).toBeUndefined();
    expect(out.find((a) => a.metric === "rh")).toBeUndefined();
  });

  it("6. harvest/drying → no active Temp/RH target alert", () => {
    const s = snap({ temp: 30, rh: 80, vpd: 1.0 });
    for (const stage of ["harvest", "drying", "cure"]) {
      const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage });
      expect(out.find((a) => a.metric === "temp")).toBeUndefined();
      expect(out.find((a) => a.metric === "rh")).toBeUndefined();
    }
  });
});

describe("stage-aware Temp/RH alerts — source filtering", () => {
  it("7a. stale snapshot → no persisted alerts", () => {
    const s = snap({
      ts: new Date(NOW - 60 * 60 * 1000).toISOString(),
      temp: 40,
      rh: 90,
    });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "flower" });
    expect(out).toEqual([]);
  });
  it("7b. sim snapshot → no persisted alerts", () => {
    const s = snap({ source: "sim", temp: 40, rh: 90 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "flower" });
    expect(out).toEqual([]);
  });
  it("7c. unavailable values → no temp/rh alerts", () => {
    const s = snap({ temp: null, rh: null });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "flower" });
    expect(out.find((a) => a.metric === "temp" || a.metric === "rh")).toBeUndefined();
  });
});

describe("stage-aware Temp/RH alerts — dedupe-friendly title stability", () => {
  it("8. same stage + direction → identical id/title across values + timestamps", () => {
    const a = buildDefaultThresholdAlerts({
      snapshot: snap({ temp: 30, ts: new Date(NOW).toISOString() }),
      now: NOW,
      stage: "flower",
    }).find((x) => x.metric === "temp");
    const b = buildDefaultThresholdAlerts({
      snapshot: snap({ temp: 33, ts: new Date(NOW + 60_000).toISOString() }),
      now: NOW + 60_000,
      stage: "flower",
    }).find((x) => x.metric === "temp");
    expect(a?.id).toBe(b?.id);
    expect(a?.title).toBe(b?.title);
    expect(a?.title).not.toMatch(/\d/);
  });

  it("9. RH dedupe-friendly id/title stable across values + timestamps", () => {
    const a = buildDefaultThresholdAlerts({
      snapshot: snap({ rh: 70, ts: new Date(NOW).toISOString() }),
      now: NOW,
      stage: "late_flower",
    }).find((x) => x.metric === "rh");
    const b = buildDefaultThresholdAlerts({
      snapshot: snap({ rh: 85, ts: new Date(NOW + 90_000).toISOString() }),
      now: NOW + 90_000,
      stage: "late_flower",
    }).find((x) => x.metric === "rh");
    expect(a?.id).toBe(b?.id);
    expect(a?.title).toBe(b?.title);
  });
});

describe("stage-aware Temp/RH alerts — VPD behavior preserved", () => {
  it("10. VPD still alerts under stage-aware path", () => {
    const s = snap({ temp: 24, rh: 30, vpd: 1.6 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "seedling" });
    expect(out.find((a) => a.id === "default_target:vpd:high")).toBeDefined();
  });
});

describe("static safety — Temp/RH recommendations + rules surface", () => {
  it("11. Temp/RH recommendations are conservative", () => {
    for (const m of ["temp", "rh"] as const) {
      for (const dir of ["high", "low"] as const) {
        const text = DEFAULT_RECOMMENDATIONS[m][dir];
        expect(text).toMatch(/review/i);
        expect(text).not.toMatch(/turn (on|off)|activate|automation|actuator|device[-_ ]command/i);
        expect(text).not.toMatch(/nutrient|feed (more|less|up|down)|increase ec/i);
      }
    }
  });

  it("12. rules file introduces no action_queue / AI Doctor / service_role / automation", () => {
    expect(RULES_SRC).not.toMatch(/action_queue/);
    expect(RULES_SRC).not.toMatch(/service_role/);
    expect(RULES_SRC).not.toMatch(/from\s+["'][^"']*ai[-_]?(doctor|coach)/i);
    expect(RULES_SRC).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|device_command|autopilot/i,
    );
  });
});
