/**
 * Derived VPD calculation + stage target evaluation tests.
 *
 * Safety: pure helpers, no I/O. Also asserts that VPD target tables are
 * not duplicated inside JSX components.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

import {
  calculateAirVpdKpa,
  fahrenheitToCelsius,
} from "@/lib/vpdRules";
import { evaluateVpdAgainstStageTarget } from "@/lib/vpdTargetRules";
import { VPD_STAGE_TARGETS } from "@/constants/vpdTargets";

describe("calculateAirVpdKpa", () => {
  it("calculates ~1.27 kPa for 25C / 60% RH", () => {
    expect(calculateAirVpdKpa({ tempC: 25, rhPercent: 60 })).toBeCloseTo(
      1.27,
      2,
    );
  });

  it("converts Fahrenheit input correctly (77F ≈ 25C)", () => {
    expect(fahrenheitToCelsius(77)).toBeCloseTo(25, 5);
    expect(calculateAirVpdKpa({ tempF: 77, rhPercent: 60 })).toBeCloseTo(
      1.27,
      2,
    );
  });

  it("returns null for missing temp or RH", () => {
    expect(calculateAirVpdKpa({ rhPercent: 60 } as never)).toBeNull();
    expect(
      calculateAirVpdKpa({ tempC: 25, rhPercent: null }),
    ).toBeNull();
    expect(
      calculateAirVpdKpa({ tempC: null, rhPercent: 60 }),
    ).toBeNull();
  });

  it("returns null for RH outside 0..100", () => {
    expect(calculateAirVpdKpa({ tempC: 25, rhPercent: -1 })).toBeNull();
    expect(calculateAirVpdKpa({ tempC: 25, rhPercent: 101 })).toBeNull();
  });

  it("returns null for NaN / Infinity", () => {
    expect(calculateAirVpdKpa({ tempC: NaN, rhPercent: 60 })).toBeNull();
    expect(calculateAirVpdKpa({ tempC: 25, rhPercent: NaN })).toBeNull();
    expect(
      calculateAirVpdKpa({ tempC: Infinity, rhPercent: 60 }),
    ).toBeNull();
    expect(
      calculateAirVpdKpa({ tempC: 25, rhPercent: Infinity }),
    ).toBeNull();
  });

  it("returns null for unrealistic temperatures", () => {
    expect(calculateAirVpdKpa({ tempC: -100, rhPercent: 50 })).toBeNull();
    expect(calculateAirVpdKpa({ tempC: 200, rhPercent: 50 })).toBeNull();
  });

  it("rounds to 2 decimals", () => {
    const v = calculateAirVpdKpa({ tempC: 25, rhPercent: 60 });
    expect(v).not.toBeNull();
    expect(Number((v as number).toFixed(2))).toBe(v);
  });
});

describe("evaluateVpdAgainstStageTarget", () => {
  for (const key of Object.keys(VPD_STAGE_TARGETS) as Array<
    keyof typeof VPD_STAGE_TARGETS
  >) {
    const t = VPD_STAGE_TARGETS[key];
    it(`classifies low / in_band / high for stage ${key}`, () => {
      const low = evaluateVpdAgainstStageTarget({
        vpdKpa: t.minKpa - 0.1,
        stage: key,
      });
      const mid = evaluateVpdAgainstStageTarget({
        vpdKpa: (t.minKpa + t.maxKpa) / 2,
        stage: key,
      });
      const high = evaluateVpdAgainstStageTarget({
        vpdKpa: t.maxKpa + 0.1,
        stage: key,
      });
      expect(low.classification).toBe("low");
      expect(low.healthy).toBe(false);
      expect(mid.classification).toBe("in_band");
      expect(mid.healthy).toBe(true);
      expect(high.classification).toBe("high");
      expect(high.healthy).toBe(false);
    });
  }

  it("never marks unknown stage as healthy", () => {
    const r = evaluateVpdAgainstStageTarget({ vpdKpa: 1.1, stage: null });
    expect(r.classification).toBe("stage_unknown");
    expect(r.healthy).toBe(false);
    const r2 = evaluateVpdAgainstStageTarget({
      vpdKpa: 1.1,
      stage: "not-a-stage",
    });
    expect(r2.classification).toBe("stage_unknown");
    expect(r2.healthy).toBe(false);
  });

  it("returns unavailable for invalid VPD with known stage", () => {
    const r = evaluateVpdAgainstStageTarget({ vpdKpa: null, stage: "veg" });
    expect(r.classification).toBe("unavailable");
    expect(r.healthy).toBe(false);
    expect(r.target?.stage).toBe("veg");
  });
});

describe("no duplicated VPD target tables in JSX components", () => {
  const componentRoots = [
    resolve(__dirname, "../components"),
    resolve(__dirname, "../pages"),
  ];
  function walk(dir: string, out: string[] = []): string[] {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      const s = statSync(p);
      if (s.isDirectory()) walk(p, out);
      else if (p.endsWith(".tsx")) out.push(p);
    }
    return out;
  }
  it("no .tsx file hardcodes the seedling / veg / flower target band literals", () => {
    const files = componentRoots.flatMap((r) => walk(r));
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      // Looks for object/array literals that resemble a stage->band table.
      if (
        /seedling\s*:\s*\{\s*min/i.test(src) ||
        /veg\s*:\s*\{\s*min/i.test(src) ||
        /flower\s*:\s*\{\s*min/i.test(src)
      ) {
        offenders.push(f);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("safety contract — derived VPD modules", () => {
  const files = [
    resolve(__dirname, "../lib/vpdRules.ts"),
    resolve(__dirname, "../lib/vpdTargetRules.ts"),
    resolve(__dirname, "../constants/vpdTargets.ts"),
  ];
  it("no I/O, no automation, no device control, no service_role", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/from\(["'](alerts|action_queue|sensor_readings)["']\)/);
      expect(src).not.toMatch(/functions\.invoke/);
      expect(src).not.toMatch(
        /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b|device_command|autopilot/i,
      );
      expect(src).not.toMatch(/fetch\(|supabase/i);
    }
  });
});
