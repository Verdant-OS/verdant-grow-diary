/**
 * Manual sensor reading — Fahrenheit standard + Seedling Clone tent
 * scoping accuracy.
 *
 * Audit-driven static + pure-rule tests:
 *  - Fahrenheit is the user-facing standard (input, label, placeholder,
 *    display chips, chart axes, panels).
 *  - Manual payload preserves the documented "store Celsius, display
 *    Fahrenheit" convention via fahrenheitToCelsius().
 *  - Manual insert payload always carries the selected tent_id.
 *  - Latest-reading hooks sort by ts desc with created_at desc tie-breaker
 *    so multi-metric manual entries (which share `ts`) are deterministic.
 *  - Cache invalidation refreshes every surface that reads latest readings.
 *  - Sensors page never silently defaults a manual write to a different
 *    tent when the chip selector points at a non-DB tent.
 *  - Manual reading card always shows the tent dropdown + a "Saving to: <name>"
 *    confirmation so the user can never mis-route a Seedling Clone reading.
 *  - Static safety: no service_role / mqtt / home_assistant / pi_bridge /
 *    actuator / device_command / autopilot / Leads / writeWateringTypedEvent /
 *    schema migration files / action_queue mutation / alert mutation.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildManualReadingPayloads,
  fahrenheitToCelsius,
  validateManualEntry,
} from "@/lib/sensorReadingManualEntryRules";
import {
  celsiusToFahrenheit,
  formatTempFFromC,
  tempFFromC,
} from "@/lib/temperatureUnits";

const ROOT = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const CARD = read("src/components/ManualSensorReadingCard.tsx");
const RULES = read("src/lib/sensorReadingManualEntryRules.ts");
const HOOK = read("src/hooks/useInsertSensorReading.ts");
const SENSORS_PAGE = read("src/pages/Sensors.tsx");
const TENT_DETAIL = read("src/pages/TentDetail.tsx");
const DASHBOARD = read("src/pages/Dashboard.tsx");
const PLANT_PANEL = read("src/components/PlantTentEnvironmentPanel.tsx");
const PLANT_LATEST = read("src/hooks/usePlantTentLatestReadings.ts");
const USE_SR = read("src/hooks/use-sensor-readings.ts");
const LATEST_SNAP = read("src/hooks/useLatestSensorSnapshot.ts");

// ---------------------------------------------------------------------------
// Fahrenheit is the user-facing standard.
// ---------------------------------------------------------------------------

describe("Manual sensor temperature is collected and labeled in Fahrenheit", () => {
  it("labels the air-temp input with °F and uses a Fahrenheit placeholder", () => {
    expect(CARD).toContain("airTempF");
    expect(CARD).toContain('unit="°F"');
    expect(CARD).toMatch(/placeholder="75"/);
  });

  it("validates Fahrenheit ranges (warns outside 50–100°F)", () => {
    expect(validateManualEntry({ airTempF: 72 }).ok).toBe(true);
    expect(validateManualEntry({ airTempF: 75.5 }).ok).toBe(true);
    expect(validateManualEntry({ airTempF: 82 }).ok).toBe(true);

    const cold = validateManualEntry({ airTempF: 30 });
    expect(cold.ok).toBe(true);
    expect(cold.warnings.some((w) => w.includes("50–100°F"))).toBe(true);

    const hot = validateManualEntry({ airTempF: 130 });
    expect(hot.ok).toBe(true);
    expect(hot.warnings.some((w) => w.includes("50–100°F"))).toBe(true);
  });

  it("converts °F → °C exactly once before storage (schema requires Celsius)", () => {
    expect(fahrenheitToCelsius(75)).toBeCloseTo(23.888888, 5);
    const v = validateManualEntry({ airTempF: 75 });
    const tempRow = v.metrics.find((m) => m.metric === "temperature_c");
    expect(tempRow?.value).toBeCloseTo(23.89, 2);
    // RULES file documents the convention explicitly.
    expect(RULES).toMatch(/Air temp is entered in °F/);
    expect(RULES).toMatch(/converted to °C/i);
  });

  it("never silently treats Fahrenheit as Celsius (no °C in the manual UI)", () => {
    // The only °C reference in the card should be absent (we render °F).
    expect(CARD).not.toMatch(/°C/);
    expect(CARD).not.toMatch(/celsius/i);
  });
});

describe("UI surfaces render stored Celsius as user-facing Fahrenheit", () => {
  it("Dashboard, TentDetail, and plant env rules use °F + tempFFromC", () => {
    for (const src of [DASHBOARD, TENT_DETAIL]) {
      expect(src).toMatch(/°F/);
      expect(src).toMatch(/tempFFromC/);
      expect(src).not.toMatch(/°C/);
    }
    const panelRules = read("src/lib/plantTentEnvironmentRules.ts");
    expect(panelRules).toMatch(/"°F"/);
    expect(panelRules).toMatch(/tempFFromC/);
    const chart = read("src/components/SensorChart.tsx");
    expect(chart).toMatch(/unit:\s*"°F"/);
  });

  it("temperatureUnits helpers are reversible and honest about missing data", () => {
    const c = 20;
    expect(celsiusToFahrenheit(c)).toBeCloseTo(68, 5);
    expect(tempFFromC(c)).toBeCloseTo(68, 5);
    expect(tempFFromC(null)).toBeNull();
    expect(tempFFromC(undefined)).toBeNull();
    expect(formatTempFFromC(null)).toBe("Unknown");
    expect(formatTempFFromC(NaN)).toBe("Unknown");
    expect(formatTempFFromC(20)).toBe("68.0°F");
  });
});

// ---------------------------------------------------------------------------
// Tent scoping — Seedling Clone writes land on the selected tent.
// ---------------------------------------------------------------------------

describe("Manual reading payload is tent-scoped", () => {
  it("buildManualReadingPayloads always stamps the chosen tent_id on every metric", () => {
    const v = validateManualEntry({ airTempF: 75, humidityPct: 55, co2Ppm: 820 });
    const payloads = buildManualReadingPayloads({
      tentId: "seedling-clone-tent-id",
      metrics: v.metrics,
    });
    expect(payloads.length).toBe(v.metrics.length);
    for (const p of payloads) {
      expect(p.tent_id).toBe("seedling-clone-tent-id");
      expect(p.source).toBe("manual");
      expect(p.quality).toBe("ok");
      // Every row in a single manual entry shares the same ts (deterministic
      // batch grouping); created_at on the server is the tie-breaker.
      expect(p.ts).toBe(payloads[0].ts);
    }
  });

  it("buildManualReadingPayloads does not move a reading to a different tent", () => {
    const v = validateManualEntry({ airTempF: 72 });
    const seedling = buildManualReadingPayloads({ tentId: "seedling-id", metrics: v.metrics });
    const veg = buildManualReadingPayloads({ tentId: "veg-id", metrics: v.metrics });
    expect(seedling[0].tent_id).toBe("seedling-id");
    expect(veg[0].tent_id).toBe("veg-id");
    expect(seedling[0].tent_id).not.toBe(veg[0].tent_id);
  });
});

describe("ManualSensorReadingCard always exposes the tent selection", () => {
  it("renders the tent dropdown whenever any tent is available (not only when > 1)", () => {
    expect(CARD).toMatch(/tents\.length\s*>\s*0/);
    expect(CARD).toContain('data-testid="manual-reading-tent-select"');
    expect(CARD).toContain("Saving to:");
  });

  it("never injects a client user_id into the payload", () => {
    expect(RULES).not.toMatch(/user_id/);
    // The card delegates writes through useInsertSensorReading; user_id is
    // optional at the hook boundary and the DB default (auth.uid()) sets it.
    expect(HOOK).toMatch(/user_id is optional/i);
  });
});

describe("Sensors page never silently re-routes a manual write to another tent", () => {
  it("only auto-defaults the manual tent when the chip selection is a real DB tent", () => {
    // Old (buggy) behavior: `?? manualTents[0]?.id`. New behavior: undefined.
    expect(SENSORS_PAGE).not.toMatch(/find\(\(t\) => t\.id === tentId\)\?\.id\s*\?\?\s*manualTents\[0\]/);
    expect(SENSORS_PAGE).toMatch(/manualTents\.find\(\(t\) => t\.id === tentId\)\?\.id\s*;/);
  });
});

// ---------------------------------------------------------------------------
// Latest-reading determinism + cache invalidation.
// ---------------------------------------------------------------------------

describe("Latest-reading hooks sort deterministically (ts desc, created_at desc)", () => {
  it("usePlantTentLatestReadings adds a created_at tie-breaker", () => {
    expect(PLANT_LATEST).toMatch(/\.order\(\s*["']ts["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
    expect(PLANT_LATEST).toMatch(/\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
  });

  it("use-sensor-readings adds a created_at tie-breaker", () => {
    expect(USE_SR).toMatch(/\.order\(\s*["']ts["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
    expect(USE_SR).toMatch(/\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
  });

  it("useLatestSensorSnapshot already orders by ts then created_at", () => {
    expect(LATEST_SNAP).toMatch(/\.order\(\s*["']ts["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
    expect(LATEST_SNAP).toMatch(/\.order\(\s*["']created_at["']\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/);
  });
});

describe("Manual insert invalidates every latest-reading surface", () => {
  it("invalidates sensor_readings, latest-sensor-snapshot, plant-tent-environment, environment-trends, grow→sensors", () => {
    for (const key of [
      "sensor_readings",
      "latest-sensor-snapshot",
      "plant-tent-environment",
      "environment-trends",
      "grow", // ["grow", "sensors"] is prefix-matched
    ]) {
      expect(HOOK).toMatch(new RegExp(`invalidateQueries\\(\\{\\s*queryKey:\\s*\\[["']${key}["']`));
    }
  });
});

// ---------------------------------------------------------------------------
// Static safety guardrails.
// ---------------------------------------------------------------------------

describe("Static safety — no automation, no device control, no forbidden surfaces", () => {
  const files = [
    "src/components/ManualSensorReadingCard.tsx",
    "src/lib/sensorReadingManualEntryRules.ts",
    "src/hooks/useInsertSensorReading.ts",
    "src/hooks/usePlantTentLatestReadings.ts",
    "src/hooks/use-sensor-readings.ts",
    "src/pages/Sensors.tsx",
  ];
  for (const f of files) {
    it(`${f} contains no forbidden integration / automation strings`, () => {
      const src = read(f);
      expect(src).not.toMatch(
        /service_role|mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|actuator|device_command|autopilot|writeWateringTypedEvent/i,
      );
      // Manual entry path must not mutate alerts or action_queue.
      expect(src).not.toMatch(/\.from\(["']action_queue["']\)\s*\.(insert|update|delete|upsert)/);
      expect(src).not.toMatch(/\.from\(["']alerts["']\)\s*\.(insert|update|delete|upsert)/);
      // No Leads coupling.
      expect(src).not.toMatch(/\bleads\b/i);
    });
  }
});
