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

  it("renders live readings as Live and marks them healthy (not degraded)", () => {
    const b = buildSensorSourceBadge({ source: "live" });
    expect(b.label).toBe("Live");
    expect(b.tone).toBe("live");
    expect(b.isDegraded).toBe(false);
  });

  it("promotes recognised vendor only for live readings", () => {
    const b = buildSensorSourceBadge({ source: "live", vendor: "ecowitt" });
    expect(b.vendor).toBe("ecowitt");
    expect(b.label).toBe("Ecowitt");
    expect(b.tone).toBe("live");
  });

  it.each(["demo", "stale", "invalid"] as const)(
    "marks %s readings degraded with their own tone",
    (source) => {
      const b = buildSensorSourceBadge({ source });
      expect(b.tone).toBe(source);
      expect(b.isDegraded).toBe(true);
      expect(b.label.toLowerCase()).not.toBe("live");
    },
  );

  it("collapses unknown/missing source to Unknown — never Live", () => {
    const b1 = buildSensorSourceBadge({
      source: "ghost" as unknown as undefined,
    });
    expect(b1.label).toBe("Unknown");
    expect(b1.tone).toBe("unknown");
    expect(b1.isDegraded).toBe(true);

    const b2 = buildSensorSourceBadge({ source: null });
    expect(b2.label).toBe("Unknown");
    expect(b2.tone).toBe("unknown");
  });

  it("ariaLabel describes the source for screen readers without leaking ids", () => {
    const b = buildSensorSourceBadge({
      source: "manual",
      manualDeviceNote: "EcoWitt WH45",
    });
    expect(b.ariaLabel.toLowerCase()).toContain("manual reading");
    expect(b.ariaLabel).toContain("EcoWitt WH45");
  });

  it("tone classes for degraded states differ from live", () => {
    const live = sourceBadgeToneClass("live");
    for (const t of ["demo", "stale", "invalid", "unknown"] as const) {
      expect(sourceBadgeToneClass(t)).not.toBe(live);
    }
  });

  it("CSV readings render as CSV with their own tone", () => {
    const b = buildSensorSourceBadge({ source: "csv" });
    expect(b.label).toBe("CSV");
    expect(b.tone).toBe("csv");
    expect(b.isDegraded).toBe(false);
  });
});
