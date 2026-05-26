import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

import {
  buildManualReadingPayloads,
  computeVpdKpa,
  fahrenheitToCelsius,
  validateManualEntry,
} from "@/lib/sensorReadingManualEntryRules";
import { typedWateringWriteEnabled } from "@/lib/featureFlags";
import { findMatches } from "./testFileSearchRules";

describe("sensorReadingManualEntryRules — pure validation", () => {
  it("accepts a normal manual reading", () => {
    const v = validateManualEntry({
      airTempF: 75,
      humidityPct: 55,
      co2Ppm: 800,
      soilMoisturePct: 45,
    });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
    expect(v.warnings).toEqual([]);
    // temp_c, humidity, co2, soil, vpd(derived) = 5 metrics
    expect(v.metrics.map((m) => m.metric).sort()).toEqual(
      ["co2_ppm", "humidity_pct", "soil_moisture_pct", "temperature_c", "vpd_kpa"].sort(),
    );
    expect(v.metrics.find((m) => m.metric === "vpd_kpa")?.derived).toBe(true);
  });

  it("rejects an empty reading", () => {
    const v = validateManualEntry({});
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/at least one/i);
  });

  it("rejects impossible humidity, pH-like ranges via humidity bound, negative CO2", () => {
    const high = validateManualEntry({ humidityPct: 120 });
    expect(high.ok).toBe(false);
    expect(high.errors.some((e) => /humidity/i.test(e))).toBe(true);

    const neg = validateManualEntry({ co2Ppm: -1 });
    expect(neg.ok).toBe(false);
    expect(neg.errors.some((e) => /co/i.test(e.toLowerCase()))).toBe(true);

    const negVpd = validateManualEntry({ vpdKpa: -0.5, airTempF: 75 });
    expect(negVpd.ok).toBe(false);
    expect(negVpd.errors.some((e) => /vpd/i.test(e))).toBe(true);
  });

  it("rejects impossible soil water content", () => {
    const v = validateManualEntry({ soilMoisturePct: 250 });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /soil water/i.test(e))).toBe(true);
  });

  it("warns on suspicious but possible values", () => {
    const v = validateManualEntry({ airTempF: 110, humidityPct: 95, vpdKpa: 3.0 });
    expect(v.warnings.length).toBeGreaterThanOrEqual(2);
    expect(v.warnings.join(" ")).toMatch(/temp|humidity|vpd/i);
    // Still ok=true: warnings do not block save.
    expect(v.ok).toBe(true);
  });

  it("converts °F to °C and auto-derives VPD when not supplied", () => {
    expect(fahrenheitToCelsius(77)).toBeCloseTo(25, 1);
    const vpd = computeVpdKpa(25, 50);
    expect(vpd).toBeGreaterThan(1.0);
    expect(vpd).toBeLessThan(2.0);
  });
});

describe("buildManualReadingPayloads", () => {
  it("marks source='manual' and never includes user_id", () => {
    const v = validateManualEntry({ airTempF: 75, humidityPct: 55 });
    const payloads = buildManualReadingPayloads({ tentId: "tent-1", metrics: v.metrics });
    expect(payloads.length).toBeGreaterThan(0);
    for (const p of payloads) {
      expect(p.source).toBe("manual");
      expect(p.tent_id).toBe("tent-1");
      expect(Number.isFinite(p.value)).toBe(true);
      expect(typeof p.ts).toBe("string");
      // ownership comes from DB default auth.uid(); never include user_id.
      expect("user_id" in p).toBe(false);
    }
  });

  it("shares a single timestamp across metrics in one entry", () => {
    const v = validateManualEntry({ airTempF: 75, humidityPct: 55, co2Ppm: 800 });
    const payloads = buildManualReadingPayloads({ tentId: "tent-1", metrics: v.metrics });
    const tsSet = new Set(payloads.map((p) => p.ts));
    expect(tsSet.size).toBe(1);
  });
});

