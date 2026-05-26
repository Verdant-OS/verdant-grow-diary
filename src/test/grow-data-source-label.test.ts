import { describe, it, expect } from "vitest";
import { classifyGrowDataSource, type GrowDataSourceInput } from "@/lib/growDataSourceLabelRules";

const NOW = new Date("2026-05-21T12:00:00.000Z").getTime();
const recent = new Date(NOW - 60 * 1000).toISOString(); // 1 min ago
const old = new Date(NOW - 60 * 60 * 1000).toISOString(); // 1 hour ago

describe("classifyGrowDataSource", () => {
  it("classifies recent supabase/sensor reading as Live and trusted", () => {
    for (const source of ["supabase", "sensor", "hassio", "broker", "api"]) {
      const r = classifyGrowDataSource({ source, value: 24.5, timestamp: recent }, { now: NOW });
      expect(r.label).toBe("Live");
      expect(r.severity).toBe("good");
      expect(r.isTrustedForAi).toBe(true);
      expect(r.shouldDisplayBadge).toBe(false);
    }
  });

  it("classifies recent manual entry as Manual and trusted", () => {
    const r = classifyGrowDataSource(
      { source: "manual", value: 6.1, timestamp: recent },
      { now: NOW },
    );
    expect(r.label).toBe("Manual");
    expect(r.isTrustedForAi).toBe(true);
    expect(r.shouldDisplayBadge).toBe(true);
  });

  it("classifies mock/demo as Demo and not trusted", () => {
    for (const source of ["mock", "demo", "MOCK", " demo "]) {
      const r = classifyGrowDataSource({ source, value: 24.5, timestamp: recent }, { now: NOW });
      expect(r.label).toBe("Demo");
      expect(r.isTrustedForAi).toBe(false);
      expect(r.shouldDisplayBadge).toBe(true);
    }
  });

  it("never classifies demo data as Live even with fresh timestamp", () => {
    const r = classifyGrowDataSource(
      { source: "mock", value: 24.5, timestamp: recent },
      { now: NOW },
    );
    expect(r.label).not.toBe("Live");
    expect(r.isTrustedForAi).toBe(false);
  });

  it("classifies stale real data as Stale and not trusted", () => {
    const r = classifyGrowDataSource(
      { source: "sensor", value: 24.5, timestamp: old },
      { now: NOW },
    );
    expect(r.label).toBe("Stale");
    expect(r.isTrustedForAi).toBe(false);
  });

  it("classifies stale manual entry as Stale and not trusted", () => {
    const r = classifyGrowDataSource({ source: "manual", value: 6, timestamp: old }, { now: NOW });
    expect(r.label).toBe("Stale");
    expect(r.isTrustedForAi).toBe(false);
  });

  it("classifies missing source as Unavailable", () => {
    const r = classifyGrowDataSource({ value: 24.5, timestamp: recent }, { now: NOW });
    expect(r.label).toBe("Unavailable");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.reasons).toContain("missing source");
  });

  it("classifies missing value as Unavailable", () => {
    const r = classifyGrowDataSource(
      { source: "sensor", value: null, timestamp: recent },
      { now: NOW },
    );
    expect(r.label).toBe("Unavailable");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.reasons).toContain("missing value");
  });

  it("classifies invalid timestamp as Stale for real sources", () => {
    const r = classifyGrowDataSource(
      { source: "sensor", value: 24.5, timestamp: "not-a-date" },
      { now: NOW },
    );
    expect(r.label).toBe("Stale");
    expect(r.isTrustedForAi).toBe(false);
    expect(r.reasons).toContain("invalid timestamp");
  });

  it("treats NaN and Infinity values as missing", () => {
    for (const v of [NaN, Infinity, -Infinity]) {
      const r = classifyGrowDataSource(
        { source: "sensor", value: v, timestamp: recent },
        { now: NOW },
      );
      expect(r.label).toBe("Unavailable");
      expect(r.isTrustedForAi).toBe(false);
    }
  });

  it("treats NaN timestamp as invalid", () => {
    const r = classifyGrowDataSource({ source: "sensor", value: 1, timestamp: NaN }, { now: NOW });
    expect(r.label).toBe("Stale");
    expect(r.isTrustedForAi).toBe(false);
  });

  it("handles null and undefined input safely", () => {
    expect(classifyGrowDataSource(null, { now: NOW }).label).toBe("Unavailable");
    expect(classifyGrowDataSource(undefined, { now: NOW }).label).toBe("Unavailable");
  });

  it("handles empty strings safely", () => {
    const r = classifyGrowDataSource({ source: "", value: "", timestamp: "" }, { now: NOW });
    expect(r.label).toBe("Unavailable");
    expect(r.isTrustedForAi).toBe(false);
  });

  it("respects a custom stale threshold", () => {
    const tenMinAgo = new Date(NOW - 10 * 60 * 1000).toISOString();
    const fresh = classifyGrowDataSource(
      { source: "sensor", value: 1, timestamp: tenMinAgo },
      { now: NOW, staleThresholdMs: 30 * 60 * 1000 },
    );
    expect(fresh.label).toBe("Live");

    const stale = classifyGrowDataSource(
      { source: "sensor", value: 1, timestamp: tenMinAgo },
      { now: NOW, staleThresholdMs: 5 * 60 * 1000 },
    );
    expect(stale.label).toBe("Stale");
  });

  it("is deterministic for repeated identical inputs", () => {
    const input = { source: "sensor", value: 24.5, timestamp: recent };
    const a = classifyGrowDataSource(input, { now: NOW });
    const b = classifyGrowDataSource(input, { now: NOW });
    expect(a).toEqual(b);
  });

  it("never trusts demo/missing/stale/invalid for AI", () => {
    const cases: GrowDataSourceInput[] = [
      { source: "mock", value: 1, timestamp: recent },
      { source: "sensor", value: null, timestamp: recent },
      { value: 1, timestamp: recent },
      { source: "sensor", value: 1, timestamp: old },
      { source: "sensor", value: 1, timestamp: "bad" },
    ];
    for (const c of cases) {
      expect(classifyGrowDataSource(c, { now: NOW }).isTrustedForAi).toBe(false);
    }
  });

  it("does not leak raw payload values into messages", () => {
    const r = classifyGrowDataSource(
      { source: "sensor", value: 999.123, timestamp: recent },
      { now: NOW },
    );
    expect(r.message).not.toContain("999");
  });
});
