import { describe, expect, it } from "vitest";
import { CANONICAL_SENSOR_SOURCES } from "@/constants/sensorIngestProvenance";
import { evaluateCurrentLiveSensorTruth } from "@/lib/currentLiveSensorTruthRules";

describe("current live sensor truth — three-factor matrix", () => {
  const qualities = ["ok", "degraded", "stale", "invalid", null] as const;
  const freshnessStates = ["fresh", "stale", "invalid", "unknown"] as const;

  it("permits exactly source=live + quality=ok + freshness=fresh", () => {
    let allowed = 0;

    for (const source of CANONICAL_SENSOR_SOURCES) {
      for (const quality of qualities) {
        for (const freshness of freshnessStates) {
          const result = evaluateCurrentLiveSensorTruth({ source, quality, freshness });
          const expected = source === "live" && quality === "ok" && freshness === "fresh";
          expect(result.isCurrentLive).toBe(expected);
          if (result.isCurrentLive) allowed += 1;
        }
      }
    }

    expect(allowed).toBe(1);
  });

  it("fails closed for aliases, casing tricks, and unknown values", () => {
    for (const source of ["ecowitt", "pi_bridge", "sensor", " LIVE ", "unknown", null]) {
      expect(
        evaluateCurrentLiveSensorTruth({ source, quality: "ok", freshness: "fresh" }).isCurrentLive,
      ).toBe(false);
    }
  });

  it("reports each factor independently for presenter-safe diagnostics", () => {
    expect(
      evaluateCurrentLiveSensorTruth({
        source: "live",
        quality: "degraded",
        freshness: "stale",
      }),
    ).toEqual({
      canonicalSource: "live",
      normalizedQuality: "degraded",
      sourceIsLive: true,
      qualityIsOk: false,
      freshnessIsFresh: false,
      isCurrentLive: false,
    });
  });
});
