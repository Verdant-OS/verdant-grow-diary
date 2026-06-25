import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classifySensorMetricState,
  isOptionalMetric,
  isCoreMetric,
  isOptionalMetricInvalid,
  isSoilMoistureStuck,
  type SensorMetricKey,
} from "@/lib/sensorMetricStateRules";

describe("sensorMetricStateRules", () => {
  it("classifies live reading as live + calm + chart", () => {
    const s = classifySensorMetricState({
      metric: "temp",
      value: 24,
      source: "sensor",
      hasAnyReading: true,
    });
    expect(s.kind).toBe("live");
    expect(s.tone).toBe("calm");
    expect(s.showChart).toBe(true);
  });

  it("classifies derived metric as derived + calm + chart", () => {
    const s = classifySensorMetricState({
      metric: "vpd",
      value: 1.2,
      hasAnyReading: true,
      isDerived: true,
    });
    expect(s.kind).toBe("derived");
    expect(s.label).toBe("Derived");
    expect(s.tone).toBe("calm");
  });

  it("classifies stale reading as cautionary", () => {
    const s = classifySensorMetricState({
      metric: "temp",
      value: 22,
      source: "sensor",
      hasAnyReading: true,
      isStale: true,
    });
    expect(s.kind).toBe("stale");
    expect(s.tone).toBe("caution");
  });

  it("classifies invalid telemetry as cautionary even without value", () => {
    const s = classifySensorMetricState({
      metric: "rh",
      value: 0,
      hasAnyReading: true,
      isInvalid: true,
    });
    expect(s.kind).toBe("invalid");
    expect(s.tone).toBe("caution");
  });

  it("optional CO2 with no reading is calm 'Not connected', never red", () => {
    const s = classifySensorMetricState({
      metric: "co2",
      value: null,
      hasAnyReading: false,
    });
    expect(s.kind).toBe("not_connected");
    expect(s.tone).toBe("calm");
    expect(s.isOptionalEmpty).toBe(true);
    expect(s.message.toLowerCase()).not.toContain("unavailable");
    expect(s.message).toMatch(/CO₂/);
  });

  it("optional PPFD with no reading is calm 'Not connected'", () => {
    const s = classifySensorMetricState({
      metric: "ppfd",
      value: null,
      hasAnyReading: false,
    });
    expect(s.kind).toBe("not_connected");
    expect(s.tone).toBe("calm");
    expect(s.message.toLowerCase()).not.toContain("unavailable");
  });

  it("optional soil moisture with no reading is calm", () => {
    const s = classifySensorMetricState({
      metric: "soil",
      value: null,
      hasAnyReading: true,
    });
    expect(s.tone).toBe("calm");
    expect(s.isOptionalEmpty).toBe(true);
  });

  it("VPD with no value and no temp/rh derived shows 'Needs temperature + humidity'", () => {
    const s = classifySensorMetricState({
      metric: "vpd",
      value: null,
      hasAnyReading: true,
    });
    expect(s.message).toBe("Needs temperature + humidity");
    expect(s.tone).toBe("calm");
    expect(s.message.toLowerCase()).not.toContain("unavailable");
  });

  it("manual/csv/demo source labels render correctly", () => {
    expect(
      classifySensorMetricState({
        metric: "temp",
        value: 24,
        source: "manual",
        hasAnyReading: true,
      }).kind,
    ).toBe("manual");
    expect(
      classifySensorMetricState({
        metric: "temp",
        value: 24,
        source: "csv",
        hasAnyReading: true,
      }).kind,
    ).toBe("csv");
    expect(
      classifySensorMetricState({
        metric: "temp",
        value: 24,
        source: "demo",
        hasAnyReading: true,
      }).kind,
    ).toBe("demo");
  });

  it("metric classification helpers identify optional vs core", () => {
    expect(isOptionalMetric("co2")).toBe(true);
    expect(isOptionalMetric("ppfd")).toBe(true);
    expect(isOptionalMetric("soil")).toBe(true);
    expect(isCoreMetric("temp")).toBe(true);
    expect(isCoreMetric("rh")).toBe(true);
    expect(isCoreMetric("vpd")).toBe(true);
  });

  it("is deterministic for the same input", () => {
    const a = classifySensorMetricState({
      metric: "co2",
      value: null,
      hasAnyReading: false,
    });
    const b = classifySensorMetricState({
      metric: "co2",
      value: null,
      hasAnyReading: false,
    });
    expect(a).toEqual(b);
  });
});

