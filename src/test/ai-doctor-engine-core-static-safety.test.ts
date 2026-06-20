/**
 * Static safety + targeted regression scan for the AI Doctor engine core trio.
 *
 * Targets (Phase 1 deterministic engine surface):
 *   - src/lib/aiDoctorContextCompiler.ts
 *   - src/lib/aiDoctorEngine.ts
 *   - src/lib/aiDoctorSafetyRules.ts
 *
 * What this file proves (additive — no source changes required):
 *
 *  1. Static safety: the engine core never imports Supabase, never calls
 *     `fetch(` / `axios` / `functions.invoke`, never touches `localStorage` /
 *     `sessionStorage`, never references `service_role` / bridge tokens, never
 *     references DB write helpers (`.insert(` / `.update(` / `.upsert(` /
 *     `.delete(` / `.rpc(`), never references `action_queue` or `alerts`
 *     tables, and never embeds device-control command strings.
 *
 *  2. `aiDoctorContextCompiler` source never calls `Date.now(` directly. The
 *     contract (`docs/ai-doctor-phase1-contract.md` §3) allows
 *     `new Date()` as the only non-deterministic fallback when no `now` is
 *     injected; any switch to `Date.now()` would be a regression.
 *
 *  3. Behavior: with a pinned `now` (no system-clock read) the compiler is
 *     deterministic across repeated calls with the same inputs.
 *
 *  4. Behavior: VPD averages are computed from existing `vpd_kpa` readings
 *     only — supplying temperature_c + humidity_pct without a vpd_kpa
 *     reading must NOT synthesize a vpd_kpa average.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  compilePlantContextFromRows,
  type SensorReadingRowLike,
} from "../lib/aiDoctorContextCompiler";

const ROOT = resolve(__dirname, "../..");
const ENGINE_CORE_PATHS = [
  "src/lib/aiDoctorContextCompiler.ts",
  "src/lib/aiDoctorEngine.ts",
  "src/lib/aiDoctorSafetyRules.ts",
] as const;

// Strip line comments and /* ... */ block comments so doc text describing
// forbidden patterns (e.g. "no fetch(") cannot trip the scan.
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const sources = ENGINE_CORE_PATHS.map((p) => ({
  path: p,
  src: stripComments(readFileSync(resolve(ROOT, p), "utf8")),
})) as Array<{ path: string; src: string }>;