describe("hook + save side effects", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("invalidates sensor query keys on success and forwards payload without user_id", async () => {
    vi.doMock("@/lib/growRepo", () => ({ insertSensorReading: vi.fn().mockResolvedValue(undefined) }));
    const repo = await import("@/lib/growRepo");
    const { QueryClient, QueryClientProvider } = await import("@tanstack/react-query");
    const React = (await import("react")).default;
    const { renderHook, waitFor } = await import("@testing-library/react");
    const { useInsertSensorReading } = await import("@/hooks/useInsertSensorReading");

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);

    const v = validateManualEntry({ airTempF: 75, humidityPct: 55 });
    const [payload] = buildManualReadingPayloads({ tentId: "tent-1", metrics: v.metrics });

    const { result } = renderHook(() => useInsertSensorReading(), { wrapper });
    result.current.mutate(payload as any);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect((repo.insertSensorReading as any).mock.calls[0][0]).toEqual(payload);
    expect("user_id" in (repo.insertSensorReading as any).mock.calls[0][0]).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["grow", "sensors"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["sensor_readings"] });
  });
});

describe("safety — manual sensor form does not write to other systems", () => {
  const card = readFileSync("src/components/ManualSensorReadingCard.tsx", "utf8");
  const rules = readFileSync("src/lib/sensorReadingManualEntryRules.ts", "utf8");

  it("does not call create_watering_event, alerts, action_queue, ai-coach, or service_role", () => {
    const sources = card + "\n" + rules;
    expect(sources).not.toMatch(/create_watering_event/);
    expect(sources).not.toMatch(/from\(["']alerts["']\)/);
    expect(sources).not.toMatch(/from\(["']action_queue/);
    expect(sources).not.toMatch(/ai-coach/);
    expect(sources).not.toMatch(/service_role/i);
  });

  it("typedWateringWriteEnabled remains false", () => {
    expect(typedWateringWriteEnabled).toBe(false);
  });

  it("does not modify Leads", () => {
    const sources = readFileSync("src/components/ManualSensorReadingCard.tsx", "utf8");
    expect(sources).not.toMatch(/leads/i);
  });

  it("no runtime UI code calls create_watering_event", () => {
    const hits = findMatches(
      ["src/components", "src/pages", "src/hooks"],
      "create_watering_event",
    );
    expect(hits).toEqual([]);
  });
});

describe("UI integration", () => {
  it("Sensors page mounts ManualSensorReadingCard", () => {
    const src = readFileSync("src/pages/Sensors.tsx", "utf8");
    expect(src).toMatch(/ManualSensorReadingCard/);
  });
});

describe("Dashboard latest-snapshot consumption of manual readings", () => {
  it("snapshotFromReadings treats a manual row as a real (non-demo) snapshot", async () => {
    const { snapshotFromReadings, isStale } = await import("@/lib/sensorSnapshot");
    const ts = new Date().toISOString();
    const snap = snapshotFromReadings([
      { ts, metric: "temperature_c", value: 24, source: "manual" },
      { ts, metric: "humidity_pct", value: 55, source: "manual" },
    ]);
    expect(snap).not.toBeNull();
    expect(snap?.source).toBe("manual");
    expect(snap?.temp).toBe(24);
    expect(snap?.rh).toBe(55);
    expect(isStale(snap!.ts)).toBe(false);
  });

  it("environment alert persistence accepts manual but rejects demo source", async () => {
    const { isSnapshotPersistable } = await import("@/lib/environmentAlertPersistence");
    const ts = new Date().toISOString();
    const manualSnap = { source: "manual", ts, temp: 24, rh: 55, vpd: null, co2: null, soil: null, soil_ec: null, soil_temp: null, ppfd: null } as any;
    expect(isSnapshotPersistable({ snapshot: manualSnap, quality: "good" })).toBe(true);
    expect(isSnapshotPersistable({ snapshot: manualSnap, quality: "good", isDemoData: true })).toBe(false);
  });
});
