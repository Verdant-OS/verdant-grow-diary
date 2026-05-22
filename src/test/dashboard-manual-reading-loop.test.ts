/**
 * Demo-loop tests: Manual Sensor Reading → Dashboard → Persisted Alert.
 *
 * Verifies the visible V0 operating loop:
 *   1. Latest snapshot wiring respects multi-tent selection
 *   2. Fresh manual readings present as "Manual" with a real timestamp
 *   3. Stale / demo / unavailable readings do NOT persist alerts
 *   4. Fresh manual out-of-range readings DO yield persistable alerts
 *      through the existing `usePersistEnvironmentAlerts` hook (single
 *      source of truth for persistence)
 *   5. Dashboard UI itself does not insert into alerts
 *   6. No automation, no device control, no service_role
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { snapshotFromReadings, isStale, SOURCE_LABEL } from "@/lib/sensorSnapshot";
import {
  isSnapshotPersistable,
  selectPersistableAlerts,
  derivedAlertKey,
  dedupeAgainstOpen,
} from "@/lib/environmentAlertPersistence";
import {
  resolveSelectedTentIds,
  isSelectionOrphaned,
} from "@/lib/dashboardLatestEnvironmentRules";
import type { EnvironmentAlert } from "@/lib/environmentAlerts";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");

const FRESH_TS = new Date().toISOString();
const STALE_TS = new Date(Date.now() - 60 * 60 * 1000).toISOString();

const goodQuality = { quality: "good" as const, headline: "Sensor data looks usable", reasons: [], suspiciousFields: [] };

function manualSnap(opts: { ts?: string; temp?: number; rh?: number } = {}) {
  return {
    source: "manual" as const,
    ts: opts.ts ?? FRESH_TS,
    temp: opts.temp ?? 24,
    rh: opts.rh ?? 55,
    vpd: null,
    co2: null,
    soil: null,
    soil_ec: null,
    soil_temp: null,
    ppfd: null,
  };
}

const tents = [
  { id: "t-aaa", name: "Tent A" },
  { id: "t-bbb", name: "Tent B" },
];

describe("Dashboard tent selector (pure rules)", () => {
  it("defaults to all tents when selection is 'all'", () => {
    expect(resolveSelectedTentIds(tents, "all")).toEqual(["t-aaa", "t-bbb"]);
  });
  it("narrows to a single tent when selected", () => {
    expect(resolveSelectedTentIds(tents, "t-bbb")).toEqual(["t-bbb"]);
  });
  it("falls back to all tents when the selection no longer exists", () => {
    expect(resolveSelectedTentIds(tents, "t-archived")).toEqual([
      "t-aaa",
      "t-bbb",
    ]);
    expect(isSelectionOrphaned(tents, "t-archived")).toBe(true);
    expect(isSelectionOrphaned(tents, "t-aaa")).toBe(false);
    expect(isSelectionOrphaned(tents, "all")).toBe(false);
  });
});

describe("Latest snapshot labels a fresh manual reading correctly", () => {
  it("snapshotFromReadings flips source to 'manual' and timestamp is fresh", () => {
    const snap = snapshotFromReadings([
      { ts: FRESH_TS, metric: "temperature_c", value: 25, source: "manual" },
      { ts: FRESH_TS, metric: "humidity_pct", value: 55, source: "manual" },
    ]);
    expect(snap).not.toBeNull();
    expect(snap!.source).toBe("manual");
    expect(SOURCE_LABEL.manual).toBe("Manual");
    expect(snap!.ts).toBe(FRESH_TS);
    expect(isStale(snap!.ts)).toBe(false);
  });

  it("flags a stale manual reading as stale", () => {
    const snap = snapshotFromReadings([
      { ts: STALE_TS, metric: "temperature_c", value: 25, source: "manual" },
    ]);
    expect(snap!.source).toBe("manual");
    expect(isStale(snap!.ts)).toBe(true);
  });
});

describe("Alert persistence gating from manual readings", () => {
  const oorAlert: EnvironmentAlert = {
    id: "rh:high",
    severity: "warning",
    metric: "rh",
    title: "Humidity above target",
    reason: "RH 75% > target max 65%",
    source: "sensor_snapshot",
    createdAt: FRESH_TS,
  };

  it("does NOT persist alerts from stale manual readings", () => {
    const out = selectPersistableAlerts([oorAlert], {
      snapshot: manualSnap({ ts: STALE_TS }),
      quality: "good",
    });
    expect(out).toEqual([]);
  });

  it("does NOT persist alerts from demo / fallback data", () => {
    expect(
      isSnapshotPersistable({ snapshot: manualSnap(), quality: "good", isDemoData: true }),
    ).toBe(false);
  });

  it("does NOT persist alerts from an unavailable snapshot", () => {
    expect(isSnapshotPersistable({ snapshot: null, quality: "unavailable" })).toBe(false);
  });

  it("DOES yield persistable alerts from a fresh manual out-of-range reading", () => {
    const out = selectPersistableAlerts([oorAlert], {
      snapshot: manualSnap({ rh: 75 }),
      quality: "good",
    });
    expect(out.length).toBe(1);
    expect(out[0].metric).toBe("rh");
  });

  it("dedupes against an already-open equivalent alert (idempotent)", () => {
    const open = [
      {
        metric: "humidity_pct",
        source: "environment_alerts",
        reason: oorAlert.reason,
      },
    ];
    expect(dedupeAgainstOpen([oorAlert], open)).toEqual([]);
    // Same rule key on both sides:
    expect(derivedAlertKey(oorAlert)).toContain("rh");
  });
});

describe("Dashboard UI surface — safety contract", () => {
  it("does not directly insert into alerts from Dashboard JSX", () => {
    // Must go through usePersistEnvironmentAlerts (which uses lib/alerts).
    expect(DASHBOARD).not.toMatch(
      /\.from\(\s*['"]alerts['"]\s*\)\s*\.(insert|upsert)/,
    );
  });

  it("alert persistence is only invoked through usePersistEnvironmentAlerts", () => {
    expect(DASHBOARD).toMatch(/usePersistEnvironmentAlerts\(/);
  });

  it("introduces no automation / device control / service_role / typed watering / leads writes", () => {
    expect(DASHBOARD).not.toMatch(/service_role/);
    expect(DASHBOARD).not.toMatch(/create_watering_event/);
    expect(DASHBOARD).not.toMatch(/typedWateringWriteEnabled/);
    expect(DASHBOARD).not.toMatch(
      /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i,
    );
    expect(DASHBOARD).not.toMatch(/from\(\s*['"]leads['"]\s*\)/);
    expect(DASHBOARD).not.toMatch(/from\(\s*['"]action_queue['"]\s*\)\s*\.(insert|update|delete|upsert)/);
  });

  it("wires the tent selector and persisted-count display", () => {
    expect(DASHBOARD).toMatch(/data-testid="latest-env-tent-select"/);
    expect(DASHBOARD).toMatch(/data-testid="latest-env-persisted-count"/);
    expect(DASHBOARD).toMatch(/resolveSelectedTentIds/);
    expect(DASHBOARD).toMatch(/useAlertsList/);
  });
});
