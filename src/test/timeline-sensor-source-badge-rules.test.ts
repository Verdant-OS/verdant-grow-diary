/**
 * timeline-sensor-source-badge-rules — pure helper tests.
 */
import { describe, it, expect } from "vitest";
import { classifyTimelineSensorSource } from "@/lib/timelineSensorSourceBadgeRules";

describe("classifyTimelineSensorSource", () => {
  it("returns live for an explicit fresh live source", () => {
    expect(
      classifyTimelineSensorSource({
        rawSource: "live",
        capturedAt: new Date().toISOString(),
        staleMs: 60_000,
      }).kind,
    ).toBe("live");
  });

  it("downgrades stale live readings to stale", () => {
    const now = Date.parse("2025-01-01T12:00:00Z");
    expect(
      classifyTimelineSensorSource({
        rawSource: "live",
        capturedAt: "2025-01-01T00:00:00Z",
        staleMs: 60_000,
        now,
      }).kind,
    ).toBe("stale");
  });

  it("never renders missing source as live; uses fallback", () => {
    expect(classifyTimelineSensorSource({ rawSource: null, fallback: "manual" }).kind).toBe("manual");
    expect(classifyTimelineSensorSource({ rawSource: "" }).kind).toBe("invalid");
    expect(classifyTimelineSensorSource({ rawSource: "totally-bogus" }).kind).toBe("invalid");
  });

  it("maps canonical sources", () => {
    expect(classifyTimelineSensorSource({ rawSource: "manual" }).kind).toBe("manual");
    expect(classifyTimelineSensorSource({ rawSource: "csv" }).kind).toBe("csv");
    expect(classifyTimelineSensorSource({ rawSource: "demo" }).kind).toBe("demo");
    expect(classifyTimelineSensorSource({ rawSource: "invalid" }).kind).toBe("invalid");
  });

  it("does not downgrade csv/manual/demo with stale freshness", () => {
    const now = Date.parse("2025-01-01T12:00:00Z");
    for (const s of ["csv", "manual", "demo"] as const) {
      const r = classifyTimelineSensorSource({
        rawSource: s,
        capturedAt: "2024-01-01T00:00:00Z",
        staleMs: 60_000,
        now,
      });
      expect(r.kind).toBe(s);
    }
  });

  it("treats unrecognized fallback as invalid", () => {
    // @ts-expect-error guard
    expect(classifyTimelineSensorSource({ rawSource: null, fallback: "bogus" }).kind).toBe("invalid");
  });
});
