/**
 * Stage-aware VPD alert generation in defaultEnvironmentThresholds.
 *
 * Verifies that when `stage` is supplied, VPD alerts route through the
 * canonical `classifyVpdAgainstStage` helper, preserving:
 *   - existing dedupe-friendly stable titles / IDs (no observed value or
 *     timestamp in the title or id)
 *   - source-quality filtering (stale / sim / unavailable → no alert)
 *   - cautious recommendation copy (no device control, no nutrients)
 *   - backward compatibility when `stage` is omitted (legacy callers
 *     still see generic 0.6/1.6 thresholds).
 *
 * Also static safety: no action_queue, no service_role, no automation /
 * device-control strings introduced to the rules layer.
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
const ALERTS_SRC = readFileSync(
  resolve(__dirname, "../lib/environmentAlerts.ts"),
  "utf8",
);
const HOOK_SRC = readFileSync(
  resolve(__dirname, "../hooks/usePersistEnvironmentAlerts.ts"),
  "utf8",
);

describe("stage-aware VPD alerts — direction + stage routing", () => {
  it("1. seedling VPD above seedling target → high VPD alert", () => {
    // Seedling band 0.4–0.8. 1.6 is clearly above target.
    const s = snap({ temp: 24, rh: 30, vpd: 1.6 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "seedling" });
    const vpd = out.find((a) => a.metric === "vpd");
    expect(vpd).toBeDefined();
    expect(vpd?.id).toBe("default_target:vpd:high");
    expect(vpd?.title).toBe("VPD above stage range");
    expect(vpd?.reason).toMatch(/seedling/i);
    expect(vpd?.reason).toContain(DEFAULT_RECOMMENDATIONS.vpd.high);
  });

  it("2. flower VPD inside flower target → NO alert", () => {
    // Flower band 1.0–1.5.
    const s = snap({ temp: 26, rh: 55, vpd: 1.2 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "flower" });
    expect(out.find((a) => a.metric === "vpd")).toBeUndefined();
  });

  it("3. flower VPD above flower target → high VPD alert", () => {
    const s = snap({ temp: 28, rh: 30, vpd: 1.9 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "flower" });
    const vpd = out.find((a) => a.metric === "vpd");
    expect(vpd?.id).toBe("default_target:vpd:high");
    expect(vpd?.title).toBe("VPD above stage range");
    expect(vpd?.reason).toMatch(/flower/i);
  });

  it("4. veg VPD below veg target → low VPD alert", () => {
    // Veg band 0.8–1.2. 0.5 is below.
    const s = snap({ temp: 22, rh: 75, vpd: 0.5 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "veg" });
    const vpd = out.find((a) => a.metric === "vpd");
    expect(vpd?.id).toBe("default_target:vpd:low");
    expect(vpd?.title).toBe("VPD below stage range");
    expect(vpd?.reason).toContain(DEFAULT_RECOMMENDATIONS.vpd.low);
  });

  it("5. unknown stage → NO VPD alert (never misleading)", () => {
    const s = snap({ temp: 28, rh: 30, vpd: 2.4 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: null });
    expect(out.find((a) => a.metric === "vpd")).toBeUndefined();
  });

  it("6. harvest/drying → NO active VPD target alert (context only)", () => {
    const s = snap({ temp: 22, rh: 60, vpd: 2.4 });
    for (const stage of ["harvest", "drying", "cure"]) {
      const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage });
      expect(out.find((a) => a.metric === "vpd")).toBeUndefined();
    }
  });
});

describe("stage-aware VPD alerts — source filtering", () => {
  it("7a. stale snapshot → no persisted VPD alert", () => {
    const s = snap({
      ts: new Date(NOW - 60 * 60 * 1000).toISOString(),
      vpd: 2.4,
    });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "flower" });
    expect(out).toEqual([]);
  });
  it("7b. sim snapshot → no persisted VPD alert", () => {
    const s = snap({ source: "sim", vpd: 2.4 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "flower" });
    expect(out).toEqual([]);
  });
  it("7c. unavailable VPD value → no VPD alert", () => {
    const s = snap({ vpd: null });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW, stage: "flower" });
    expect(out.find((a) => a.metric === "vpd")).toBeUndefined();
  });
});

describe("stage-aware VPD alerts — dedupe-friendly title stability", () => {
  it("8. same stage + direction → identical title/id across observed values + timestamps", () => {
    const a = buildDefaultThresholdAlerts({
      snapshot: snap({ vpd: 2.0, ts: new Date(NOW).toISOString() }),
      now: NOW,
      stage: "flower",
    }).find((x) => x.metric === "vpd");
    const b = buildDefaultThresholdAlerts({
      snapshot: snap({ vpd: 2.4, ts: new Date(NOW + 60_000).toISOString() }),
      now: NOW + 60_000,
      stage: "flower",
    }).find((x) => x.metric === "vpd");
    expect(a?.id).toBe(b?.id);
    expect(a?.title).toBe(b?.title);
    expect(a?.title).not.toMatch(/\d/); // no observed value/timestamp in title
  });
});

describe("backward compatibility — no stage supplied", () => {
  it("9. omitting stage falls back to legacy generic VPD range", () => {
    const s = snap({ vpd: 2.4 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW });
    const vpd = out.find((a) => a.metric === "vpd");
    expect(vpd?.id).toBe("default_target:vpd:high");
    expect(vpd?.title).toBe("VPD above default range");
  });
});

describe("static safety contract", () => {
  for (const [name, src] of [
    ["defaultEnvironmentThresholds.ts", RULES_SRC],
    ["environmentAlerts.ts", ALERTS_SRC],
    ["usePersistEnvironmentAlerts.ts", HOOK_SRC],
  ] as const) {
    it(`${name}: no action_queue / AI Doctor / automation / device-control / service_role`, () => {
      expect(src).not.toMatch(/action_queue/);
      expect(src).not.toMatch(/ai[\s_-]?doctor|ai[\s_-]?coach/i);
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|device_command|autopilot/i,
      );
    });
  }

  it("VPD recommendation copy is conservative", () => {
    for (const dir of ["high", "low"] as const) {
      const text = DEFAULT_RECOMMENDATIONS.vpd[dir];
      expect(text).toMatch(/review/i);
      expect(text).not.toMatch(/turn (on|off)|activate|automation|actuator|device[-_ ]command/i);
      expect(text).not.toMatch(/nutrient|feed change|increase feed|reduce feed/i);
    }
  });
});
