/**
 * Tests for the scoped Dashboard "Environment Trends" card.
 *
 * Pure-helper unit tests for src/lib/environmentTrends.ts plus
 * static-inspection contract tests for the hook and Dashboard wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_TRENDS,
  TREND_HEADLINE,
  computeEnvironmentTrends,
  samplesFromDiary,
  samplesFromReadings,
  selectWindow,
  type EnvironmentSample,
} from "@/lib/environmentTrends";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const HOOK = readFileSync(resolve(ROOT, "src/hooks/useEnvironmentTrends.ts"), "utf8");
const HELPER = readFileSync(resolve(ROOT, "src/lib/environmentTrends.ts"), "utf8");

const AI_COACH_CALL = /["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/;
const EXTERNAL_CONTROL = /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i;
const SERVICE_ROLE = /service_role/;
const WRITE_PATH = /\.from\(['"][^'"]+['"]\)\s*\.(insert|update|delete|upsert|rpc)/;
const PLANT_HEALTH = /\b(healthy|unhealthy|disease|deficien|plant\s+health|diagnos|recommend)/i;

const NOW = new Date("2026-05-20T12:00:00Z").getTime();
const PHYSICAL_WINDOWS_PAYLOAD = {
  vendor: "ecowitt_windows_testbench",
  metadata: {
    reported_verdant_source: "live",
    raw_payload: {
      stationtype: "GW2000A_V3.2.4",
      model: "GW2000A",
      dateutc: "2026-05-20 11:00:00",
    },
  },
};

function s(offsetMs: number, fields: Partial<EnvironmentSample> = {}): EnvironmentSample {
  return {
    ts: new Date(NOW - offsetMs).toISOString(),
    temp: null,
    rh: null,
    vpd: null,
    source: "live",
    ...fields,
  };
}

describe("computeEnvironmentTrends", () => {
  it("returns empty for null/[]", () => {
    expect(computeEnvironmentTrends(null)).toEqual(EMPTY_TRENDS);
    expect(computeEnvironmentTrends([])).toEqual(EMPTY_TRENDS);
  });

  it("returns empty when all samples lack usable metrics", () => {
    const r = computeEnvironmentTrends([s(1000), s(2000)]);
    expect(r.status).toBe("empty");
  });

  it("returns limited when fewer than 3 usable samples", () => {
    const r = computeEnvironmentTrends([
      s(1000, { temp: 24, rh: 55, vpd: 1.1 }),
      s(2000, { temp: 23, rh: 56, vpd: 1.0 }),
    ]);
    expect(r.status).toBe("limited");
    expect(r.headline).toBe(TREND_HEADLINE.limited);
    expect(r.count).toBe(2);
  });

  it("computes averages, min, max and ignores null/invalid", () => {
    const samples = [
      s(1000, { temp: 20, rh: 40, vpd: 0.8 }),
      s(2000, { temp: 24, rh: 60, vpd: 1.2 }),
      s(3000, { temp: 28, rh: 50, vpd: 1.6 }),
      s(4000, { temp: null, rh: null, vpd: null }),
    ];
    const r = computeEnvironmentTrends(samples);
    expect(r.status).toBe("ok");
    expect(r.headline).toBe(TREND_HEADLINE.ok);
    expect(r.temp.count).toBe(3);
    expect(r.temp.avg).toBeCloseTo(24);
    expect(r.temp.min).toBe(20);
    expect(r.temp.max).toBe(28);
    expect(r.rh.avg).toBeCloseTo(50);
    expect(r.vpd.avg).toBeCloseTo(1.2);
    expect(r.count).toBe(3);
  });

  it("latestTs reflects most recent sample", () => {
    const r = computeEnvironmentTrends([
      s(60_000, { temp: 24 }),
      s(1_000, { temp: 25 }),
      s(30_000, { temp: 23 }),
    ]);
    expect(r.latestTs).toBe(new Date(NOW - 1_000).toISOString());
  });

  it("never includes plant-health language in headline", () => {
    for (const status of ["empty", "limited", "ok"] as const) {
      expect(PLANT_HEALTH.test(TREND_HEADLINE[status])).toBe(false);
    }
  });
});

describe("samplesFromReadings", () => {
  it("groups rows by tent+ts and maps metrics", () => {
    const rows = [
      { ts: "2026-05-20T11:00:00Z", metric: "temperature_c", value: 24, tent_id: "t1" },
      { ts: "2026-05-20T11:00:00Z", metric: "humidity_pct", value: 55, tent_id: "t1" },
      { ts: "2026-05-20T11:00:00Z", metric: "vpd_kpa", value: 1.1, tent_id: "t1" },
      { ts: "2026-05-20T10:00:00Z", metric: "temperature_c", value: "bad", tent_id: "t1" },
    ];
    const samples = samplesFromReadings(rows);
    expect(samples).toHaveLength(2);
    const merged = samples.find((s) => s.ts === "2026-05-20T11:00:00Z")!;
    expect(merged.temp).toBe(24);
    expect(merged.rh).toBe(55);
    expect(merged.vpd).toBeCloseTo(1.1);
    const bad = samples.find((s) => s.ts === "2026-05-20T10:00:00Z")!;
    expect(bad.temp).toBeNull();
  });
  it("uses captured_at to keep historical CSV observations distinct from their shared import ts", () => {
    const importedAt = "2026-05-20T12:00:00Z";
    const olderCapturedAt = "2025-01-01T10:00:00Z";
    const newerCapturedAt = "2025-01-01T11:00:00Z";
    const samples = samplesFromReadings([
      {
        ts: importedAt,
        captured_at: olderCapturedAt,
        metric: "temperature_c",
        value: 20,
        source: "csv",
        tent_id: "t1",
      },
      {
        ts: importedAt,
        captured_at: olderCapturedAt,
        metric: "humidity_pct",
        value: 55,
        source: "csv",
        tent_id: "t1",
      },
      {
        ts: importedAt,
        captured_at: newerCapturedAt,
        metric: "temperature_c",
        value: 24,
        source: "csv",
        tent_id: "t1",
      },
      {
        ts: importedAt,
        captured_at: newerCapturedAt,
        metric: "humidity_pct",
        value: 52,
        source: "csv",
        tent_id: "t1",
      },
    ]);

    expect(samples).toHaveLength(2);
    expect(samples.map((sample) => sample.ts).sort()).toEqual([olderCapturedAt, newerCapturedAt]);
    expect(samples.find((sample) => sample.ts === newerCapturedAt)).toMatchObject({
      temp: 24,
      rh: 52,
      source: "csv",
    });
  });

  it("returns [] for null/undefined", () => {
    expect(samplesFromReadings(null)).toEqual([]);
    expect(samplesFromReadings(undefined)).toEqual([]);
  });

  it("excludes canonical-live Windows diagnostics from trend evidence", () => {
    const samples = samplesFromReadings([
      {
        ts: "2026-05-20T11:00:00Z",
        metric: "temperature_c",
        value: 24,
        source: "live",
        tent_id: "t1",
        raw_payload: {
          vendor: "ecowitt_windows_testbench",
          metadata: { confidence: "test", verdant_source: "live" },
        },
      },
    ]);
    expect(samples).toEqual([]);
  });

  it("fails closed when a legacy top-level Windows source lacks provenance", () => {
    expect(
      samplesFromReadings([
        {
          ts: "2026-05-20T11:00:00Z",
          metric: "temperature_c",
          value: 24,
          source: "ecowitt_windows_testbench",
          tent_id: "t1",
          raw_payload: null,
        },
      ]),
    ).toEqual([]);
  });

  it("keeps canonical demo data simulated rather than live", () => {
    const samples = samplesFromReadings([
      {
        ts: "2026-05-20T11:00:00Z",
        metric: "temperature_c",
        value: 24,
        source: "demo",
        tent_id: "t1",
      },
    ]);
    expect(samples).toHaveLength(1);
    expect(samples[0].source).toBe("sim");
  });

  it("keeps physical Windows gateway rows live", () => {
    const samples = samplesFromReadings([
      {
        ts: "2026-05-20T11:00:00Z",
        metric: "temperature_c",
        value: 24,
        source: "live",
        tent_id: "t1",
        raw_payload: PHYSICAL_WINDOWS_PAYLOAD,
      },
    ]);
    expect(samples).toHaveLength(1);
    expect(samples[0].source).toBe("live");
  });
});

describe("samplesFromDiary", () => {
  it("extracts snapshot from diary entries safely", () => {
    const rows = [
      {
        entry_at: "2026-05-20T11:00:00Z",
        details: {
          sensor_snapshot: { temp: 24, rh: 55, vpd: 1.1 },
        },
      },
      { entry_at: "2026-05-20T10:00:00Z", details: null },
      { entry_at: "2026-05-20T09:00:00Z", details: { sensor_snapshot: null } },
    ];
    const samples = samplesFromDiary(rows);
    expect(samples).toHaveLength(1);
    expect(samples[0].source).toBe("diary");
    expect(samples[0].temp).toBe(24);
  });
  it("returns [] for null", () => {
    expect(samplesFromDiary(null)).toEqual([]);
  });
});

describe("selectWindow", () => {
  it("prefers last 24h when present", () => {
    const samples = [s(60 * 60 * 1000, { temp: 24 }), s(48 * 60 * 60 * 1000, { temp: 20 })];
    const out = selectWindow(samples, NOW);
    expect(out).toHaveLength(1);
    expect(out[0].temp).toBe(24);
  });
  it("falls back to latest 20 when nothing in 24h", () => {
    const samples = Array.from({ length: 30 }, (_, i) => s((i + 30) * 60 * 60 * 1000, { temp: i }));
    const out = selectWindow(samples, NOW);
    expect(out).toHaveLength(20);
  });
});

describe("environmentTrends helper safety", () => {
  it("is pure: no Supabase or fetch imports", () => {
    expect(HELPER).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(HELPER).not.toMatch(/\bfetch\(/);
  });
  it("introduces no ai-coach call", () => {
    expect(AI_COACH_CALL.test(HELPER)).toBe(false);
  });
  it("introduces no external-control strings", () => {
    expect(EXTERNAL_CONTROL.test(HELPER)).toBe(false);
  });
  it("introduces no plant-health language", () => {
    expect(PLANT_HEALTH.test(HELPER)).toBe(false);
  });
});

describe("useEnvironmentTrends hook contract", () => {
  it("queries sensor_readings by tent ids", () => {
    expect(HOOK).toMatch(/\.from\(["']sensor_readings["']\)/);
    expect(HOOK).toMatch(/\.in\(["']tent_id["']/);
    expect(HOOK).toMatch(/temperature_c/);
    expect(HOOK).toMatch(/humidity_pct/);
    expect(HOOK).toMatch(/vpd_kpa/);
    expect(HOOK).toMatch(/sensor_readings[\s\S]*?captured_at[\s\S]*?raw_payload/);
    expect(HOOK).toContain("captured_at.gte.${since}");
    expect(HOOK).toContain('.order("captured_at", { ascending: false, nullsFirst: false })');
  });
  it("falls back to diary_entries filtered by grow_id", () => {
    expect(HOOK).toMatch(/\.from\(["']diary_entries["']\)/);
    expect(HOOK).toMatch(/\.eq\(["']grow_id["']/);
  });
  it("introduces no write paths", () => {
    expect(WRITE_PATH.test(HOOK)).toBe(false);
  });
  it("introduces no ai-coach call", () => {
    expect(AI_COACH_CALL.test(HOOK)).toBe(false);
  });
  it("introduces no service_role", () => {
    expect(SERVICE_ROLE.test(HOOK)).toBe(false);
  });
  it("introduces no external-control strings", () => {
    expect(EXTERNAL_CONTROL.test(HOOK)).toBe(false);
  });
});

describe("Dashboard Environment Trends wiring", () => {
  it("imports useEnvironmentTrends", () => {
    expect(DASHBOARD).toMatch(/useEnvironmentTrends/);
  });
  it("renders Environment Trends section", () => {
    expect(DASHBOARD).toMatch(/Environment Trends/);
  });
  it("only renders trends inside scopedGrowId branch", () => {
    const idx = DASHBOARD.indexOf("Environment Trends");
    const scopedIdx = DASHBOARD.indexOf("scopedGrowId ? (");
    expect(idx).toBeGreaterThan(scopedIdx);
  });
  it("Dashboard introduces no ai-coach call", () => {
    expect(AI_COACH_CALL.test(DASHBOARD)).toBe(false);
  });
  it("Dashboard introduces no external-control strings", () => {
    expect(EXTERNAL_CONTROL.test(DASHBOARD)).toBe(false);
  });
  it("Dashboard introduces no service_role", () => {
    expect(SERVICE_ROLE.test(DASHBOARD)).toBe(false);
  });
  it("Dashboard introduces no new write paths", () => {
    expect(WRITE_PATH.test(DASHBOARD)).toBe(false);
  });
});
