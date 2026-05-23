/**
 * Tests for piIngestConfigRules — pure runtime config rules.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  defaultPiIngestConfig,
  validatePiIngestConfig,
  mergePiIngestConfig,
  type PiIngestConfig,
} from "@/lib/piIngestConfigRules";

const VALID: PiIngestConfig = {
  windowMs: 60_000,
  maxRequestsPerWindow: 60,
  maxReadingsPerBatch: 50,
  clockSkewMs: 300_000,
  allowedSources: ["pi_bridge"],
  allowedMetrics: ["temperature_c", "humidity_pct"],
};

describe("defaultPiIngestConfig", () => {
  it("returns a fully-populated config", () => {
    const c = defaultPiIngestConfig();
    expect(c.windowMs).toBeGreaterThan(0);
    expect(c.maxRequestsPerWindow).toBeGreaterThan(0);
    expect(c.maxReadingsPerBatch).toBeGreaterThan(0);
    expect(c.clockSkewMs).toBeGreaterThanOrEqual(0);
    expect(c.allowedSources).toContain("pi_bridge");
    expect(c.allowedMetrics).toEqual(
      expect.arrayContaining([
        "temperature_c",
        "humidity_pct",
        "vpd_kpa",
        "co2_ppm",
        "soil_moisture_pct",
      ]),
    );
  });

  it("does not allow sim or manual as default sources", () => {
    const c = defaultPiIngestConfig();
    expect(c.allowedSources).not.toContain("sim");
    expect(c.allowedSources).not.toContain("manual");
  });

  it("does not allow unsupported metrics by default", () => {
    const c = defaultPiIngestConfig();
    for (const m of ["ppfd", "dli", "soil_ec", "reservoir_ph"])
      expect(c.allowedMetrics).not.toContain(m);
  });

  it("returns a frozen object", () => {
    const c = defaultPiIngestConfig();
    expect(Object.isFrozen(c)).toBe(true);
    expect(() => {
      (c as { windowMs: number }).windowMs = 1;
    }).toThrow();
  });

  it("default clock skew matches the 5-minute contract", () => {
    expect(defaultPiIngestConfig().clockSkewMs).toBe(5 * 60_000);
  });
});

describe("validatePiIngestConfig", () => {
  it("accepts a fully valid config", () => {
    const r = validatePiIngestConfig({ ...VALID });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.windowMs).toBe(60_000);
  });

  it("rejects non-objects", () => {
    for (const v of [null, undefined, 1, "x", []]) {
      const r = validatePiIngestConfig(v);
      expect(r.ok).toBe(false);
      if (r.ok === false) expect(r.issues[0].code).toBe("not_an_object");
    }
  });

  it.each([
    ["windowMs", 0, "invalid_window_ms"],
    ["windowMs", -1, "invalid_window_ms"],
    ["windowMs", 1.5, "invalid_window_ms"],
    ["maxRequestsPerWindow", 0, "invalid_max_requests_per_window"],
    ["maxReadingsPerBatch", -5, "invalid_max_readings_per_batch"],
    ["clockSkewMs", -1, "invalid_clock_skew_ms"],
    ["clockSkewMs", 1.2, "invalid_clock_skew_ms"],
  ])("rejects invalid %s=%s", (field, value, code) => {
    const r = validatePiIngestConfig({ ...VALID, [field as string]: value });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.issues.some((i) => i.code === code)).toBe(true);
  });

  it("allows clockSkewMs = 0", () => {
    const r = validatePiIngestConfig({ ...VALID, clockSkewMs: 0 });
    expect(r.ok).toBe(true);
  });

  it("rejects non-array allowedSources", () => {
    const r = validatePiIngestConfig({ ...VALID, allowedSources: "pi_bridge" });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.issues[0].code).toBe("invalid_allowed_sources");
  });

  it("rejects empty allowedSources", () => {
    const r = validatePiIngestConfig({ ...VALID, allowedSources: [] });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.issues[0].code).toBe("empty_allowed_sources");
  });

  it("rejects empty allowedMetrics", () => {
    const r = validatePiIngestConfig({ ...VALID, allowedMetrics: [] });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.issues[0].code).toBe("empty_allowed_metrics");
  });

  it("rejects non-string source entries", () => {
    const r = validatePiIngestConfig({ ...VALID, allowedSources: ["pi_bridge", 123] });
    expect(r.ok).toBe(false);
  });

  it("rejects empty-string entries", () => {
    const r = validatePiIngestConfig({ ...VALID, allowedSources: ["pi_bridge", "  "] });
    expect(r.ok).toBe(false);
  });

  it("deduplicates trimmed list entries", () => {
    const r = validatePiIngestConfig({
      ...VALID,
      allowedMetrics: [" temperature_c ", "temperature_c", "humidity_pct"],
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.allowedMetrics).toEqual(["temperature_c", "humidity_pct"]);
  });

  it("accumulates multiple issues", () => {
    const r = validatePiIngestConfig({
      windowMs: 0,
      maxRequestsPerWindow: -1,
      maxReadingsPerBatch: 0,
      clockSkewMs: -1,
      allowedSources: [],
      allowedMetrics: [],
    });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.issues.length).toBeGreaterThanOrEqual(4);
  });

  it("returns a frozen config on success", () => {
    const r = validatePiIngestConfig({ ...VALID });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.isFrozen(r.config)).toBe(true);
      expect(Object.isFrozen(r.config.allowedSources)).toBe(true);
      expect(Object.isFrozen(r.config.allowedMetrics)).toBe(true);
    }
  });

  it("default config passes validation", () => {
    const r = validatePiIngestConfig({ ...defaultPiIngestConfig() });
    expect(r.ok).toBe(true);
  });
});

describe("mergePiIngestConfig", () => {
  const base = defaultPiIngestConfig();

  it("returns base when override is undefined", () => {
    const r = mergePiIngestConfig(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config).toEqual(base);
  });

  it("returns base when override is null", () => {
    const r = mergePiIngestConfig(base, null);
    expect(r.ok).toBe(true);
  });

  it("shallow-merges scalar overrides", () => {
    const r = mergePiIngestConfig(base, { maxReadingsPerBatch: 100 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.maxReadingsPerBatch).toBe(100);
      expect(r.config.windowMs).toBe(base.windowMs);
    }
  });

  it("replaces arrays — does not concat", () => {
    const r = mergePiIngestConfig(base, { allowedMetrics: ["temperature_c"] });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.allowedMetrics).toEqual(["temperature_c"]);
  });

  it("ignores undefined override fields", () => {
    const r = mergePiIngestConfig(base, { windowMs: undefined });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.config.windowMs).toBe(base.windowMs);
  });

  it("propagates validation failures", () => {
    const r = mergePiIngestConfig(base, { windowMs: -1 });
    expect(r.ok).toBe(false);
  });

  it("returned merged config is frozen", () => {
    const r = mergePiIngestConfig(base, { maxRequestsPerWindow: 30 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.isFrozen(r.config)).toBe(true);
  });

  it("does not mutate the base config", () => {
    const snap = JSON.parse(JSON.stringify(base));
    mergePiIngestConfig(base, { maxReadingsPerBatch: 999, allowedMetrics: ["co2_ppm"] });
    expect(JSON.parse(JSON.stringify(base))).toEqual(snap);
  });
});

describe("piIngestConfigRules — static safety", () => {
  const src = readFileSync(resolve(__dirname, "../lib/piIngestConfigRules.ts"), "utf8");

  it.each([
    ["no Supabase import", /from\s+["']@\/integrations\/supabase/],
    ["no React import", /from\s+["']react["']/],
    ["no fetch usage", /\bfetch\s*\(/],
    ["no env reads", /process\.env|import\.meta\.env|Deno\.env/],
    ["no service_role", /service_role/i],
    ["no Date.now()", /Date\.now\s*\(/],
  ])("%s", (_l, re) => {
    expect(src).not.toMatch(re);
  });
});
