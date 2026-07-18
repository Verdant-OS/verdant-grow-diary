/**
 * Drift guard: the server-side environment_events plausibility trigger must
 * stay pinned to the SAME canonical band the client enforces
 * (src/lib/sensorReadingNormalizationRules.ts). If the TS band ever moves, the
 * predicate-boundary assertions below change and force the SQL literals — pinned
 * in the same test — to move with them, so client and server can never silently
 * disagree the way Quick Log v1 (0..4 kPa) once diverged from v2 (0..10 kPa).
 *
 * Static analysis only — reads the migration text; no DB connection.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  isTemperatureValid,
  isHumidityValid,
  isVpdValid,
} from "../lib/sensorReadingNormalizationRules";

const ROOT = resolve(__dirname, "../..");
const MIG_DIR = resolve(ROOT, "supabase/migrations");

function findLatestTriggerSql(): string {
  if (!existsSync(MIG_DIR)) return "";
  const matches: { name: string; sql: string }[] = [];
  for (const name of readdirSync(MIG_DIR)) {
    const sql = readFileSync(join(MIG_DIR, name), "utf8");
    if (
      /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.validate_environment_event/i.test(
        sql,
      )
    ) {
      matches.push({ name, sql });
    }
  }
  matches.sort((a, b) => a.name.localeCompare(b.name));
  return matches.length ? matches[matches.length - 1].sql : "";
}

const sql = findLatestTriggerSql();

describe("environment_events canonical-band trigger — discoverable", () => {
  it("the latest migration defines validate_environment_event", () => {
    expect(sql.length).toBeGreaterThan(200);
  });
});

describe("server trigger pins the canonical band (client↔server drift guard)", () => {
  it("temperature_c is bounded -10..60 °C", () => {
    expect(sql).toMatch(
      /temperature_c\s*<\s*-10\s+OR\s+NEW\.temperature_c\s*>\s*60/i,
    );
  });

  it("humidity_pct is bounded 0..100", () => {
    expect(sql).toMatch(/humidity_pct\s*<\s*0\s+OR\s+NEW\.humidity_pct\s*>\s*100/i);
  });

  it("vpd_kpa is bounded 0..10 kPa (not the retired 4 kPa cap)", () => {
    expect(sql).toMatch(/vpd_kpa\s*<\s*0\s+OR\s+NEW\.vpd_kpa\s*>\s*10/i);
    // The old grow-plausibility ceiling must not sneak back as the hard bound.
    expect(sql).not.toMatch(/vpd_kpa\s*>\s*4\b/i);
  });

  it("out-of-band writes RAISE (reject), never clamp-and-store", () => {
    expect(sql).toMatch(/RAISE\s+EXCEPTION\s+'temperature_c out of range'/i);
    expect(sql).toMatch(/RAISE\s+EXCEPTION\s+'vpd_kpa out of range'/i);
  });
});

describe("canonical predicates agree with the SQL literals at every edge", () => {
  it("temperature edges: -10 and 60 inclusive, just-past rejected", () => {
    expect(isTemperatureValid(-10)).toBe(true);
    expect(isTemperatureValid(60)).toBe(true);
    expect(isTemperatureValid(-10.01)).toBe(false);
    expect(isTemperatureValid(60.01)).toBe(false);
  });

  it("humidity edges: 0 and 100 inclusive, just-past rejected", () => {
    expect(isHumidityValid(0)).toBe(true);
    expect(isHumidityValid(100)).toBe(true);
    expect(isHumidityValid(-0.01)).toBe(false);
    expect(isHumidityValid(100.01)).toBe(false);
  });

  it("vpd edges: 0 and 10 inclusive, just-past rejected", () => {
    expect(isVpdValid(0)).toBe(true);
    expect(isVpdValid(10)).toBe(true);
    expect(isVpdValid(-0.01)).toBe(false);
    expect(isVpdValid(10.01)).toBe(false);
  });
});
