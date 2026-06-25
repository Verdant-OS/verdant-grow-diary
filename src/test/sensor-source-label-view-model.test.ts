/**
 * sensorSourceLabelViewModel — pure helper unit tests.
 * No I/O. No React.
 */
import { describe, it, expect } from "vitest";
import {
  buildSensorSourceBadge,
  sourceBadgeToneClass,
} from "@/lib/sensorSourceLabelViewModel";

describe("sensorSourceLabelViewModel", () => {
  it("labels manual readings prominently and never as Live", () => {
    const b = buildSensorSourceBadge({ source: "manual" });
    expect(b.label).toBe("Manual reading");
    expect(b.tone).toBe("manual");
    expect(b.isManual).toBe(true);
    expect(b.isDegraded).toBe(false);
    expect(b.label.toLowerCase()).not.toContain("live");
    expect(b.truthCopyGuard.canDescribeAsLive).toBe(false);
  });

  it("appends a manual device note when provided", () => {
    const b = buildSensorSourceBadge({
      source: "manual",
      manualDeviceNote: "EcoWitt WH45",
    });
    expect(b.label).toBe("Manual reading · EcoWitt WH45");
    expect(b.isManual).toBe(true);
    expect(b.tone).toBe("manual");
  });

  it("extracts manual device note from a manual: prefixed device_id", () => {
    const b = buildSensorSourceBadge({
      source: "manual",
      deviceId: "manual:Handheld meter",
    });
    expect(b.label).toBe("Manual reading · Handheld meter");
  });

  it("ignores vendor tag for manual readings (never promotes to Live)", () => {
    const b = buildSensorSourceBadge({ source: "manual", vendor: "ecowitt" });
    expect(b.tone).toBe("manual");
    expect(b.label.toLowerCase()).not.toMatch(/^live$|^ecowitt$/);
    expect(b.label).toContain("Manual");
  });

  it("renders live readings as Live sensor and marks them healthy (not degraded)", () => {
    const b = buildSensorSourceBadge({ source: "live" });
    expect(b.label).toBe("Live sensor");
    expect(b.tone).toBe("live");
    expect(b.isDegraded).toBe(false);
    expect(b.truthCopyGuard.canDescribeAsHealthyLive).toBe(false);
  });

  it("allows healthy-live copy only when live source also has usable status", () => {
    const b = buildSensorSourceBadge({ source: "live", status: "usable" });
    expect(b.truthCopyGuard.verdict).toBe("healthy_live");
    expect(b.truthCopyGuard.canDescribeAsLive).toBe(true);
    expect(b.truthCopyGuard.canDescribeAsCurrent).toBe(true);
    expect(b.truthCopyGuard.canDescribeAsHealthyLive).toBe(true);
  });

  it("promotes recognised vendor only for live readings", () => {
    const b = buildSensorSourceBadge({ source: "live", vendor: "ecowitt" });
    expect(b.vendor).toBe("ecowitt");
    expect(b.label).toBe("Ecowitt");
    expect(b.tone).toBe("live");
  });

  it.each(["demo", "stale", "invalid"] as const)(
    "marks %s readings degraded with their own tone, never as Live",
    (source) => {
      const b = buildSensorSourceBadge({ source });
      expect(b.tone).toBe(source);
      expect(b.isDegraded).toBe(true);
      expect(b.label.toLowerCase()).not.toContain("live");
      expect(b.truthCopyGuard.canDescribeAsHealthyLive).toBe(false);
    },
  );

  it("renders demo/stale/invalid with clear degraded copy", () => {
    expect(buildSensorSourceBadge({ source: "demo" }).label).toBe("Demo data");
    expect(buildSensorSourceBadge({ source: "stale" }).label).toBe(
      "Stale reading",
    );
    expect(buildSensorSourceBadge({ source: "invalid" }).label).toBe(
      "Invalid reading",
    );
  });

  it("collapses unknown/missing source to Unknown source — never Live", () => {
    const b1 = buildSensorSourceBadge({
      source: "ghost" as unknown as undefined,
    });
    expect(b1.label).toBe("Unknown source");
    expect(b1.tone).toBe("unknown");
    expect(b1.isDegraded).toBe(true);
    expect(b1.truthCopyGuard.verdict).toBe("unknown_blocked");

    const b2 = buildSensorSourceBadge({ source: null });
    expect(b2.label).toBe("Unknown source");
    expect(b2.tone).toBe("unknown");
  });

  it("ariaLabel is plain 'Sensor source: …' and never leaks raw tags", () => {
    expect(buildSensorSourceBadge({ source: "manual" }).ariaLabel).toBe(
      "Sensor source: Manual reading",
    );
    expect(buildSensorSourceBadge({ source: "stale" }).ariaLabel).toBe(
      "Sensor source: Stale reading",
    );
    expect(buildSensorSourceBadge({ source: null }).ariaLabel).toBe(
      "Sensor source: Unknown source",
    );
    const m = buildSensorSourceBadge({
      source: "manual",
      manualDeviceNote: "EcoWitt WH45",
    });
    expect(m.ariaLabel).toBe("Sensor source: Manual reading, EcoWitt WH45");
    expect(m.ariaLabel).not.toMatch(/\[alert:|\[source:/);
  });

  it("tone classes for degraded states differ from live", () => {
    const live = sourceBadgeToneClass("live");
    for (const t of ["demo", "stale", "invalid", "unknown"] as const) {
      expect(sourceBadgeToneClass(t)).not.toBe(live);
    }
  });

  it("CSV readings render as CSV import with their own tone", () => {
    const b = buildSensorSourceBadge({ source: "csv" });
    expect(b.label).toBe("CSV import");
    expect(b.tone).toBe("csv");
    expect(b.isDegraded).toBe(false);
    expect(b.truthCopyGuard.verdict).toBe("historical_context");
    expect(b.truthCopyGuard.canDescribeAsLive).toBe(false);
  });
});
