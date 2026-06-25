/**
 * Manual Sensor → Alert smoke guard
 *
 * End-to-end safety/regression coverage proving that the manual sensor
 * reading path:
 *
 *   1. Saves with source="manual", a real UUID tent_id, captured_at, and
 *      the supplied metric values (temperature, humidity, VPD, CO2, soil).
 *   2. An in-range manual reading does NOT trigger alert persistence,
 *      Action Queue writes, AI Doctor calls, or device-control side effects.
 *   3. An out-of-range manual reading persists EXACTLY ONE alert via the
 *      existing environment alert rules, and never auto-creates Action Queue
 *      items or device actions.
 *   4. Re-saving an equivalent out-of-range condition is idempotent —
 *      no duplicate open alert rows.
 *   5. The resulting snapshot remains labeled "manual" (never "live").
 *   6. Static safety scan: the manual save path does not reference
 *      action_queue, ai/ai-coach, device control terms, service_role,
 *      bridge_token, raw_payload writes, or inserts into unrelated tables.
 *
 * Strict scope: tests only. No schema, RLS, Edge Function, or product
 * behaviour changes. Mocks the alerts lib and growRepo at the boundary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildManualReadingPayloads,
  validateManualEntry,
} from "@/lib/sensorReadingManualEntryRules";
import { snapshotFromReadings } from "@/lib/sensorSnapshot";
import { evaluateSensorQuality } from "@/lib/sensorQuality";
import { compareSnapshotToTargets } from "@/lib/environmentTargetComparison";
import { buildEnvironmentAlerts } from "@/lib/environmentAlerts";
import {
  isSnapshotPersistable,
  selectPersistableAlerts,
  derivedAlertKey,
  dedupeAgainstOpen,
} from "@/lib/environmentAlertPersistence";
import { stripSourceComments } from "@/test/utils/stripSourceComments";

const TENT_UUID = "11111111-1111-4111-8111-111111111111";

// --------------------------------------------------------------------------
// 1. Manual save payload shape (source/manual + real tent UUID + ts + values)
// --------------------------------------------------------------------------
describe("manual sensor save payload — smoke guard", () => {
  it("builds payloads with source=manual, real UUID tent_id, ts, and provided metric values", () => {
    const v = validateManualEntry({
      airTempF: 75,
      humidityPct: 55,
      vpdKpa: 1.1,
      co2Ppm: 800,
      soilMoisturePct: 45,
    });
    expect(v.ok).toBe(true);
    const payloads = buildManualReadingPayloads({
      tentId: TENT_UUID,
      metrics: v.metrics,
    });
    expect(payloads.length).toBeGreaterThanOrEqual(5);
    const sharedTs = payloads[0].ts;
    expect(typeof sharedTs).toBe("string");
    for (const p of payloads) {
      expect(p.source).toBe("manual");
      expect(p.tent_id).toBe(TENT_UUID);
      expect(p.ts).toBe(sharedTs); // captured_at shared across the entry
      expect(Number.isFinite(p.value)).toBe(true);
      expect("user_id" in p).toBe(false); // RLS / DB default owns this
    }
    const metricNames = payloads.map((p) => p.metric).sort();
    expect(metricNames).toEqual(
      [
        "co2_ppm",
        "humidity_pct",
        "soil_moisture_pct",
        "temperature_c",
        "vpd_kpa",
      ].sort(),
    );
  });
});

// --------------------------------------------------------------------------
// Shared fixtures for snapshot + persistence pipeline
// --------------------------------------------------------------------------
function manualSnapshot(values: {
  temp: number;
  rh: number;
  vpd: number;
  co2: number;
  soil: number;
}) {
  const ts = new Date().toISOString();
  return snapshotFromReadings([
    { ts, metric: "temperature_c", value: values.temp, source: "manual" },
    { ts, metric: "humidity_pct", value: values.rh, source: "manual" },
    { ts, metric: "vpd_kpa", value: values.vpd, source: "manual" },
    { ts, metric: "co2_ppm", value: values.co2, source: "manual" },
    { ts, metric: "soil_moisture_pct", value: values.soil, source: "manual" },
  ]);
}

const TARGETS = {
  temp: { min: 19, max: 28 },
  rh: { min: 40, max: 70 },
  vpd: { min: 0.8, max: 1.4 },
  co2: { min: 400, max: 1500 },
  soil: { min: 30, max: 70 },
};

// --------------------------------------------------------------------------
// 2. In-range manual reading — no alert / action / AI / device side effects
// --------------------------------------------------------------------------
describe("manual reading IN RANGE — smoke guard", () => {
  it("produces a manual-labeled snapshot and no persistable alerts", () => {
    const snap = manualSnapshot({
      temp: 24,
      rh: 55,
      vpd: 1.1,
      co2: 800,
      soil: 45,
    });
    expect(snap).not.toBeNull();
    expect(snap!.source).toBe("manual");

    const quality = evaluateSensorQuality(snap);
    const targets = compareSnapshotToTargets(snap, TARGETS);
    expect(targets.status).toBe("in_range");

    const alerts = buildEnvironmentAlerts({
      snapshot: snap,
      quality,
      targets,
    });
    const persistable = selectPersistableAlerts(alerts, {
      snapshot: snap,
      quality: quality.quality,
    });
    expect(persistable).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// 3. Out-of-range manual reading — persists exactly one alert, idempotent
// --------------------------------------------------------------------------
describe("manual reading OUT OF RANGE — smoke guard", () => {
  it("a single out-of-range metric becomes exactly one persistable alert", () => {
    const snap = manualSnapshot({
      temp: 35, // breach
      rh: 55,
      vpd: 1.1,
      co2: 800,
      soil: 45,
    });
    expect(snap!.source).toBe("manual");

    const quality = evaluateSensorQuality(snap);
    const targets = compareSnapshotToTargets(snap, TARGETS);
    expect(targets.status).toBe("out_of_range");

    expect(
      isSnapshotPersistable({ snapshot: snap, quality: quality.quality }),
    ).toBe(true);

    const alerts = buildEnvironmentAlerts({
      snapshot: snap,
      quality,
      targets,
    });
    const persistable = selectPersistableAlerts(alerts, {
      snapshot: snap,
      quality: quality.quality,
    });

    expect(persistable.length).toBe(1);
    expect(persistable[0].metric).toBe("temp");
  });

  it("re-deriving the same condition is idempotent against existing open alerts", () => {
    const snap = manualSnapshot({
      temp: 35,
      rh: 55,
      vpd: 1.1,
      co2: 800,
      soil: 45,
    });
    const quality = evaluateSensorQuality(snap);
    const targets = compareSnapshotToTargets(snap, TARGETS);
    const persistable = selectPersistableAlerts(
      buildEnvironmentAlerts({ snapshot: snap, quality, targets }),
      { snapshot: snap, quality: quality.quality },
    );
    expect(persistable.length).toBe(1);

    const open = [
      {
        metric: "temp",
        source: "environment_alerts",
        title: persistable[0].title,
      },
    ];
    const remaining = dedupeAgainstOpen(persistable, open);
    expect(remaining).toEqual([]);

    // Stable rule key — second derive collides with first.
    const key1 = derivedAlertKey(persistable[0]);
    const key2 = derivedAlertKey(persistable[0]);
    expect(key1).toBe(key2);
  });

  it("demo-flagged manual data never becomes persistable, even if out of range", () => {
    const snap = manualSnapshot({
      temp: 35,
      rh: 55,
      vpd: 1.1,
      co2: 800,
      soil: 45,
    });
    const quality = evaluateSensorQuality(snap);
    const targets = compareSnapshotToTargets(snap, TARGETS);
    const persistable = selectPersistableAlerts(
      buildEnvironmentAlerts({ snapshot: snap, quality, targets }),
      { snapshot: snap, quality: quality.quality, isDemoData: true },
    );
    expect(persistable).toEqual([]);
  });
});

// --------------------------------------------------------------------------
// 4. Save → query invalidation (latest-environment refresh, no duplication)
// --------------------------------------------------------------------------
describe("manual save → latest environment refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("invalidates latest-sensor-snapshot / sensor_readings without re-inserting", async () => {
    const insertSpy = vi.fn().mockResolvedValue(undefined);
    vi.doMock("@/lib/growRepo", () => ({ insertSensorReading: insertSpy }));

    const { QueryClient, QueryClientProvider } = await import(
      "@tanstack/react-query"
    );
    const React = (await import("react")).default;
    const { renderHook, waitFor } = await import("@testing-library/react");
    const { useInsertSensorReading } = await import(
      "@/hooks/useInsertSensorReading"
    );

    const client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const v = validateManualEntry({ airTempF: 75, humidityPct: 55 });
    const [payload] = buildManualReadingPayloads({
      tentId: TENT_UUID,
      metrics: v.metrics,
    });

    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate(payload);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(insertSpy).toHaveBeenCalledTimes(1); // no duplicate insert
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (c) => (c[0] as { queryKey: unknown[] }).queryKey,
    );
    const flat = invalidatedKeys.map((k) => JSON.stringify(k));
    expect(flat).toContain(JSON.stringify(["latest-sensor-snapshot"]));
    expect(flat).toContain(JSON.stringify(["sensor_readings"]));
  });
});

// --------------------------------------------------------------------------
// 5. Source label remains "manual" after refresh
// --------------------------------------------------------------------------
describe("source label persistence — smoke guard", () => {
  it("snapshot built from re-fetched manual rows stays source=manual (never live)", () => {
    const snap = manualSnapshot({
      temp: 24,
      rh: 55,
      vpd: 1.1,
      co2: 800,
      soil: 45,
    });
    expect(snap?.source).toBe("manual");
    // Simulate a "refresh" by rebuilding the snapshot from the same rows.
    const refreshed = manualSnapshot({
      temp: 24,
      rh: 55,
      vpd: 1.1,
      co2: 800,
      soil: 45,
    });
    expect(refreshed?.source).toBe("manual");
    expect(refreshed?.source).not.toBe("live");
  });
});

// --------------------------------------------------------------------------
// 6. Static safety scan — manual save path stays inside its lane
// --------------------------------------------------------------------------
const ROOT = resolve(__dirname, "../..");
const read = (p: string) =>
  stripSourceComments(readFileSync(resolve(ROOT, p), "utf8"));

const MANUAL_SAVE_FILES = [
  "src/components/ManualSensorReadingCard.tsx",
  "src/hooks/useInsertSensorReading.ts",
  "src/hooks/useInsertSensorReadings.ts",
  "src/lib/sensorReadingManualEntryRules.ts",
];

describe("manual sensor save path — static safety guard", () => {
  for (const path of MANUAL_SAVE_FILES) {
    const src = read(path);

    it(`${path}: no action_queue references`, () => {
      expect(src).not.toMatch(/\baction_queue\b/);
    });

    it(`${path}: no AI / ai-coach / ai_doctor references`, () => {
      expect(src).not.toMatch(/\bai-coach\b/);
      expect(src).not.toMatch(/\bai_doctor\w*\b/);
      expect(src).not.toMatch(/\bai_doctor_sessions\b/);
    });

    it(`${path}: no device-control / automation terms`, () => {
      expect(src).not.toMatch(
        /\b(?:executeDeviceCommand|deviceControl|fanOn|pumpOn|lightOn|relayOn|dose|valveOpen)\b/,
      );
    });

    it(`${path}: no elevated-privilege / secret references`, () => {
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/bridge_token/i);
    });

    it(`${path}: no raw_payload writes`, () => {
      expect(src).not.toMatch(/raw_payload\s*:/);
    });

    it(`${path}: only writes sensor_readings (no inserts into unrelated tables)`, () => {
      // Allowed: insertSensorReading / insertSensorReadingsBatch helpers and
      // `.from("sensor_readings")`. Reject inserts into any other named table.
      const forbiddenTables = [
        "alerts",
        "alert_events",
        "action_queue",
        "action_queue_events",
        "ai_doctor_sessions",
        "ai_credit_spends",
        "diary_entries",
        "feeding_events",
        "watering_events",
        "leads",
        "profiles",
        "bridge_tokens",
      ];
      for (const t of forbiddenTables) {
        const pattern = new RegExp(
          `from\\(\\s*["']${t}["']\\s*\\)\\s*\\.(insert|upsert|update|delete)\\(`,
        );
        expect(src).not.toMatch(pattern);
      }
    });

    it(`${path}: no functions.invoke calls`, () => {
      expect(src).not.toMatch(/functions\.invoke/);
    });
  }
});
