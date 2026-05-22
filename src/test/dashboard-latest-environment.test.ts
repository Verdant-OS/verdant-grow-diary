/**
 * Tests for the scoped Dashboard "Latest Environment" card.
 *
 * Pure-helper unit tests for src/lib/sensorSnapshot.ts plus static-inspection
 * contract tests in the style of dashboard-grow-scope.test.ts for the hook
 * and Dashboard wiring.
 *
 * Safety:
 *  - No ai-coach call introduced.
 *  - No device-command surface introduced.
 *  - No service_role surface introduced.
 *  - No new write paths.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  EMPTY_SNAPSHOT,
  SOURCE_LABEL,
  STALE_THRESHOLD_MS,
  formatValue,
  isStale,
  snapshotFromDiary,
  snapshotFromReadings,
  toFiniteNumber,
} from "@/lib/sensorSnapshot";

const ROOT = resolve(__dirname, "../..");
const DASHBOARD = readFileSync(resolve(ROOT, "src/pages/Dashboard.tsx"), "utf8");
const HOOK = readFileSync(
  resolve(ROOT, "src/hooks/useLatestSensorSnapshot.ts"),
  "utf8",
);

const AI_COACH_CALL = /["'`]ai-coach["'`]|functions\/ai-coach|ai_coach/;
const DEVICE_SURFACE =
  /mqtt|home[\s_-]?assistant|pi[\s_-]?bridge|\brelay\b|\bactuator\b/i;
const WRITE_PATH = /\.from\(['"][^'"]+['"]\)\s*\.(insert|update|delete|upsert)/;

describe("sensorSnapshot pure helpers", () => {
  it("toFiniteNumber coerces and rejects junk", () => {
    expect(toFiniteNumber(1.5)).toBe(1.5);
    expect(toFiniteNumber("2.5")).toBe(2.5);
    expect(toFiniteNumber(null)).toBeNull();
    expect(toFiniteNumber(undefined)).toBeNull();
    expect(toFiniteNumber("nope")).toBeNull();
    expect(toFiniteNumber(Number.NaN)).toBeNull();
    expect(toFiniteNumber(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("formatValue returns Unknown for null and numeric+unit otherwise", () => {
    expect(formatValue(null, "°C")).toBe("Unknown");
    expect(formatValue(22, "°C")).toBe("22.0°C");
    expect(formatValue(1.234, " kPa", 2)).toBe("1.23 kPa");
  });

  it("isStale honors the 30-minute default and never crashes on bad input", () => {
    const now = new Date("2026-05-20T12:00:00Z").getTime();
    const fresh = new Date(now - 5 * 60 * 1000).toISOString();
    const stale = new Date(now - 45 * 60 * 1000).toISOString();
    expect(isStale(fresh, now)).toBe(false);
    expect(isStale(stale, now)).toBe(true);
    expect(isStale(null, now)).toBe(false);
    expect(isStale("not-a-date", now)).toBe(false);
    expect(STALE_THRESHOLD_MS).toBe(30 * 60 * 1000);
  });

  it("snapshotFromReadings folds latest-ts metrics and labels source", () => {
    const ts = "2026-05-20T11:55:00Z";
    const snap = snapshotFromReadings([
      { ts, metric: "temperature_c", value: 24.1, source: "pi_bridge" },
      { ts, metric: "humidity_pct", value: "55.2", source: "pi_bridge" },
      { ts, metric: "vpd_kpa", value: 1.1, source: "pi_bridge" },
      // earlier ts must be ignored
      { ts: "2026-05-20T10:00:00Z", metric: "co2_ppm", value: 800, source: "pi_bridge" },
    ]);
    expect(snap).not.toBeNull();
    expect(snap!.source).toBe("live");
    expect(snap!.ts).toBe(ts);
    expect(snap!.temp).toBe(24.1);
    expect(snap!.rh).toBeCloseTo(55.2, 5);
    expect(snap!.vpd).toBe(1.1);
    expect(snap!.co2).toBeNull();
  });

  it("snapshotFromReadings flips source to 'manual' if any row is manual", () => {
    const ts = "2026-05-20T11:55:00Z";
    const snap = snapshotFromReadings([
      { ts, metric: "temperature_c", value: 22, source: "manual" },
    ]);
    expect(snap!.source).toBe("manual");
  });

  it("snapshotFromReadings returns null for empty input (no faking)", () => {
    expect(snapshotFromReadings([])).toBeNull();
  });

  it("snapshotFromDiary preserves null fields and labels source='diary'", () => {
    const snap = snapshotFromDiary("2026-05-20T11:00:00Z", {
      temp: 23,
      rh: null,
      vpd: "0.9",
      soil: "junk",
    });
    expect(snap).not.toBeNull();
    expect(snap!.source).toBe("diary");
    expect(snap!.temp).toBe(23);
    expect(snap!.rh).toBeNull();
    expect(snap!.vpd).toBe(0.9);
    expect(snap!.soil).toBeNull();
  });

  it("snapshotFromDiary returns null when there is no usable input", () => {
    expect(snapshotFromDiary(null, null)).toBeNull();
    expect(snapshotFromDiary(null, undefined)).toBeNull();
  });

  it("EMPTY_SNAPSHOT and SOURCE_LABEL cover the unavailable case", () => {
    expect(EMPTY_SNAPSHOT.source).toBe("unavailable");
    expect(SOURCE_LABEL.unavailable).toBe("Unavailable");
    expect(SOURCE_LABEL.live).toBe("Live sensor");
    expect(SOURCE_LABEL.manual).toBe("Manual");
    expect(SOURCE_LABEL.diary).toBe("Diary snapshot");
  });
});

describe("useLatestSensorSnapshot hook — source priority and safety", () => {
  it("queries sensor_readings filtered to the scoped tent ids, newest-first", () => {
    expect(HOOK).toMatch(/\.from\(\s*['"]sensor_readings['"]\s*\)/);
    expect(HOOK).toMatch(
      /\.in\(\s*['"]tent_id['"]\s*,\s*tentIds\s*\)[\s\S]*?\.order\(\s*['"]ts['"]\s*,\s*\{\s*ascending:\s*false\s*\}\s*\)/,
    );
  });

  it("falls back to diary_entries.details.sensor_snapshot for the scoped grow", () => {
    expect(HOOK).toMatch(
      /from\(\s*['"]diary_entries['"]\s*\)[\s\S]*?\.eq\(\s*['"]grow_id['"]\s*,\s*growId\s*\)[\s\S]*?\.order\(\s*['"]entry_at['"]\s*,\s*\{\s*ascending:\s*false\s*\}/,
    );
    expect(HOOK).toMatch(/sensor_snapshot/);
  });

  it("idles when growId is missing (does not query)", () => {
    expect(HOOK).toMatch(/if\s*\(\s*!user\s*||\s*!growId\s*\)/);
  });

  it("degrades to 'unavailable' on query failure (no crash)", () => {
    expect(HOOK).toMatch(/status:\s*['"]unavailable['"]/);
    expect(HOOK).toMatch(/catch\s*\{/);
  });

  it("introduces no new write paths or privileged/AI/device surface", () => {
    expect(HOOK).not.toMatch(WRITE_PATH);
    expect(HOOK).not.toMatch(/\.rpc\(/);
    expect(HOOK).not.toMatch(/service_role/);
    expect(HOOK).not.toMatch(AI_COACH_CALL);
    expect(HOOK).not.toMatch(DEVICE_SURFACE);
  });
});

describe("Dashboard — Latest Environment card wiring", () => {
  it("imports the hook and helpers and calls them with scoped inputs", () => {
    expect(DASHBOARD).toMatch(
      /import\s+\{\s*useLatestSensorSnapshot\s*\}\s+from\s+['"]@\/hooks\/useLatestSensorSnapshot['"]/,
    );
    expect(DASHBOARD).toMatch(/SOURCE_LABEL/);
    expect(DASHBOARD).toMatch(/formatValue/);
    expect(DASHBOARD).toMatch(/isStale/);
    expect(DASHBOARD).toMatch(
      /useLatestSensorSnapshot\(\s*scopedGrowId\s*\?\?\s*null\s*,\s*selectedTentIds/,
    );
  });

  it("only renders the card when scoped (inside the scopedGrowId branch)", () => {
    expect(DASHBOARD).toMatch(/aria-label="Latest environment"/);
    // Card markup must live inside the scopedGrowId ternary, before the
    // existing Recent Activity card.
    const scopedIdx = DASHBOARD.indexOf("{scopedGrowId ? (");
    const envIdx = DASHBOARD.indexOf('aria-label="Latest environment"');
    const recentIdx = DASHBOARD.indexOf('aria-label="Recent activity"');
    expect(scopedIdx).toBeGreaterThan(-1);
    expect(envIdx).toBeGreaterThan(scopedIdx);
    expect(recentIdx).toBeGreaterThan(envIdx);
  });

  it("renders empty / unavailable / stale states without faking values", () => {
    expect(DASHBOARD).toMatch(/No sensor data yet\./);
    expect(DASHBOARD).toMatch(/Sensor data unavailable\./);
    expect(DASHBOARD).toMatch(/Stale reading/);
    expect(DASHBOARD).toMatch(/SOURCE_LABEL\[sensorState\.snapshot\.source\]/);
  });

  it("links to the timeline via logsPath (no dead links)", () => {
    expect(DASHBOARD).toMatch(/to=\{logsPath\(scopedGrowId\)\}[\s\S]{0,200}Open Timeline/);
  });

  it("remains read-only and free of restricted surfaces", () => {
    expect(DASHBOARD).not.toMatch(WRITE_PATH);
    expect(DASHBOARD).not.toMatch(/\.rpc\(/);
    expect(DASHBOARD).not.toMatch(/service_role/);
    expect(DASHBOARD).not.toMatch(AI_COACH_CALL);
    expect(DASHBOARD).not.toMatch(DEVICE_SURFACE);
  });
});
