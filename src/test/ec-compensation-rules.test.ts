import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeEcCompensation } from "@/lib/ecCompensationRules";

describe("computeEcCompensation — happy paths", () => {
  it("valid mS/cm + Celsius (live) calculates with high confidence", () => {
    const r = computeEcCompensation({
      ecValue: 1.8,
      ecUnit: "mS/cm",
      temperatureValue: 28,
      temperatureUnit: "C",
      sourceLabel: "live",
    });
    expect(r.blockedReason).toBeNull();
    expect(r.method).toBe("linear_25c");
    expect(r.normalizedUnit).toBe("mS/cm");
    expect(r.confidence).toBe("high");
    expect(r.compensatedEc25c).toBeCloseTo(1.8 / (1 + 0.019 * 3), 6);
  });

  it("valid µS/cm normalizes safely to mS/cm (medium confidence)", () => {
    const r = computeEcCompensation({
      ecValue: 1800,
      ecUnit: "µS/cm",
      temperatureValue: 25,
      temperatureUnit: "C",
      sourceLabel: "manual",
    });
    expect(r.blockedReason).toBeNull();
    expect(r.compensatedEc25c).toBeCloseTo(1.8, 6);
    expect(r.confidence).toBe("medium");
    expect(r.warnings.join(" ")).toMatch(/normalized from µS\/cm/);
  });

  it("Fahrenheit converts only when explicitly labeled F", () => {
    const r = computeEcCompensation({
      ecValue: 2.0,
      ecUnit: "mS/cm",
      temperatureValue: 77, // = 25 °C
      temperatureUnit: "F",
      sourceLabel: "live",
    });
    expect(r.blockedReason).toBeNull();
    expect(r.compensatedEc25c).toBeCloseTo(2.0, 4);
    expect(r.warnings.some((w) => /Fahrenheit/.test(w))).toBe(true);
  });

  it("is deterministic for identical inputs", () => {
    const args = {
      ecValue: 1.5,
      ecUnit: "mS/cm" as const,
      temperatureValue: 22,
      temperatureUnit: "C" as const,
      sourceLabel: "live",
    };
    expect(computeEcCompensation(args)).toEqual(computeEcCompensation(args));
  });
});

describe("computeEcCompensation — safety blocks", () => {
  it("blocks suspicious EC magnitude (µS/cm value entered as mS/cm)", () => {
    const r = computeEcCompensation({
      ecValue: 1800,
      ecUnit: "mS/cm",
      temperatureValue: 25,
      temperatureUnit: "C",
      sourceLabel: "live",
    });
    expect(r.blockedReason).toBe("suspicious_ec_magnitude");
    expect(r.compensatedEc25c).toBeNull();
  });

  it("blocks suspicious temperature magnitude", () => {
    const r = computeEcCompensation({
      ecValue: 1.8,
      ecUnit: "mS/cm",
      temperatureValue: 78, // °C is impossible in a tent
      temperatureUnit: "C",
      sourceLabel: "live",
    });
    expect(r.blockedReason).toBe("suspicious_temperature_magnitude");
  });

  it.each([
    ["missing_ec", { ecValue: null }],
    ["missing_temperature", { temperatureValue: null }],
  ] as const)("returns %s when input missing", (reason, patch) => {
    const r = computeEcCompensation({
      ecValue: 1.8,
      ecUnit: "mS/cm",
      temperatureValue: 24,
      temperatureUnit: "C",
      sourceLabel: "live",
      ...(patch as object),
    });
    expect(r.blockedReason).toBe(reason);
  });

  it("blocks unknown EC unit", () => {
    const r = computeEcCompensation({
      ecValue: 1.8,
      ecUnit: "siemens" as never,
      temperatureValue: 24,
      temperatureUnit: "C",
      sourceLabel: "live",
    });
    expect(r.blockedReason).toBe("unknown_ec_unit");
  });

  it("blocks unknown temperature unit (no implicit assumption)", () => {
    const r = computeEcCompensation({
      ecValue: 1.8,
      ecUnit: "mS/cm",
      temperatureValue: 24,
      temperatureUnit: "K" as never,
      sourceLabel: "live",
    });
    expect(r.blockedReason).toBe("unknown_temperature_unit");
  });

  it.each(["demo", "stale", "invalid", "", "unknown_bridge"])(
    "rejects untrusted source %s",
    (src) => {
      const r = computeEcCompensation({
        ecValue: 1.8,
        ecUnit: "mS/cm",
        temperatureValue: 24,
        temperatureUnit: "C",
        sourceLabel: src,
      });
      expect(r.blockedReason).toBe("unsafe_source");
      expect(r.compensatedEc25c).toBeNull();
    },
  );

  it("csv source is allowed but downgraded to low confidence", () => {
    const r = computeEcCompensation({
      ecValue: 1.8,
      ecUnit: "mS/cm",
      temperatureValue: 24,
      temperatureUnit: "C",
      sourceLabel: "csv",
    });
    expect(r.blockedReason).toBeNull();
    expect(r.confidence).toBe("low");
  });
});

describe("ecCompensationRules — static safety", () => {
  it("module imports no Supabase / network / cron surfaces", () => {
    const src = readFileSync(
      resolve(__dirname, "../lib/ecCompensationRules.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/integrations\/supabase/);
    expect(src).not.toMatch(/supabase-js/);
    expect(src).not.toMatch(/\bfetch\s*\(/);
    expect(src).not.toMatch(/pg_cron|cron|setInterval|setTimeout/);
    expect(src).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
  });
});
