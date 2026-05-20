/**
 * Read-only environment-alerts foundation tests.
 *
 * Verifies the pure helper rules, deterministic ordering, Dashboard
 * integration (scoped-only render), and safety constraints (no ai-coach,
 * no external-control, no service_role, no write paths).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

import {
  buildEnvironmentAlerts,
  EMPTY_ALERTS_MESSAGE,
  type EnvironmentAlert,
} from "@/lib/environmentAlerts";
import { EMPTY_SNAPSHOT, type SensorSnapshot } from "@/lib/sensorSnapshot";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import {
  compareSnapshotToTargets,
  type GrowTargets,
} from "@/lib/environmentTargetComparison";

const NOW = new Date("2026-05-20T12:00:00Z").getTime();

function snap(partial: Partial<SensorSnapshot>): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "live",
    ts: new Date(NOW).toISOString(),
    ...partial,
  };
}

describe("buildEnvironmentAlerts — rules", () => {
  it("returns info alert when snapshot is unavailable", () => {
    const alerts = buildEnvironmentAlerts({
      snapshot: null,
      quality: evaluateSensorQuality(null, NOW),
      targets: compareSnapshotToTargets(null, null),
      now: NOW,
    });
    const a = alerts.find((x) => x.id === "snapshot:unavailable");
    expect(a).toBeDefined();
    expect(a?.severity).toBe("info");
    expect(a?.source).toBe("sensor_snapshot");
  });

  it("returns watch alert when sensor reading is stale", () => {
    const stale = snap({
      ts: new Date(NOW - 60 * 60 * 1000).toISOString(),
      temp: 24,
      rh: 55,
      vpd: 1.1,
    });
    const alerts = buildEnvironmentAlerts({
      snapshot: stale,
      quality: evaluateSensorQuality(stale, NOW),
      targets: compareSnapshotToTargets(stale, null),
      now: NOW,
    });
    const a = alerts.find((x) => x.id === "snapshot:stale");
    expect(a).toBeDefined();
    expect(a?.severity).toBe("watch");
  });

  it("returns warning for out-of-range target metrics", () => {
    const s = snap({ temp: 35, rh: 55, vpd: 1.0 });
    const targets: GrowTargets = {
      temp: { min: 20, max: 28 },
    };
    const alerts = buildEnvironmentAlerts({
      snapshot: s,
      quality: evaluateSensorQuality(s, NOW),
      targets: compareSnapshotToTargets(s, targets),
      now: NOW,
    });
    const a = alerts.find((x) => x.id === "target:temp:high");
    expect(a).toBeDefined();
    expect(a?.severity).toBe("warning");
    expect(a?.source).toBe("target_comparison");
  });

  it("returns info (not warning) when targets are missing", () => {
    const s = snap({ temp: 24, rh: 55, vpd: 1.0 });
    const alerts = buildEnvironmentAlerts({
      snapshot: s,
      quality: evaluateSensorQuality(s, NOW),
      targets: compareSnapshotToTargets(s, null),
      now: NOW,
    });
    const a = alerts.find((x) => x.id === "targets:missing");
    expect(a).toBeDefined();
    expect(a?.severity).toBe("info");
    const anyWarning = alerts.find(
      (x) => x.source === "target_comparison" && x.severity === "warning",
    );
    expect(anyWarning).toBeUndefined();
  });

  it("returns critical for implausible metric values", () => {
    const bad = snap({ temp: 120, rh: 55, vpd: 1.0 });
    const alerts = buildEnvironmentAlerts({
      snapshot: bad,
      quality: evaluateSensorQuality(bad, NOW),
      targets: compareSnapshotToTargets(bad, null),
      now: NOW,
    });
    const a = alerts.find((x) => x.id === "quality:temp");
    expect(a).toBeDefined();
    expect(a?.severity).toBe("critical");
  });

  it("produces deterministic ordering (severity, then metric, then title)", () => {
    const bad = snap({ temp: 120, rh: 100, vpd: 1.0 });
    const targets: GrowTargets = { vpd: { min: 0.6, max: 1.6 } };
    const s2 = { ...bad, vpd: 3.0 } as SensorSnapshot; // also high VPD vs target
    const run = (): EnvironmentAlert[] =>
      buildEnvironmentAlerts({
        snapshot: s2,
        quality: evaluateSensorQuality(s2, NOW),
        targets: compareSnapshotToTargets(s2, targets),
        now: NOW,
      });
    const a = run();
    const b = run();
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    const weights = { critical: 0, warning: 1, watch: 2, info: 3 } as const;
    for (let i = 1; i < a.length; i++) {
      expect(weights[a[i].severity]).toBeGreaterThanOrEqual(
        weights[a[i - 1].severity],
      );
    }
  });

  it("returns no alerts when everything is healthy and in range", () => {
    const s = snap({ temp: 24, rh: 55, vpd: 1.0 });
    const targets: GrowTargets = {
      temp: { min: 20, max: 28 },
      rh: { min: 40, max: 65 },
      vpd: { min: 0.6, max: 1.6 },
    };
    const alerts = buildEnvironmentAlerts({
      snapshot: s,
      quality: evaluateSensorQuality(s, NOW),
      targets: compareSnapshotToTargets(s, targets),
      now: NOW,
    });
    expect(alerts).toEqual([]);
  });

  it("exports the empty-state message used by the Dashboard", () => {
    expect(EMPTY_ALERTS_MESSAGE).toBe("No environment alerts.");
  });
});

// ---------------------------------------------------------------------------
// Dashboard integration + safety constraints
// ---------------------------------------------------------------------------

const DASHBOARD_PATH = resolve(__dirname, "../pages/Dashboard.tsx");
const DASHBOARD = readFileSync(DASHBOARD_PATH, "utf8");
const HELPER_PATH = resolve(__dirname, "../lib/environmentAlerts.ts");
const HELPER = readFileSync(HELPER_PATH, "utf8");

describe("Environment Alerts — Dashboard integration", () => {
  it("Dashboard imports the alerts helper", () => {
    expect(DASHBOARD).toMatch(/from\s+["']@\/lib\/environmentAlerts["']/);
    expect(DASHBOARD).toContain("buildEnvironmentAlerts");
  });

  it("Dashboard renders Environment Alerts section only when scoped", () => {
    expect(DASHBOARD).toMatch(/aria-label=["']Environment Alerts["']/);
    // The Environment Alerts section must live inside the scopedGrowId branch.
    const scopedIdx = DASHBOARD.indexOf("scopedGrowId ? (");
    const elseIdx = DASHBOARD.indexOf(") : (", scopedIdx);
    const alertsIdx = DASHBOARD.indexOf('aria-label="Environment Alerts"');
    expect(scopedIdx).toBeGreaterThan(-1);
    expect(elseIdx).toBeGreaterThan(scopedIdx);
    expect(alertsIdx).toBeGreaterThan(scopedIdx);
    expect(alertsIdx).toBeLessThan(elseIdx);
  });

  it("Dashboard renders the empty-state copy when there are no alerts", () => {
    expect(DASHBOARD).toContain("EMPTY_ALERTS_MESSAGE");
  });
});

describe("Environment Alerts — safety constraints", () => {
  it("helper does not call ai-coach", () => {
    expect(HELPER).not.toMatch(/ai-coach/i);
    expect(HELPER).not.toMatch(/functions\.invoke/);
  });

  it("helper does not introduce external-control / device-command strings", () => {
    expect(HELPER).not.toMatch(/device[-_ ]command/i);
    expect(HELPER).not.toMatch(/actuator/i);
    expect(HELPER).not.toMatch(/external[-_ ]control/i);
  });

  it("helper does not use service_role", () => {
    expect(HELPER).not.toMatch(/service_role/i);
  });

  it("helper performs no Supabase writes", () => {
    expect(HELPER).not.toMatch(/\.insert\s*\(/);
    expect(HELPER).not.toMatch(/\.update\s*\(/);
    expect(HELPER).not.toMatch(/\.delete\s*\(/);
    expect(HELPER).not.toMatch(/\.upsert\s*\(/);
    expect(HELPER).not.toMatch(/from\s+["']@\/integrations\/supabase/);
  });

  it("Dashboard introduces no new ai-coach call or device-command surface in alerts section", () => {
    // Surgical: ensure the new section block does not add forbidden strings.
    const start = DASHBOARD.indexOf('aria-label="Environment Alerts"');
    const end = DASHBOARD.indexOf("</section>", start);
    const block = DASHBOARD.slice(start, end);
    expect(block).not.toMatch(/ai-coach/i);
    expect(block).not.toMatch(/device[-_ ]command/i);
    expect(block).not.toMatch(/actuator/i);
    expect(block).not.toMatch(/service_role/i);
    expect(block).not.toMatch(/\.insert\s*\(/);
  });

  it("no project source file references service_role (defensive sweep)", () => {
    const srcDir = resolve(__dirname, "..");
    const violations: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const s = statSync(full);
        if (s.isDirectory()) {
          if (name === "node_modules" || name.startsWith(".")) continue;
          walk(full);
        } else if (/\.(ts|tsx)$/.test(name)) {
          const text = readFileSync(full, "utf8");
          if (/service_role/i.test(text)) violations.push(full);
        }
      }
    };
    walk(srcDir);
    expect(violations).toEqual([]);
  });
});