describe("sensorMetricStateRules static safety", () => {
  const SRC = readFileSync(
    resolve(__dirname, "../lib/sensorMetricStateRules.ts"),
    "utf8",
  );
  const VPD_SRC = readFileSync(
    resolve(__dirname, "../lib/vpdCalculationRules.ts"),
    "utf8",
  );

  it("contains no AI / alerts / Action Queue / automation / device control imports", () => {
    for (const src of [SRC, VPD_SRC]) {
      expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
      expect(src).not.toMatch(/alerts?/i);
      expect(src).not.toMatch(/action[_-]?queue/i);
      expect(src).not.toMatch(/service_role/i);
      expect(src).not.toMatch(/ai[_-]?doctor/i);
      expect(src).not.toMatch(/device[_-]?control/i);
      expect(src).not.toMatch(/automation/i);
      expect(src).not.toMatch(/import\s+/);
    }
  });
});

describe("optional metric invalid detection", () => {
  it.each([
    ["co2", null, false],
    ["co2", undefined, false],
    ["co2", Number.NaN, true],
    ["co2", Number.POSITIVE_INFINITY, true],
    ["co2", -10, true],
    ["co2", 100, true],
    ["co2", 6000, true],
    ["co2", 420, false],
    ["co2", 800, false],
    ["co2", 1200, false],
    ["ppfd", null, false],
    ["ppfd", undefined, false],
    ["ppfd", Number.NaN, true],
    ["ppfd", Number.POSITIVE_INFINITY, true],
    ["ppfd", -1, true],
    ["ppfd", 3000, true],
    ["ppfd", 0, false],
    ["ppfd", 100, false],
    ["ppfd", 600, false],
    ["ppfd", 1200, false],
    ["soil", null, false],
    ["soil", undefined, false],
    ["soil", Number.NaN, true],
    ["soil", -1, true],
    ["soil", 101, true],
    ["soil", 0, false],
    ["soil", 15, false],
    ["soil", 45, false],
    ["soil", 80, false],
  ] as const)(
    "isOptionalMetricInvalid(%s, %s) -> %s",
    (metric, value, expected) => {
      expect(isOptionalMetricInvalid(metric as SensorMetricKey, value)).toBe(
        expected,
      );
    },
  );

  it("classifies CO2 6000 as caution with units copy", () => {
    const s = classifySensorMetricState({
      metric: "co2",
      value: 6000,
      hasAnyReading: true,
    });
    expect(s.kind).toBe("invalid");
    expect(s.tone).toBe("caution");
    expect(s.message).toMatch(/CO₂ reading looks invalid/);
  });

  it("classifies PPFD 3000 as caution with units copy", () => {
    const s = classifySensorMetricState({
      metric: "ppfd",
      value: 3000,
      hasAnyReading: true,
    });
    expect(s.kind).toBe("invalid");
    expect(s.message).toMatch(/PPFD reading looks invalid/);
  });

  it("missing optional metric stays calm (not invalid) for CO2/PPFD/soil", () => {
    for (const m of ["co2", "ppfd", "soil"] as const) {
      const s = classifySensorMetricState({
        metric: m,
        value: null,
        hasAnyReading: false,
      });
      expect(s.tone).toBe("calm");
      expect(s.kind).toBe("not_connected");
    }
  });
});

describe("soil moisture stuck detection", () => {
  it("single 0 reading is not stuck", () => {
    expect(isSoilMoistureStuck([0])).toBe(false);
    const s = classifySensorMetricState({
      metric: "soil",
      value: 0,
      hasAnyReading: true,
      recentValues: [0],
    });
    expect(s.kind).not.toBe("invalid");
  });

  it("[0,0,0] classifies as caution/stuck", () => {
    expect(isSoilMoistureStuck([0, 0, 0])).toBe(true);
    const s = classifySensorMetricState({
      metric: "soil",
      value: 0,
      hasAnyReading: true,
      recentValues: [0, 0, 0],
    });
    expect(s.kind).toBe("invalid");
    expect(s.tone).toBe("caution");
    expect(s.message).toMatch(/stuck/i);
  });

  it("[100,100,100] classifies as caution/stuck", () => {
    expect(isSoilMoistureStuck([100, 100, 100])).toBe(true);
  });

  it("[0,1,0] does NOT classify as stuck", () => {
    expect(isSoilMoistureStuck([0, 1, 0])).toBe(false);
  });

  it("undefined recentValues never stuck", () => {
    expect(isSoilMoistureStuck(undefined)).toBe(false);
  });
});