describe("ai-doctor engine core — static safety scan", () => {
  it.each(sources)("[$path] does not import Supabase client", ({ src }) => {
    expect(src).not.toMatch(/@\/integrations\/supabase/);
    expect(src).not.toMatch(/from\s+["']@supabase/);
  });

  it.each(sources)(
    "[$path] does not call fetch(, axios, or functions.invoke",
    ({ src }) => {
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toMatch(/\baxios\b/);
      expect(src).not.toMatch(/functions\.invoke/);
    },
  );

  it.each(sources)(
    "[$path] does not reference DB write helpers",
    ({ src }) => {
      expect(src).not.toMatch(/\.insert\(/);
      expect(src).not.toMatch(/\.upsert\(/);
      expect(src).not.toMatch(/\.update\(/);
      expect(src).not.toMatch(/\.delete\(/);
      expect(src).not.toMatch(/\.rpc\(/);
    },
  );

  it.each(sources)(
    "[$path] does not touch localStorage or sessionStorage",
    ({ src }) => {
      expect(src).not.toMatch(/\blocalStorage\b/);
      expect(src).not.toMatch(/\bsessionStorage\b/);
    },
  );

  it.each(sources)(
    "[$path] does not reference service_role or bridge tokens",
    ({ src }) => {
      expect(src).not.toMatch(/service_role/);
      expect(src).not.toMatch(/bridge[_\s-]?token/i);
    },
  );

  it.each(sources)(
    "[$path] does not reference action_queue or alerts write paths",
    ({ src }) => {
      expect(src).not.toMatch(/from\(["']action_queue["']\)/);
      expect(src).not.toMatch(/from\(["']alerts["']\)/);
    },
  );

  it.each(sources)(
    "[$path] does not embed device-control command strings",
    ({ src }) => {
      // Engine core may *describe* / detect these patterns via regex literals,
      // but must not emit them as plain command sentences in returned strings.
      // We allow regex literal usage by checking only for plain-string forms.
      const stringForms = [
        /["']\s*turn\s+(on|off)\s+the\s+(fan|light|pump|heater|humidifier|dehumidifier)/i,
        /["']\s*set\s+(fan|light)\s+/i,
        /["']\s*dose\s+\d/i,
        /["']\s*irrigate\s+now/i,
      ];
      for (const rx of stringForms) {
        expect(src).not.toMatch(rx);
      }
    },
  );
});

describe("aiDoctorContextCompiler — Date.now() regression scan", () => {
  it("compiler source does not call Date.now() directly", () => {
    const compilerSrc = sources.find(
      (s) => s.path === "src/lib/aiDoctorContextCompiler.ts",
    )!.src;
    expect(compilerSrc).not.toMatch(/\bDate\.now\s*\(/);
  });
});

describe("aiDoctorContextCompiler — reference_time determinism", () => {
  const NOW = new Date("2026-06-04T12:00:00Z");
  const iso = (msAgo: number) =>
    new Date(NOW.getTime() - msAgo).toISOString();

  it("identical inputs with the same injected now produce identical output", () => {
    const input = {
      plant: { id: "p1", tent_id: "t1", grow_id: "g1", stage: "veg" },
      growEvents: [
        { occurred_at: iso(60 * 60 * 1000), event_type: "watering", source: "manual" },
      ],
      sensorReadings: [
        { metric: "temperature_c", value: 24, captured_at: iso(60 * 60 * 1000), source: "live" },
        { metric: "humidity_pct", value: 55, captured_at: iso(60 * 60 * 1000), source: "live" },
      ],
      now: NOW,
    };
    const a = compilePlantContextFromRows(input);
    const b = compilePlantContextFromRows(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("aiDoctorContextCompiler — vpd uses existing vpd_kpa only", () => {
  const NOW = new Date("2026-06-04T12:00:00Z");
  const iso = (msAgo: number) =>
    new Date(NOW.getTime() - msAgo).toISOString();

  it("does NOT synthesize vpd_kpa from temperature_c + humidity_pct", () => {
    const readings: SensorReadingRowLike[] = [
      // Pair of T + RH readings that, if VPD were recomputed, would yield
      // a non-null average. The compiler must NOT recompute.
      { metric: "temperature_c", value: 24, captured_at: iso(60_000), source: "live" },
      { metric: "humidity_pct", value: 55, captured_at: iso(60_000), source: "live" },
    ];
    const ctx = compilePlantContextFromRows({
      plant: { id: "p1", tent_id: "t1", grow_id: "g1", stage: "veg" },
      growEvents: [],
      sensorReadings: readings,
      now: NOW,
    });
    expect(ctx.averages_7d.temperature_c).toBe(24);
    expect(ctx.averages_7d.humidity_pct).toBe(55);
    expect(ctx.averages_7d.vpd_kpa).toBeNull();
    const liveGroup = ctx.sensor_groups.find((g) => g.source === "live");
    expect(liveGroup?.averages.vpd_kpa).toBeNull();
  });

  it("averages only existing vpd_kpa readings within the same source group", () => {
    const readings: SensorReadingRowLike[] = [
      { metric: "vpd_kpa", value: 1.0, captured_at: iso(60_000), source: "ecowitt" },
      { metric: "vpd_kpa", value: 1.4, captured_at: iso(120_000), source: "ecowitt" },
      // Different source group — must not blend.
      { metric: "vpd_kpa", value: 0.2, captured_at: iso(60_000), source: "csv" },
    ];
    const ctx = compilePlantContextFromRows({
      plant: { id: "p1", tent_id: "t1", grow_id: "g1", stage: "veg" },
      growEvents: [],
      sensorReadings: readings,
      now: NOW,
    });
    const liveGroup = ctx.sensor_groups.find((g) => g.source === "live");
    const csvGroup = ctx.sensor_groups.find((g) => g.source === "csv");
    expect(liveGroup?.averages.vpd_kpa).toBe(1.2);
    expect(csvGroup?.averages.vpd_kpa).toBe(0.2);
    // averages_7d trusts only live+manual → matches live, never blends csv.
    expect(ctx.averages_7d.vpd_kpa).toBe(1.2);
  });
});
