/**
 * Trust badge presenter rules — verifies that vendor identity never
 * becomes a trust label and that unknown / stale / invalid telemetry
 * is never promoted to Live.
 */
import { describe, expect, it } from "vitest";
import { classifySnapshotTrustBadge } from "@/lib/sensorSnapshotTrustBadgeRules";

describe("classifySnapshotTrustBadge", () => {
  it("live Ecowitt snapshot resolves to Live + Ecowitt provider", () => {
    const v = classifySnapshotTrustBadge({
      resolverStatus: "fresh_live",
      source: "ecowitt",
    });
    expect(v.badge).toBe("live");
    expect(v.label).toBe("Live");
    expect(v.attachable).toBe(true);
    expect(v.providerLabel).toBe("EcoWitt");
  });

  it("stale Ecowitt snapshot shows Stale + Ecowitt", () => {
    const v = classifySnapshotTrustBadge({
      resolverStatus: "stale",
      source: "ecowitt",
    });
    expect(v.badge).toBe("stale");
    expect(v.attachable).toBe(false);
    expect(v.providerLabel).toBe("EcoWitt");
  });

  it("invalid Ecowitt snapshot shows Invalid + Ecowitt", () => {
    const v = classifySnapshotTrustBadge({
      resolverStatus: "invalid",
      source: "ecowitt",
    });
    expect(v.badge).toBe("invalid");
    expect(v.attachable).toBe(false);
    expect(v.providerLabel).toBe("EcoWitt");
  });

  it("manual snapshot shows Manual", () => {
    const v = classifySnapshotTrustBadge({ source: "manual" });
    expect(v.badge).toBe("manual");
    expect(v.attachable).toBe(true);
    expect(v.providerLabel).toBe("Manual");
  });

  it("demo snapshot shows Demo and is not attachable", () => {
    const v = classifySnapshotTrustBadge({ source: "demo" });
    expect(v.badge).toBe("demo");
    expect(v.attachable).toBe(false);
  });

  it("CSV snapshot shows CSV and is attachable", () => {
    const v = classifySnapshotTrustBadge({ source: "csv" });
    expect(v.badge).toBe("csv");
    expect(v.attachable).toBe(true);
  });

  it("ecowitt_mqtt vendor string never resolves to Live without resolver verdict", () => {
    const v = classifySnapshotTrustBadge({ source: "ecowitt_mqtt" });
    expect(v.badge).not.toBe("live");
    expect(v.badge).toBe("invalid");
  });

  it("unknown / bad source does not render as Live", () => {
    const v = classifySnapshotTrustBadge({ source: "wat" });
    expect(v.badge).not.toBe("live");
  });

  it("empty snapshot resolves to invalid (not attachable)", () => {
    const v = classifySnapshotTrustBadge({ empty: true });
    expect(v.badge).toBe("invalid");
    expect(v.attachable).toBe(false);
  });

  it("fresh_non_live preserves source identity (manual/csv/demo)", () => {
    expect(
      classifySnapshotTrustBadge({ resolverStatus: "fresh_non_live", source: "manual" }).badge,
    ).toBe("manual");
    expect(
      classifySnapshotTrustBadge({ resolverStatus: "fresh_non_live", source: "csv" }).badge,
    ).toBe("csv");
    expect(
      classifySnapshotTrustBadge({ resolverStatus: "fresh_non_live", source: "sim" }).badge,
    ).toBe("demo");
  });
});
