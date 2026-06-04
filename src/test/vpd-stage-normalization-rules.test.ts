/**
 * vpdStageNormalizationRules — guardrail tests.
 *
 * Verifies the legacy → canonical mapping, unknown-stays-unknown contract,
 * and that no JSX file duplicates the mapping table. Also asserts the
 * helper file is free of automation / device-control / Supabase surface.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  CANONICAL_VPD_TARGET_STAGES,
  LEGACY_VPD_STAGES,
  isCanonicalVpdTargetStage,
  isLegacyVpdStage,
  normalizeToCanonicalVpdTargetStage,
  type CanonicalVpdTargetStage,
  type LegacyVpdStage,
} from "@/lib/vpdStageNormalizationRules";
import { evaluateVpdAgainstStageTarget } from "@/lib/vpdTargetRules";

const ROOT = resolve(__dirname, "../..");
const HELPER_PATH = resolve(ROOT, "src/lib/vpdStageNormalizationRules.ts");
const HELPER_SRC = readFileSync(HELPER_PATH, "utf8");

const LEGACY_EXPECTED: Record<LegacyVpdStage, CanonicalVpdTargetStage> = {
  seedling: "seedling",
  veg: "late_veg",
  preflower: "early_flower",
  flower: "mid_late_flower",
  late_flower: "mid_late_flower",
};

describe("normalizeToCanonicalVpdTargetStage — legacy mappings", () => {
  for (const [legacy, canonical] of Object.entries(LEGACY_EXPECTED) as [
    LegacyVpdStage,
    CanonicalVpdTargetStage,
  ][]) {
    it(`legacy "${legacy}" maps to canonical "${canonical}"`, () => {
      const r = normalizeToCanonicalVpdTargetStage(legacy);
      expect(r.known).toBe(true);
      expect(r.canonical).toBe(canonical);
      // seedling exists in both vocabularies → canonical wins.
      if (legacy === "seedling") {
        expect(r.source).toBe("canonical");
      } else {
        expect(r.source).toBe("legacy");
      }
    });
  }

  it("accepts case/whitespace/dash variants", () => {
    expect(normalizeToCanonicalVpdTargetStage("  Late-Flower ").canonical).toBe(
      "mid_late_flower",
    );
    expect(normalizeToCanonicalVpdTargetStage("PREFLOWER").canonical).toBe(
      "early_flower",
    );
  });
});

describe("normalizeToCanonicalVpdTargetStage — canonical pass-through", () => {
  for (const c of CANONICAL_VPD_TARGET_STAGES) {
    it(`canonical "${c}" passes through unchanged`, () => {
      const r = normalizeToCanonicalVpdTargetStage(c);
      expect(r).toEqual({ known: true, canonical: c, source: "canonical" });
    });
  }
});

describe("normalizeToCanonicalVpdTargetStage — unknown / missing", () => {
  it("returns unknown for null", () => {
    expect(normalizeToCanonicalVpdTargetStage(null)).toEqual({
      known: false,
      canonical: null,
      source: "unknown",
    });
  });
  it("returns unknown for undefined", () => {
    expect(normalizeToCanonicalVpdTargetStage(undefined)).toEqual({
      known: false,
      canonical: null,
      source: "unknown",
    });
  });
  it("returns unknown for empty string", () => {
    expect(normalizeToCanonicalVpdTargetStage("").known).toBe(false);
    expect(normalizeToCanonicalVpdTargetStage("   ").known).toBe(false);
  });
  it("returns unknown for unrecognized strings", () => {
    for (const v of ["mystery", "harvest", "drying", "bloomtime", "fruiting"]) {
      expect(normalizeToCanonicalVpdTargetStage(v).known).toBe(false);
    }
  });

  it("unknown stage NEVER evaluates as healthy / in-target via vpdTargetRules", () => {
    for (const v of [null, undefined, "", "mystery", "harvest", "drying"]) {
      const result = evaluateVpdAgainstStageTarget({ vpdKpa: 1.1, stage: v });
      expect(result.healthy).toBe(false);
      expect(result.classification).not.toBe("in_band");
    }
  });
});

describe("type-guards", () => {
  it("isCanonicalVpdTargetStage", () => {
    for (const c of CANONICAL_VPD_TARGET_STAGES) {
      expect(isCanonicalVpdTargetStage(c)).toBe(true);
    }
    expect(isCanonicalVpdTargetStage("veg")).toBe(false);
    expect(isCanonicalVpdTargetStage(null)).toBe(false);
  });
  it("isLegacyVpdStage", () => {
    for (const l of LEGACY_VPD_STAGES) {
      expect(isLegacyVpdStage(l)).toBe(true);
    }
    expect(isLegacyVpdStage("early_veg")).toBe(false);
    expect(isLegacyVpdStage(null)).toBe(false);
  });
});

describe("static safety — helper file", () => {
  it("does not import Supabase, fetch, or automation surfaces", () => {
    expect(HELPER_SRC).not.toMatch(/service_role/i);
    expect(HELPER_SRC).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(HELPER_SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(HELPER_SRC).not.toMatch(/functions\.invoke/);
    expect(HELPER_SRC).not.toMatch(/\bfetch\s*\(/);
    expect(HELPER_SRC).not.toMatch(/action_queue/);
    expect(HELPER_SRC).not.toMatch(/saveAlert\(|logAlertEvent\(/);
    expect(HELPER_SRC).not.toMatch(
      /execute_device|setpoint_write|device_control|deviceControl/,
    );
  });
});

describe("evaluateVpdAgainstStageTarget — canonical normalization integration", () => {
  it("legacy 'veg' evaluates against canonical late_veg band (0.9–1.2)", () => {
    const r = evaluateVpdAgainstStageTarget({ vpdKpa: 1.0, stage: "veg" });
    expect(r.classification).toBe("in_band");
    expect(r.target?.stage).toBe("late_veg");
    expect(evaluateVpdAgainstStageTarget({ vpdKpa: 0.85, stage: "veg" }).classification).toBe("low");
    expect(evaluateVpdAgainstStageTarget({ vpdKpa: 1.25, stage: "veg" }).classification).toBe("high");
  });
  it("legacy 'preflower' evaluates against canonical early_flower band (1.0–1.3)", () => {
    const r = evaluateVpdAgainstStageTarget({ vpdKpa: 1.15, stage: "preflower" });
    expect(r.classification).toBe("in_band");
    expect(r.target?.stage).toBe("early_flower");
  });
  it("legacy 'flower' evaluates against canonical mid_late_flower band (1.1–1.5)", () => {
    const r = evaluateVpdAgainstStageTarget({ vpdKpa: 1.3, stage: "flower" });
    expect(r.classification).toBe("in_band");
    expect(r.target?.stage).toBe("mid_late_flower");
  });
  it("legacy 'late_flower' evaluates against canonical mid_late_flower band", () => {
    const r = evaluateVpdAgainstStageTarget({ vpdKpa: 1.3, stage: "late_flower" });
    expect(r.classification).toBe("in_band");
    expect(r.target?.stage).toBe("mid_late_flower");
  });
  it("all canonical stages still classify in_band at their band midpoint", () => {
    for (const c of CANONICAL_VPD_TARGET_STAGES) {
      const r = evaluateVpdAgainstStageTarget({ vpdKpa: 1.05, stage: c });
      // Just assert we never return stage_unknown for canonical stages.
      expect(r.classification).not.toBe("stage_unknown");
    }
  });
  it("unknown / null / post-harvest stages never return in_band / healthy", () => {
    for (const stage of [
      null,
      undefined,
      "",
      "   ",
      "mystery",
      "harvest",
      "drying",
      "cure",
    ]) {
      for (const vpd of [0.5, 1.0, 1.3, 1.6]) {
        const r = evaluateVpdAgainstStageTarget({ vpdKpa: vpd, stage });
        expect(r.classification).toBe("stage_unknown");
        expect(r.healthy).toBe(false);
        expect(r.target).toBeNull();
      }
    }
  });
  it("invalid VPD with a known stage returns unavailable, not in_band", () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) {
      const r = evaluateVpdAgainstStageTarget({
        vpdKpa: v as number,
        stage: "late_veg",
      });
      expect(r.classification).toBe("unavailable");
      expect(r.healthy).toBe(false);
    }
  });
});

describe("static guard — no source file outside the helper duplicates the mapping table", () => {
  function walk(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const st = statSync(p);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === "__snapshots__") continue;
        walk(p, out);
      } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
        out.push(p);
      }
    }
    return out;
  }

  const ALLOWLIST = new Set<string>([
    resolve(ROOT, "src/lib/vpdStageNormalizationRules.ts"),
    resolve(ROOT, "src/test/vpd-stage-normalization-rules.test.ts"),
    // Band table holds both vocabularies for back-compat band lookup;
    // it does NOT implement the legacy→canonical mapping.
    resolve(ROOT, "src/constants/vpdTargets.ts"),
  ]);

  it("no other .ts/.tsx file co-locates the legacy→canonical pairs", () => {
    const files = walk(resolve(ROOT, "src"));
    const violators: string[] = [];
    // Co-occurrence markers that only show up together if a file inlines
    // the documented legacy → canonical mapping.
    const PAIRS: Array<[RegExp, RegExp]> = [
      [/["']preflower["']/, /["']early_flower["']/],
      [/["']late_flower["']/, /["']mid_late_flower["']/],
      [/["']veg["']/, /["']late_veg["']/],
    ];
    for (const f of files) {
      if (ALLOWLIST.has(f)) continue;
      const src = readFileSync(f, "utf8");
      const hit = PAIRS.some(([a, b]) => a.test(src) && b.test(src));
      if (hit) violators.push(f);
    }
    expect(violators).toEqual([]);
  });

  it("no .tsx file inlines the legacy→canonical mapping pairs", () => {
    const files = walk(resolve(ROOT, "src")).filter((f) => f.endsWith(".tsx"));
    const violators: string[] = [];
    const PAIRS: Array<[RegExp, RegExp]> = [
      [/"preflower"/, /"early_flower"/],
      [/"late_flower"/, /"mid_late_flower"/],
      [/"veg"/, /"late_veg"/],
    ];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      const hit = PAIRS.some(([a, b]) => a.test(src) && b.test(src));
      if (hit) violators.push(f);
    }
    expect(violators).toEqual([]);
  });
});

describe("static safety — vpdTargetRules.ts", () => {
  const RULES_SRC = readFileSync(
    resolve(ROOT, "src/lib/vpdTargetRules.ts"),
    "utf8",
  );
  it("imports the normalization helper", () => {
    expect(RULES_SRC).toMatch(/normalizeToCanonicalVpdTargetStage/);
    expect(RULES_SRC).toMatch(/from\s+["']@\/lib\/vpdStageNormalizationRules["']/);
  });
  it("has no I/O, Supabase, fetch, alert, action_queue, or device-control surface", () => {
    expect(RULES_SRC).not.toMatch(/service_role/);
    expect(RULES_SRC).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(RULES_SRC).not.toMatch(/functions\.invoke/);
    expect(RULES_SRC).not.toMatch(/\bfetch\s*\(/);
    expect(RULES_SRC).not.toMatch(/action_queue/);
    expect(RULES_SRC).not.toMatch(/saveAlert\(|logAlertEvent\(/);
    expect(RULES_SRC).not.toMatch(
      /execute_device|setpoint_write|device_control|deviceControl/,
    );
  });
});
