/**
 * Environment Alert v1 — default-threshold evaluation, source labelling,
 * cautious recommendations, and safety constraints.
 *
 * Verifies that real manual/live snapshots produce review-first alerts
 * against conservative defaults, that simulated/stale/invalid readings
 * do not, that CO2 alone never alerts, and that no automation / device
 * execution / action_queue write paths leaked into the rules layer.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildEnvironmentAlerts,
  type EnvironmentAlert,
} from "@/lib/environmentAlerts";
import {
  buildDefaultThresholdAlerts,
  DEFAULT_RECOMMENDATIONS,
  DEFAULT_THRESHOLDS,
} from "@/lib/defaultEnvironmentThresholds";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";

const NOW = new Date("2026-05-20T12:00:00Z").getTime();

function snap(partial: Partial<SensorSnapshot>): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "live",
    ts: new Date(NOW).toISOString(),
    ...partial,
  };
}

function runAll(input: {
  snapshot: SensorSnapshot | null;
  deviceLabel?: string | null;
}): EnvironmentAlert[] {
  return buildEnvironmentAlerts({
    snapshot: input.snapshot,
    quality: evaluateSensorQuality(input.snapshot, NOW),
    targets: compareSnapshotToTargets(input.snapshot, null),
    now: NOW,
    deviceLabel: input.deviceLabel ?? null,
  });
}

describe("Environment Alert v1 — default thresholds", () => {
  it("1. manual reading with high RH generates a high-humidity alert", () => {
    const s = snap({ source: "manual", temp: 24, rh: 85, vpd: 0.6 });
    const a = runAll({ snapshot: s }).find(
      (x) => x.id === "default_target:rh:high",
    );
    expect(a).toBeDefined();
    expect(a?.severity).toBe("warning");
    expect(a?.source).toBe("default_thresholds");
    expect(a?.reason).toContain(DEFAULT_RECOMMENDATIONS.rh.high);
  });

  it("2. live (Shelly) reading with high RH generates a high-humidity alert", () => {
    const s = snap({ source: "live", temp: 24, rh: 90, vpd: 0.6 });
    const a = runAll({ snapshot: s, deviceLabel: "Shelly H&T Gen4" }).find(
      (x) => x.id === "default_target:rh:high",
    );
    expect(a).toBeDefined();
    expect(a?.reason).toContain("Shelly H&T Gen4");
  });

  it("3. simulated reading does NOT generate an environment alert", () => {
    const s = snap({ source: "sim", temp: 40, rh: 95, vpd: 3.5 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW });
    expect(out).toEqual([]);
  });

  it("4. stale reading does NOT generate a default-threshold alert", () => {
    const s = snap({
      ts: new Date(NOW - 60 * 60 * 1000).toISOString(),
      source: "live",
      temp: 40,
      rh: 95,
      vpd: 3.5,
    });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW });
    expect(out).toEqual([]);
  });

  it("5. invalid (null) humidity does not appear as healthy and emits no RH alert", () => {
    const s = snap({ source: "manual", temp: 24, rh: null, vpd: 1.0 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW });
    expect(out.find((a) => a.metric === "rh")).toBeUndefined();
  });

  it("6. high temperature alert is deterministic", () => {
    const s = snap({ source: "manual", temp: 33, rh: 50, vpd: 1.0 });
    const a = runAll({ snapshot: s }).find((x) => x.id === "default_target:temp:high");
    const b = runAll({ snapshot: s }).find((x) => x.id === "default_target:temp:high");
    expect(a).toBeDefined();
    expect(a).toEqual(b);
    expect(a?.reason).toContain(DEFAULT_RECOMMENDATIONS.temp.high);
  });

  it("7. low temperature alert is deterministic", () => {
    const s = snap({ source: "live", temp: 12, rh: 50, vpd: 1.0 });
    const a = runAll({ snapshot: s }).find((x) => x.id === "default_target:temp:low");
    expect(a).toBeDefined();
    expect(a?.reason).toContain(DEFAULT_RECOMMENDATIONS.temp.low);
  });

  it("8. high VPD alert is deterministic", () => {
    const s = snap({ source: "manual", temp: 28, rh: 30, vpd: 2.4 });
    const a = runAll({ snapshot: s }).find((x) => x.id === "default_target:vpd:high");
    expect(a).toBeDefined();
    expect(a?.reason).toContain(DEFAULT_RECOMMENDATIONS.vpd.high);
  });

  it("9. low VPD alert is deterministic", () => {
    const s = snap({ source: "live", temp: 22, rh: 80, vpd: 0.3 });
    const a = runAll({ snapshot: s }).find((x) => x.id === "default_target:vpd:low");
    expect(a).toBeDefined();
    expect(a?.reason).toContain(DEFAULT_RECOMMENDATIONS.vpd.low);
  });

  it("10. missing optional CO2 has no effect on alert generation", () => {
    const s = snap({ source: "manual", temp: 24, rh: 50, vpd: 1.0, co2: null });
    const out = runAll({ snapshot: s }).filter((a) => a.source === "default_thresholds");
    expect(out).toEqual([]);
  });

  it("11. CO2 alone never generates a default-threshold alert", () => {
    const s = snap({ source: "manual", temp: 24, rh: 50, vpd: 1.0, co2: 5000 });
    const out = buildDefaultThresholdAlerts({ snapshot: s, now: NOW });
    expect(out).toEqual([]);
  });

  it("12. alert includes source timestamp and device detail when available", () => {
    const s = snap({ source: "live", temp: 24, rh: 85, vpd: 0.6 });
    const a = buildDefaultThresholdAlerts({
      snapshot: s,
      now: NOW,
      deviceLabel: "Shelly H&T Gen4",
    })[0];
    expect(a.reason).toContain(s.ts!);
    expect(a.reason).toContain("Shelly H&T Gen4");
  });

  it("13. recommendation contains no device-execution language", () => {
    for (const m of ["temp", "rh", "vpd"] as const) {
      for (const dir of ["high", "low"] as const) {
        const text = DEFAULT_RECOMMENDATIONS[m][dir];
        expect(text).not.toMatch(/turn (on|off)/i);
        expect(text).not.toMatch(/activate/i);
        expect(text).not.toMatch(/automation/i);
        expect(text).not.toMatch(/actuator/i);
        expect(text).not.toMatch(/device[-_ ]command/i);
        expect(text).toMatch(/review/i);
      }
    }
  });

  it("14. recommendation never suggests nutrient changes", () => {
    for (const m of ["temp", "rh", "vpd"] as const) {
      for (const dir of ["high", "low"] as const) {
        const text = DEFAULT_RECOMMENDATIONS[m][dir];
        expect(text).not.toMatch(/nutrient/i);
        expect(text).not.toMatch(/feed (more|less|up|down)/i);
        expect(text).not.toMatch(/increase ec/i);
      }
    }
  });

  it("15. default thresholds are conservative and bounded", () => {
    expect(DEFAULT_THRESHOLDS.temp.min).toBeGreaterThanOrEqual(15);
    expect(DEFAULT_THRESHOLDS.temp.max).toBeLessThanOrEqual(32);
    expect(DEFAULT_THRESHOLDS.rh.min).toBeGreaterThanOrEqual(30);
    expect(DEFAULT_THRESHOLDS.rh.max).toBeLessThanOrEqual(75);
    expect(DEFAULT_THRESHOLDS.vpd.min).toBeGreaterThanOrEqual(0.4);
    expect(DEFAULT_THRESHOLDS.vpd.max).toBeLessThanOrEqual(1.8);
  });
});

// ---------------------------------------------------------------------------
// Static safety — no automation / device control / action_queue writes / etc.
// ---------------------------------------------------------------------------
const HELPER = readFileSync(
  resolve(__dirname, "../lib/defaultEnvironmentThresholds.ts"),
  "utf8",
);
const ENV_ALERTS = readFileSync(
  resolve(__dirname, "../lib/environmentAlerts.ts"),
  "utf8",
);

describe("Environment Alert v1 — static safety", () => {
  it("rules file contains no automation / device control / write paths", () => {
    for (const src of [HELPER, ENV_ALERTS]) {
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/action_queue/i);
      expect(src).not.toMatch(/device[-_ ]command/i);
      expect(src).not.toMatch(/actuator/i);
      expect(src).not.toMatch(/automation/i);
      expect(src).not.toMatch(/\.insert\s*\(/);
      expect(src).not.toMatch(/\.update\s*\(/);
      expect(src).not.toMatch(/\.delete\s*\(/);
      expect(src).not.toMatch(/\.upsert\s*\(/);
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(/fake[-_ ]?live/i);
    }
  });

  it("threshold tables are not duplicated inside React components", () => {
    // Search the components tree for hard-coded copies of the constant.
    // Allowed: imports of the constant. Forbidden: literal re-declarations.
    const componentsDir = resolve(__dirname, "../components");
    const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
    const walk = (dir: string): string[] => {
      const out: string[] = [];
      for (const name of readdirSync(dir)) {
        const p = `${dir}/${name}`;
        const s = statSync(p);
        if (s.isDirectory()) out.push(...walk(p));
        else if (/\.(tsx|ts)$/.test(name)) out.push(p);
      }
      return out;
    };
    for (const file of walk(componentsDir)) {
      const txt = readFileSync(file, "utf8");
      expect(txt).not.toMatch(/DEFAULT_THRESHOLDS\s*=\s*\{/);
      expect(txt).not.toMatch(/DEFAULT_RECOMMENDATIONS\s*=\s*\{/);
    }
  });
});
