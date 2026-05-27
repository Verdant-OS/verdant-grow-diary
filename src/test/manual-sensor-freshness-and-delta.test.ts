/**
 * Gate 1B — Visual Data Decay + Delta Markers (pure helper + safety contract).
 *
 * Asserts:
 *  - Freshness helper: fresh / aging / stale / missing with injectable `now`.
 *  - Delta helper: first_log / up / down / flat with sign + unit formatting.
 *  - usePlantManualSensorHistory.derive: picks latest manual value per metric,
 *    ignores demo/live snapshots and unrelated rows.
 *  - Source-level safety: no AI, no alerts, no action_queue, no service_role,
 *    no automation strings, no client-trusted user_id in QuickLog payload.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  computeFreshness,
  buildFreshnessSnapshot,
  buildFreshnessSnapshots,
  computeFreshnessCta,
  FRESHNESS_FRESH_MAX_HOURS,
  FRESHNESS_AGING_MAX_HOURS,
  MANUAL_SENSOR_METRICS,
} from "@/lib/manualSensorFreshnessRules";
import { computeManualSensorDelta } from "@/lib/manualSensorDeltaRules";
import { deriveLatestManualReadings } from "@/hooks/usePlantManualSensorHistory";

const NOW = "2026-05-27T12:00:00Z";
const hoursAgo = (h: number) =>
  new Date(new Date(NOW).getTime() - h * 3_600_000).toISOString();

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("computeFreshness", () => {
  it("returns 'missing' when no reading", () => {
    expect(computeFreshness(null, NOW)).toBe("missing");
  });
  it("returns 'fresh' for <24h", () => {
    expect(computeFreshness({ value: 77, loggedAt: hoursAgo(1) }, NOW)).toBe("fresh");
    expect(computeFreshness({ value: 77, loggedAt: hoursAgo(23.9) }, NOW)).toBe("fresh");
  });
  it("returns 'aging' for 24-48h", () => {
    expect(computeFreshness({ value: 77, loggedAt: hoursAgo(24) }, NOW)).toBe("aging");
    expect(computeFreshness({ value: 77, loggedAt: hoursAgo(47.9) }, NOW)).toBe("aging");
  });
  it("returns 'stale' for >=48h", () => {
    expect(computeFreshness({ value: 77, loggedAt: hoursAgo(48) }, NOW)).toBe("stale");
    expect(computeFreshness({ value: 77, loggedAt: hoursAgo(240) }, NOW)).toBe("stale");
  });
  it("is deterministic with injected now (no Date.now reads)", () => {
    // Frozen `now`, advancing logged-at across the boundary.
    const a = computeFreshness({ value: 1, loggedAt: hoursAgo(23) }, NOW);
    const b = computeFreshness({ value: 1, loggedAt: hoursAgo(25) }, NOW);
    expect(a).toBe("fresh");
    expect(b).toBe("aging");
  });
  it("treats invalid logged-at as missing", () => {
    expect(computeFreshness({ value: 1, loggedAt: "not-a-date" }, NOW)).toBe("missing");
  });
  it("exposes the documented hour thresholds", () => {
    expect(FRESHNESS_FRESH_MAX_HOURS).toBe(24);
    expect(FRESHNESS_AGING_MAX_HOURS).toBe(48);
  });
});

describe("buildFreshnessSnapshots", () => {
  it("returns all four metrics in stable order, missing when absent", () => {
    const snaps = buildFreshnessSnapshots({}, NOW);
    expect(snaps.map((s) => s.metric)).toEqual([...MANUAL_SENSOR_METRICS]);
    expect(snaps.every((s) => s.state === "missing")).toBe(true);
    expect(snaps.every((s) => s.value === null)).toBe(true);
  });
  it("computes per-metric state from latest reading", () => {
    const out = buildFreshnessSnapshots(
      {
        temp_f: { value: 77, loggedAt: hoursAgo(2) },
        ph: { value: 6.1, loggedAt: hoursAgo(72) },
      },
      NOW,
    );
    const byMetric = Object.fromEntries(out.map((s) => [s.metric, s]));
    expect(byMetric.temp_f.state).toBe("fresh");
    expect(byMetric.ph.state).toBe("stale");
    expect(byMetric.humidity_percent.state).toBe("missing");
    expect(byMetric.ec.state).toBe("missing");
  });
  it("buildFreshnessSnapshot exposes ageHours", () => {
    const s = buildFreshnessSnapshot(
      "temp_f",
      { value: 77, loggedAt: hoursAgo(10) },
      NOW,
    );
    expect(s.ageHours).toBeCloseTo(10, 5);
  });
});

describe("computeFreshnessCta", () => {
  it("returns 'add_first' when every metric is missing", () => {
    const snaps = buildFreshnessSnapshots({}, NOW);
    expect(computeFreshnessCta(snaps)).toBe("add_first");
  });
  it("returns 'update' when any metric is aging or stale", () => {
    const aging = buildFreshnessSnapshots(
      { temp_f: { value: 77, loggedAt: hoursAgo(30) } },
      NOW,
    );
    expect(computeFreshnessCta(aging)).toBe("update");
    const stale = buildFreshnessSnapshots(
      { ph: { value: 6.1, loggedAt: hoursAgo(72) } },
      NOW,
    );
    expect(computeFreshnessCta(stale)).toBe("update");
  });
  it("returns 'none' when all present metrics are fresh (mixed fresh + missing does not nag)", () => {
    const snaps = buildFreshnessSnapshots(
      { temp_f: { value: 77, loggedAt: hoursAgo(1) } },
      NOW,
    );
    expect(computeFreshnessCta(snaps)).toBe("none");
  });
  it("prefers 'update' over 'add_first' when any non-missing metric is aging/stale", () => {
    const snaps = buildFreshnessSnapshots(
      { temp_f: { value: 77, loggedAt: hoursAgo(72) } },
      NOW,
    );
    expect(computeFreshnessCta(snaps)).toBe("update");
  });
  it("returns 'none' on empty snapshot list", () => {
    expect(computeFreshnessCta([])).toBe("none");
  });
});

describe("computeManualSensorDelta", () => {
  it("returns null when current is not finite", () => {
    expect(computeManualSensorDelta("ph", null, 6.0)).toBeNull();
    expect(computeManualSensorDelta("ph", NaN as unknown as number, 6.0)).toBeNull();
  });
  it("first_log when no previous value", () => {
    const d = computeManualSensorDelta("ph", 6.2, null);
    expect(d?.direction).toBe("first_log");
    expect(d?.delta).toBeNull();
    expect(d?.label).toBe("first log");
  });
  it("up uses + sign and metric unit", () => {
    const d = computeManualSensorDelta("ph", 6.2, 6.0);
    expect(d?.direction).toBe("up");
    expect(d?.label).toBe("+0.2 since last log");
  });
  it("down uses - sign and metric unit", () => {
    const d = computeManualSensorDelta("ec", 1.3, 1.6);
    expect(d?.direction).toBe("down");
    expect(d?.label).toBe("-0.30 since last log");
  });
  it("temp delta is rounded with °F unit", () => {
    const d = computeManualSensorDelta("temp_f", 77, 75);
    expect(d?.label).toBe("+2°F since last log");
  });
  it("humidity delta is rounded with %", () => {
    const d = computeManualSensorDelta("humidity_percent", 54, 58);
    expect(d?.label).toBe("-4% since last log");
  });
  it("flat below per-metric epsilon", () => {
    expect(computeManualSensorDelta("ph", 6.0, 6.02)?.direction).toBe("flat");
    expect(computeManualSensorDelta("ec", 1.40, 1.402)?.direction).toBe("flat");
    expect(computeManualSensorDelta("temp_f", 77, 77.2)?.direction).toBe("flat");
  });
  it("never returns 'good/bad' or recommendation text", () => {
    const d = computeManualSensorDelta("ph", 6.2, 6.0);
    expect(d?.label).not.toMatch(/good|bad|too high|too low|add|reduce|nutrient/i);
  });
});

describe("deriveLatestManualReadings", () => {
  const baseDetails = (snap: Record<string, unknown>) => ({
    manual_sensor_snapshot: { source: "manual", ...snap },
  });

  it("picks newest non-null value per metric and ignores empties", () => {
    const rows = [
      { entry_at: hoursAgo(1), details: baseDetails({ temp_f: 77, humidity_percent: null }) },
      { entry_at: hoursAgo(5), details: baseDetails({ humidity_percent: 50.4, ph: 6.1 }) },
      { entry_at: hoursAgo(48), details: baseDetails({ ph: 6.0, ec: 1.4 }) },
    ];
    const out = deriveLatestManualReadings(rows);
    expect(out.temp_f?.value).toBe(77);
    expect(out.humidity_percent?.value).toBe(50.4);
    expect(out.ph?.value).toBe(6.1); // newer wins over hoursAgo(48)
    expect(out.ec?.value).toBe(1.4);
  });

  it("ignores snapshots whose source is not 'manual' (no demo/live blending)", () => {
    const rows = [
      { entry_at: hoursAgo(1), details: { manual_sensor_snapshot: { source: "live", ph: 9.9 } } },
      { entry_at: hoursAgo(2), details: { manual_sensor_snapshot: { source: "demo", ph: 8.8 } } },
      { entry_at: hoursAgo(3), details: baseDetails({ ph: 6.0 }) },
    ];
    const out = deriveLatestManualReadings(rows);
    expect(out.ph?.value).toBe(6.0);
  });

  it("returns nulls when no manual snapshot present", () => {
    const out = deriveLatestManualReadings([
      { entry_at: hoursAgo(1), details: { note: "hi" } as unknown },
    ]);
    expect(out).toEqual({
      temp_f: null,
      humidity_percent: null,
      ph: null,
      ec: null,
    });
  });
});

// ---------- Source-level safety contract ----------
const FRESH = read("src/lib/manualSensorFreshnessRules.ts");
const DELTA = read("src/lib/manualSensorDeltaRules.ts");
const HOOK = read("src/hooks/usePlantManualSensorHistory.ts");
const CARD = read("src/components/PlantManualSensorFreshnessCard.tsx");
const QUICK = read("src/components/PlantQuickLog.tsx");

describe("Gate 1B safety contract (source-level)", () => {
  const SOURCES = { FRESH, DELTA, HOOK, CARD, QUICK };

  it("never writes to alerts / action_queue / sensor_readings / tents / plants", () => {
    const forbidden = [
      "alerts",
      "alert_events",
      "action_queue",
      "action_queue_events",
      "sensor_readings",
      "tents",
      "plants",
      "pi_ingest_idempotency_keys",
      "pi_ingest_bridge_credentials",
    ];
    for (const [name, src] of Object.entries(SOURCES)) {
      for (const t of forbidden) {
        expect(
          src,
          `${name} should not reference table ${t}`,
        ).not.toMatch(new RegExp(`\\.from\\(["']${t}["']\\)`));
      }
    }
  });

  it("freshness/delta surfaces never write at all", () => {
    for (const src of [FRESH, DELTA, HOOK, CARD]) {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.upsert\(/);
    }
  });

  it("Quick Log payload still omits user_id (no client-trusted ownership)", () => {
    expect(QUICK).not.toMatch(/user_id\s*:/);
  });

  it("no AI / chat / automation / device-control / pi-ingest / csv strings", () => {
    const banned =
      /openai|gpt|anthropic|ai[-_]?coach|ai[-_]?doctor|mqtt|home[\s_-]?assistant|webhook|relay|actuator|service_role|autopilot|auto[-_ ]?execute|csv|pi[-_]?ingest/i;
    for (const [name, src] of Object.entries(SOURCES)) {
      expect(src, `${name} contains banned automation/integration string`).not.toMatch(banned);
    }
  });

  it("freshness helper never claims 'dangerous' / never creates alert language", () => {
    expect(FRESH).not.toMatch(/danger|alert|warning|risk/i);
    expect(CARD).not.toMatch(/danger|risk|warning/i);
  });

  it("delta helper carries no nutrient/pH advice strings", () => {
    expect(DELTA).not.toMatch(/nutrient|recommend|advice|good|bad/i);
  });
});
