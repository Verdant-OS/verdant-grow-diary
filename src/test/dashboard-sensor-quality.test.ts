/**
 * Tests for the scoped Dashboard "Sensor Data Quality" card.
 *
 * Pure helper tests for src/lib/sensorQuality.ts plus static-inspection
 * tests confirming Dashboard wiring and safety constraints.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_SNAPSHOT,
  type SensorSnapshot,
} from "@/lib/sensorSnapshot";
import {
  QUALITY_HEADLINE,
  evaluateSensorQuality,
} from "@/lib/sensorQuality";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const HELPER = readFileSync(resolve(ROOT, "src/lib/sensorQuality.ts"), "utf8");

const AI_COACH_CALL = /["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/;
const EXTERNAL_CONTROL =
  /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i;
const SERVICE_ROLE = /service_role/;
const WRITE_PATH = /\.from\(['"][^'"]+['"]\)\s*\.(insert|update|delete|upsert)/;

const NOW = new Date("2026-05-20T12:00:00Z").getTime();

function fresh(snap: Partial<SensorSnapshot>): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "live",
    ts: new Date(NOW - 60_000).toISOString(),
    ...snap,
  };
}

describe("evaluateSensorQuality", () => {
  it("returns unavailable for null snapshot", () => {
    const r = evaluateSensorQuality(null, NOW);
    expect(r.quality).toBe("unavailable");
    expect(r.headline).toBe(QUALITY_HEADLINE.unavailable);
  });

  it("returns unavailable for EMPTY_SNAPSHOT", () => {
    const r = evaluateSensorQuality(EMPTY_SNAPSHOT, NOW);
    expect(r.quality).toBe("unavailable");
  });

  it("returns unavailable when all metric values are null", () => {
    const r = evaluateSensorQuality(fresh({}), NOW);
    expect(r.quality).toBe("unavailable");
  });

  it("returns good for a complete, recent snapshot", () => {
    const r = evaluateSensorQuality(
      fresh({
        temp: 24,
        rh: 55,
        vpd: 1.1,
        co2: 800,
        soil: 45,
        soil_ec: 1.8,
        soil_temp: 22,
        ppfd: 600,
      }),
      NOW,
    );
    expect(r.quality).toBe("good");
    expect(r.headline).toBe(QUALITY_HEADLINE.good);
    expect(r.reasons).toEqual([]);
    expect(r.suspiciousFields).toEqual([]);
  });

  it("flags stale snapshot as watch", () => {
    const stale = fresh({
      ts: new Date(NOW - 60 * 60 * 1000).toISOString(),
      temp: 24,
      rh: 55,
      vpd: 1.1,
    });
    const r = evaluateSensorQuality(stale, NOW);
    expect(r.quality).toBe("watch");
    expect(r.reasons.some((x) => /stale/i.test(x))).toBe(true);
  });

  it("flags humidity = 100 as watch", () => {
    const r = evaluateSensorQuality(
      fresh({ temp: 24, rh: 100, vpd: 1.1 }),
      NOW,
    );
    expect(r.quality).toBe("watch");
    expect(r.suspiciousFields).toContain("rh");
  });

  it("flags humidity = 0 as watch", () => {
    const r = evaluateSensorQuality(
      fresh({ temp: 24, rh: 0, vpd: 1.1 }),
      NOW,
    );
    expect(r.quality).toBe("watch");
    expect(r.suspiciousFields).toContain("rh");
  });

  it("flags missing VPD as watch", () => {
    const r = evaluateSensorQuality(fresh({ temp: 24, rh: 55 }), NOW);
    expect(r.quality).toBe("watch");
    expect(r.suspiciousFields).toContain("vpd");
  });

  it("flags implausible temperature", () => {
    const r = evaluateSensorQuality(
      fresh({ temp: 120, rh: 55, vpd: 1.1 }),
      NOW,
    );
    expect(r.quality).toBe("watch");
    expect(r.suspiciousFields).toContain("temp");
  });

  it("flags soil EC unit mismatch (1450 vs 1.45)", () => {
    const r = evaluateSensorQuality(
      fresh({ temp: 24, rh: 55, vpd: 1.1, soil_ec: 1450 }),
      NOW,
    );
    expect(r.quality).toBe("watch");
    expect(r.suspiciousFields).toContain("soil_ec");
    expect(r.reasons.some((x) => /unit/i.test(x))).toBe(true);
  });

  it("flags negative PPFD", () => {
    const r = evaluateSensorQuality(
      fresh({ temp: 24, rh: 55, vpd: 1.1, ppfd: -5 }),
      NOW,
    );
    expect(r.quality).toBe("watch");
    expect(r.suspiciousFields).toContain("ppfd");
  });

  it("flags implausibly high PPFD", () => {
    const r = evaluateSensorQuality(
      fresh({ temp: 24, rh: 55, vpd: 1.1, ppfd: 9999 }),
      NOW,
    );
    expect(r.quality).toBe("watch");
    expect(r.suspiciousFields).toContain("ppfd");
  });

  it("never returns plant-health language", () => {
    const inputs: (SensorSnapshot | null)[] = [
      null,
      EMPTY_SNAPSHOT,
      fresh({ temp: 24, rh: 55, vpd: 1.1 }),
      fresh({ temp: 24, rh: 100, vpd: 1.1, soil_ec: 1450 }),
    ];
    const banned = /\b(healthy|unhealthy|disease|deficien|plant\s+health|diagnos)/i;
    for (const s of inputs) {
      const r = evaluateSensorQuality(s, NOW);
      expect(banned.test(r.headline)).toBe(false);
      for (const reason of r.reasons) {
        expect(banned.test(reason)).toBe(false);
      }
    }
  });
});

describe("sensorQuality helper safety", () => {
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
  it("introduces no service_role", () => {
    expect(SERVICE_ROLE.test(HELPER)).toBe(false);
  });
  it("introduces no write paths", () => {
    expect(WRITE_PATH.test(HELPER)).toBe(false);
  });
});

describe("Dashboard Sensor Data Quality wiring", () => {
  it("imports evaluateSensorQuality", () => {
    expect(DASHBOARD).toMatch(/evaluateSensorQuality/);
  });
  it("renders a Sensor Data Quality section", () => {
    expect(DASHBOARD).toMatch(/Sensor Data Quality/);
  });
  it("only renders quality card inside scopedGrowId branch", () => {
    const idx = DASHBOARD.indexOf("Sensor Data Quality");
    const scopedIdx = DASHBOARD.indexOf("scopedGrowId ? (");
    expect(idx).toBeGreaterThan(-1);
    expect(scopedIdx).toBeGreaterThan(-1);
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
  it("Dashboard introduces no write paths", () => {
    expect(WRITE_PATH.test(DASHBOARD)).toBe(false);
  });
});
