/**
 * Tests for `manualSensorSnapshotFieldValidation` — pure per-field
 * validation + VPD derivation for the manual sensor edit form.
 */
import { describe, it, expect } from "vitest";
import {
  validateManualSensorSnapshotFields,
  VPD_CONFLICT_THRESHOLD_KPA,
} from "@/lib/manualSensorSnapshotFieldValidation";

const NOW_MS = new Date("2026-07-07T19:00:00Z").getTime();
const HOURS_AGO = (h: number) => new Date(NOW_MS - h * 3600_000).toISOString();

describe("validateManualSensorSnapshotFields", () => {
  it("returns no hints for a healthy manual reading and derives VPD deterministically", () => {
    const v = validateManualSensorSnapshotFields(
      {
        source: "manual",
        capturedAt: HOURS_AGO(1),
        temperatureC: 24,
        humidityPct: 55,
      },
      { nowMs: NOW_MS },
    );
    expect(v.hints).toHaveLength(0);
    expect(v.hasBlockingErrors).toBe(false);
    expect(v.sourceLabel).toBe("manual");
    expect(v.derivedVpd.kind).toBe("derived");
    if (v.derivedVpd.kind === "derived") {
      // Tetens @ 24°C / 55% RH ≈ 1.34 kPa
      expect(v.derivedVpd.vpdKpa).toBeGreaterThan(1.3);
      expect(v.derivedVpd.vpdKpa).toBeLessThan(1.4);
    }
  });

  it("humidity stuck at 0 or 100 produces a warn hint (not blocking)", () => {
    for (const rh of [0, 100]) {
      const v = validateManualSensorSnapshotFields(
        { source: "manual", capturedAt: HOURS_AGO(1), humidityPct: rh },
        { nowMs: NOW_MS },
      );
      const h = v.hints.find((x) => x.field === "humidityPct");
      expect(h?.severity).toBe("warn");
      expect(v.hasBlockingErrors).toBe(false);
    }
  });

  it("humidity outside 0–100 blocks", () => {
    const v = validateManualSensorSnapshotFields(
      { source: "manual", humidityPct: 150 },
      { nowMs: NOW_MS },
    );
    const h = v.hints.find((x) => x.field === "humidityPct");
    expect(h?.severity).toBe("block");
    expect(v.hasBlockingErrors).toBe(true);
  });

  it("temperature outside realistic grow range blocks", () => {
    const v = validateManualSensorSnapshotFields(
      { source: "manual", temperatureC: 999 },
      { nowMs: NOW_MS },
    );
    const h = v.hints.find((x) => x.field === "temperatureC");
    expect(h?.severity).toBe("block");
  });

  it("VPD outside realistic range blocks", () => {
    const v = validateManualSensorSnapshotFields(
      { source: "manual", vpdKpa: 10 },
      { nowMs: NOW_MS },
    );
    const h = v.hints.find((x) => x.field === "vpdKpa");
    expect(h?.severity).toBe("block");
  });

  it("stale capturedAt warns but does not block", () => {
    const v = validateManualSensorSnapshotFields(
      { source: "manual", capturedAt: HOURS_AGO(24), temperatureC: 24, humidityPct: 55 },
      { nowMs: NOW_MS },
    );
    const h = v.hints.find((x) => x.field === "capturedAt");
    expect(h?.severity).toBe("warn");
    expect(v.hasBlockingErrors).toBe(false);
  });

  it("missing optional CO2/PPFD does NOT mark the snapshot invalid", () => {
    const v = validateManualSensorSnapshotFields(
      { source: "manual", capturedAt: HOURS_AGO(1), temperatureC: 24, humidityPct: 55 },
      { nowMs: NOW_MS },
    );
    expect(v.hasBlockingErrors).toBe(false);
    expect(v.hints.find((h) => h.field === "co2Ppm")).toBeUndefined();
    expect(v.hints.find((h) => h.field === "ppfdUmol")).toBeUndefined();
  });

  it("temp + RH without VPD derives VPD (kind=derived)", () => {
    const v = validateManualSensorSnapshotFields(
      { source: "manual", temperatureC: 22, humidityPct: 60 },
      { nowMs: NOW_MS },
    );
    expect(v.derivedVpd.kind).toBe("derived");
  });

  it("missing temp or RH cannot derive VPD; not marked invalid", () => {
    const v = validateManualSensorSnapshotFields(
      { source: "manual", temperatureC: 24 },
      { nowMs: NOW_MS },
    );
    expect(v.derivedVpd.kind).toBe("missing");
    if (v.derivedVpd.kind === "missing") {
      expect(v.derivedVpd.reason).toBe("needs_temperature_and_humidity");
    }
  });

  it("entered VPD is preserved (kind=entered), never silently overridden", () => {
    const v = validateManualSensorSnapshotFields(
      { source: "manual", temperatureC: 24, humidityPct: 55, vpdKpa: 1.32 },
      { nowMs: NOW_MS },
    );
    expect(v.derivedVpd.kind).toBe("entered");
    if (v.derivedVpd.kind === "entered") {
      expect(v.derivedVpd.vpdKpa).toBe(1.32);
    }
  });

  it("entered VPD that conflicts strongly with derived VPD emits a warn hint", () => {
    // Derived ≈ 1.34; entered 0.5 → diff 0.84 > threshold
    const v = validateManualSensorSnapshotFields(
      { source: "manual", temperatureC: 24, humidityPct: 55, vpdKpa: 0.5 },
      { nowMs: NOW_MS },
    );
    const warn = v.hints.find(
      (h) => h.field === "vpdKpa" && h.severity === "warn",
    );
    expect(warn).toBeDefined();
    expect(VPD_CONFLICT_THRESHOLD_KPA).toBeGreaterThan(0);
  });

  it("sourceLabel is preserved verbatim — never rewritten to live", () => {
    const v = validateManualSensorSnapshotFields(
      { source: "manual", capturedAt: HOURS_AGO(1) },
      { nowMs: NOW_MS },
    );
    expect(v.sourceLabel).toBe("manual");
    expect(v.sourceLabel).not.toBe("live");
  });

  it("null input returns no hints and missing-VPD (safe default)", () => {
    const v = validateManualSensorSnapshotFields(null, { nowMs: NOW_MS });
    expect(v.hints).toHaveLength(0);
    expect(v.derivedVpd.kind).toBe("missing");
  });
});
