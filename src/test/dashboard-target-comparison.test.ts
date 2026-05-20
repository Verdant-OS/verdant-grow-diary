/**
 * Tests for the scoped Dashboard "Target Comparison" card.
 *
 * Pure-helper unit tests + static-inspection contract tests for the hook
 * and Dashboard wiring.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_SNAPSHOT,
  type SensorSnapshot,
} from "@/lib/sensorSnapshot";
import {
  STATUS_HEADLINE,
  compareSnapshotToTargets,
  type GrowTargets,
} from "@/lib/environmentTargetComparison";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const HOOK = readFileSync(resolve(ROOT, "src/hooks/useGrowTargets.ts"), "utf8");
const HELPER = readFileSync(
  resolve(ROOT, "src/lib/environmentTargetComparison.ts"),
  "utf8",
);

const AI_COACH_CALL = /["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/;
const EXTERNAL_CONTROL =
  /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i;
const SERVICE_ROLE = /service_role/;
const WRITE_PATH =
  /\.from\([^)]+\)\s*\.(insert|update|delete|upsert)/;
const PLANT_HEALTH_HEADLINE =
  /\b(healthy|unhealthy|disease|deficien|plant\s+health)/i;
const FAKE_TARGET_DEFAULT =
  /target[s]?\s*=\s*\{\s*temp\s*:\s*\{\s*min\s*:\s*\d/i;

function fresh(snap: Partial<SensorSnapshot>): SensorSnapshot {
  return {
    ...EMPTY_SNAPSHOT,
    source: "live",
    ts: new Date().toISOString(),
    ...snap,
  };
}

const FULL_TARGETS: GrowTargets = {
  temp: { min: 20, max: 28 },
  rh: { min: 40, max: 65 },
  vpd: { min: 0.6, max: 1.5 },
  soil: { min: 30, max: 70 },
  soil_ec: { min: 1.0, max: 2.5 },
  soil_temp: { min: 18, max: 26 },
  ppfd: { min: 300, max: 900 },
};

describe("compareSnapshotToTargets", () => {
  it("returns unavailable for null snapshot", () => {
    const r = compareSnapshotToTargets(null, FULL_TARGETS);
    expect(r.status).toBe("unavailable");
    expect(r.headline).toBe(STATUS_HEADLINE.unavailable);
  });

  it("returns unavailable for EMPTY_SNAPSHOT", () => {
    const r = compareSnapshotToTargets(EMPTY_SNAPSHOT, FULL_TARGETS);
    expect(r.status).toBe("unavailable");
  });

  it("returns missing_targets when no targets configured", () => {
    const r = compareSnapshotToTargets(fresh({ temp: 24 }), null);
    expect(r.status).toBe("missing_targets");
    expect(r.headline).toBe(STATUS_HEADLINE.missing_targets);
    expect(r.reasons[0]).toMatch(/no grow targets/i);
  });

  it("returns missing_targets when targets object is empty", () => {
    const r = compareSnapshotToTargets(fresh({ temp: 24 }), {});
    expect(r.status).toBe("missing_targets");
  });

  it("returns in_range when all present values fit", () => {
    const r = compareSnapshotToTargets(
      fresh({
        temp: 24,
        rh: 55,
        vpd: 1.1,
        soil: 50,
        soil_ec: 1.8,
        soil_temp: 22,
        ppfd: 600,
      }),
      FULL_TARGETS,
    );
    expect(r.status).toBe("in_range");
    expect(r.headline).toBe(STATUS_HEADLINE.in_range);
    expect(r.reasons).toEqual([]);
  });

  it("returns out_of_range when a metric is low", () => {
    const r = compareSnapshotToTargets(
      fresh({ temp: 10, rh: 55, vpd: 1.1 }),
      FULL_TARGETS,
    );
    expect(r.status).toBe("out_of_range");
    const temp = r.metrics.find((m) => m.metric === "temp")!;
    expect(temp.state).toBe("low");
    expect(r.reasons.some((x) => /below target/i.test(x))).toBe(true);
  });

  it("returns out_of_range when a metric is high", () => {
    const r = compareSnapshotToTargets(
      fresh({ temp: 24, rh: 99, vpd: 1.1 }),
      FULL_TARGETS,
    );
    expect(r.status).toBe("out_of_range");
    const rh = r.metrics.find((m) => m.metric === "rh")!;
    expect(rh.state).toBe("high");
  });

  it("marks missing_value when snapshot has no value", () => {
    const r = compareSnapshotToTargets(fresh({ temp: 24 }), FULL_TARGETS);
    const rh = r.metrics.find((m) => m.metric === "rh")!;
    expect(rh.state).toBe("missing_value");
    expect(rh.value).toBeNull();
  });

  it("marks missing_target when target is absent for a metric", () => {
    const partial: GrowTargets = { temp: { min: 20, max: 28 } };
    const r = compareSnapshotToTargets(
      fresh({ temp: 24, rh: 55, vpd: 1.1 }),
      partial,
    );
    const rh = r.metrics.find((m) => m.metric === "rh")!;
    expect(rh.state).toBe("missing_target");
  });

  it("never returns plant-health language in headlines", () => {
    for (const status of [
      "in_range",
      "out_of_range",
      "missing_targets",
      "unavailable",
    ] as const) {
      expect(PLANT_HEALTH_HEADLINE.test(STATUS_HEADLINE[status])).toBe(false);
    }
  });
});

describe("useGrowTargets hook contract", () => {
  it("queries the grow_targets table by grow_id", () => {
    expect(HOOK).toMatch(/from\(["']grow_targets["']\)/);
    expect(HOOK).toMatch(/\.eq\(["']grow_id["']/);
  });
  it("introduces no write paths", () => {
    expect(WRITE_PATH.test(HOOK)).toBe(false);
  });
  it("introduces no ai-coach call", () => {
    expect(AI_COACH_CALL.test(HOOK)).toBe(false);
  });
  it("introduces no external-control strings", () => {
    expect(EXTERNAL_CONTROL.test(HOOK)).toBe(false);
  });
  it("introduces no service_role", () => {
    expect(SERVICE_ROLE.test(HOOK)).toBe(false);
  });
});

describe("environmentTargetComparison helper safety", () => {
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
});

describe("Dashboard Target Comparison wiring", () => {
  it("imports compareSnapshotToTargets and useGrowTargets", () => {
    expect(DASHBOARD).toMatch(/compareSnapshotToTargets/);
    expect(DASHBOARD).toMatch(/useGrowTargets/);
  });
  it("renders Target Comparison section", () => {
    expect(DASHBOARD).toMatch(/Target Comparison/);
  });
  it("only renders Target Comparison inside scopedGrowId branch", () => {
    const idx = DASHBOARD.indexOf("Target Comparison");
    const scopedIdx = DASHBOARD.indexOf("scopedGrowId ? (");
    expect(idx).toBeGreaterThan(scopedIdx);
  });
  it("does not seed fake default target ranges", () => {
    expect(FAKE_TARGET_DEFAULT.test(DASHBOARD)).toBe(false);
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