describe("stale vs invalid caution-tone coverage", () => {
  const CALM_KINDS = [
    "live",
    "manual",
    "csv",
    "demo",
    "derived",
    "not_connected",
    "no_reading_yet",
  ] as const;

  it.each(CALM_KINDS)("%s renders calm tone, not caution", (kind) => {
    let s;
    if (kind === "derived") {
      s = classifySensorMetricState({
        metric: "vpd",
        value: 1.2,
        hasAnyReading: true,
        isDerived: true,
      });
    } else if (kind === "not_connected") {
      s = classifySensorMetricState({
        metric: "co2",
        value: null,
        hasAnyReading: false,
      });
    } else if (kind === "no_reading_yet") {
      s = classifySensorMetricState({
        metric: "vpd",
        value: null,
        hasAnyReading: true,
      });
    } else {
      s = classifySensorMetricState({
        metric: "temp",
        value: 24,
        source: kind,
        hasAnyReading: true,
      });
    }
    expect(s.kind).toBe(kind);
    expect(s.tone).toBe("calm");
  });

  it("stale and invalid are the only caution tones", () => {
    const stale = classifySensorMetricState({
      metric: "temp",
      value: 24,
      source: "live",
      hasAnyReading: true,
      isStale: true,
    });
    const invalid = classifySensorMetricState({
      metric: "co2",
      value: 99,
      hasAnyReading: true,
    });
    expect(stale.tone).toBe("caution");
    expect(invalid.tone).toBe("caution");
  });

  it.each(["vpd", "co2", "ppfd", "soil"] as const)(
    "optional metric %s classifies all four bound cases without throwing",
    (metric) => {
      expect(() =>
        classifySensorMetricState({
          metric,
          value: null,
          hasAnyReading: false,
        }),
      ).not.toThrow();
    },
  );
});


import { describeSoilMoistureStuckWindow } from "@/lib/sensorMetricStateRules";

describe("describeSoilMoistureStuckWindow (window-aware)", () => {
  it("returns null for undefined", () => {
    expect(describeSoilMoistureStuckWindow(undefined)).toBeNull();
  });
  it("returns null for empty array", () => {
    expect(describeSoilMoistureStuckWindow([])).toBeNull();
  });
  it("returns null for fewer than 3 finite values", () => {
    expect(describeSoilMoistureStuckWindow([0, 0])).toBeNull();
    expect(describeSoilMoistureStuckWindow([0, null, 0])).toBeNull();
  });
  it("[0,0,0] -> stuck at 0%, last 3 readings", () => {
    const w = describeSoilMoistureStuckWindow([0, 0, 0]);
    expect(w).not.toBeNull();
    expect(w!.value).toBe(0);
    expect(w!.windowLength).toBe(3);
    expect(w!.message).toContain("0%");
    expect(w!.message).toContain("last 3 readings");
  });
  it("[100,100,100] -> stuck at 100%, last 3 readings", () => {
    const w = describeSoilMoistureStuckWindow([100, 100, 100]);
    expect(w!.value).toBe(100);
    expect(w!.message).toContain("100%");
    expect(w!.message).toContain("last 3 readings");
  });
  it("[0,0,0,0] reports last 4 readings", () => {
    const w = describeSoilMoistureStuckWindow([0, 0, 0, 0]);
    expect(w!.windowLength).toBe(4);
    expect(w!.message).toContain("last 4 readings");
  });
  it("[100,100,100,100,100] reports last 5 readings", () => {
    const w = describeSoilMoistureStuckWindow([100, 100, 100, 100, 100]);
    expect(w!.windowLength).toBe(5);
    expect(w!.message).toContain("last 5 readings");
  });
  it("mixed values do not classify as stuck", () => {
    expect(describeSoilMoistureStuckWindow([0, 1, 0])).toBeNull();
    expect(describeSoilMoistureStuckWindow([100, 0, 100])).toBeNull();
  });
});

describe("soil stuck classifier integration (window-aware)", () => {
  it("missing recentValues + single 0 reading is NOT stuck", () => {
    const s = classifySensorMetricState({
      metric: "soil",
      value: 0,
      hasAnyReading: true,
    });
    expect(s.message).not.toMatch(/stuck/i);
  });
  it("missing recentValues + single 100 reading is NOT stuck", () => {
    const s = classifySensorMetricState({
      metric: "soil",
      value: 100,
      hasAnyReading: true,
    });
    expect(s.message).not.toMatch(/stuck/i);
  });
  it("[0,0,0,0] produces window-aware copy mentioning last 4 readings", () => {
    const s = classifySensorMetricState({
      metric: "soil",
      value: 0,
      hasAnyReading: true,
      recentValues: [0, 0, 0, 0],
    });
    expect(s.kind).toBe("invalid");
    expect(s.tone).toBe("caution");
    expect(s.message).toContain("0%");
    expect(s.message).toContain("last 4 readings");
  });
  it("valid soil moisture stays calm", () => {
    for (const v of [15, 45, 80]) {
      const s = classifySensorMetricState({
        metric: "soil",
        value: v,
        hasAnyReading: true,
        recentValues: [v, v - 1, v + 1],
      });
      expect(s.tone).toBe("calm");
    }
  });
  it("missing soil moisture stays calm", () => {
    const s = classifySensorMetricState({
      metric: "soil",
      value: null,
      hasAnyReading: false,
    });
    expect(s.tone).toBe("calm");
    expect(s.kind).toBe("not_connected");
  });
});
