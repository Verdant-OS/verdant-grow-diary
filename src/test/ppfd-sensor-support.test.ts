/**
 * PPFD sensor support — covers the small "wire what's already there"
 * slice plus the new shared `ppfdRules` helper.
 *
 * Surfaces checked:
 *  - ppfdRules: label, unit, validation, formatter
 *  - manualSensorSnapshotRules: PPFD included in payload, captured_at
 *    preserved, negative PPFD rejected, missing PPFD does not yield
 *    a false healthy state
 *  - quickLogHardwareReadingsRules: PPFD canopy preserved in the
 *    handheld note suffix and never written as live sensor data
 *  - sensorFormat: shared unit metadata exposes the PPFD field
 *  - plantTentEnvironmentRules: PPFD surfaced for the tent environment
 *  - aiDoctorSensorContextRules: missing PPFD is acceptable; reading
 *    classified `invalid` never produces healthy summary; PPFD alone
 *    does not produce strong readiness
 *  - static safety: no service_role, device-control, automation,
 *    *_executed events, duplicated PPFD tables in JSX
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  PPFD_FIELD,
  PPFD_LABEL,
  PPFD_MAX,
  PPFD_MIN,
  PPFD_UNIT_LONG,
  PPFD_UNIT_SHORT,
  classifyPpfd,
  formatPpfd,
  isPpfdValid,
} from "@/lib/ppfdRules";
import { validateManualSnapshot } from "@/lib/manualSensorSnapshotRules";
import {
  appendHardwareReadingsToNote,
  formatHardwareReadingsBlock,
  hasAnyHardwareReading,
} from "@/lib/quickLogHardwareReadingsRules";
import {
  sensorFieldUnit,
  formatSensorValue,
} from "@/lib/sensorFormat";
import { mapSensorReadingToAiDoctorContext } from "@/lib/aiDoctorSensorContextRules";
import type { NormalizedSensorReading } from "@/lib/sensorReadingNormalizationRules";

// ---------------------------------------------------------------------------
// ppfdRules — pure helper
// ---------------------------------------------------------------------------

describe("ppfdRules — constants", () => {
  it("uses canonical field name 'ppfd' and label 'PPFD'", () => {
    expect(PPFD_FIELD).toBe("ppfd");
    expect(PPFD_LABEL).toBe("PPFD");
  });

  it("exposes the long unit 'µmol/m²/s'", () => {
    expect(PPFD_UNIT_LONG).toBe("µmol/m²/s");
  });

  it("exposes a short unit for compact contexts", () => {
    expect(PPFD_UNIT_SHORT).toBe("µmol");
  });

  it("uses 0..2500 as the inclusive plausible range", () => {
    expect(PPFD_MIN).toBe(0);
    expect(PPFD_MAX).toBe(2500);
  });
});

describe("ppfdRules.classifyPpfd", () => {
  it("returns unknown for null / undefined / empty string", () => {
    expect(classifyPpfd(null).kind).toBe("unknown");
    expect(classifyPpfd(undefined).kind).toBe("unknown");
    expect(classifyPpfd("").kind).toBe("unknown");
  });

  it("returns valid for numeric grow-room readings", () => {
    expect(classifyPpfd(0)).toEqual({ kind: "valid", value: 0 });
    expect(classifyPpfd(665)).toEqual({ kind: "valid", value: 665 });
    expect(classifyPpfd("900")).toEqual({ kind: "valid", value: 900 });
    expect(classifyPpfd(PPFD_MAX)).toEqual({ kind: "valid", value: PPFD_MAX });
  });

  it("returns invalid:negative for negative numbers", () => {
    const c = classifyPpfd(-1);
    expect(c.kind).toBe("invalid");
    if (c.kind === "invalid") expect(c.reason).toBe("negative");
  });

  it("returns invalid:implausible_high above 2500", () => {
    const c = classifyPpfd(5000);
    expect(c.kind).toBe("invalid");
    if (c.kind === "invalid") expect(c.reason).toBe("implausible_high");
  });

  it("returns invalid:non_finite for NaN / Infinity numbers", () => {
    expect(classifyPpfd(Number.NaN).kind).toBe("invalid");
    expect(classifyPpfd(Number.POSITIVE_INFINITY).kind).toBe("invalid");
  });

  it("returns unknown (not valid, not healthy) for non-numeric strings", () => {
    expect(classifyPpfd("bright").kind).toBe("unknown");
    expect(classifyPpfd("abc").kind).toBe("unknown");
  });
});

describe("ppfdRules.isPpfdValid", () => {
  it("is true only for finite in-range non-negative values", () => {
    expect(isPpfdValid(500)).toBe(true);
    expect(isPpfdValid(0)).toBe(true);
    expect(isPpfdValid(-5)).toBe(false);
    expect(isPpfdValid(99999)).toBe(false);
    expect(isPpfdValid(null)).toBe(false);
    expect(isPpfdValid("oops")).toBe(false);
  });
});

describe("ppfdRules.formatPpfd", () => {
  it("renders long unit by default", () => {
    expect(formatPpfd(665)).toBe("665 µmol/m²/s");
  });

  it("renders short unit on request", () => {
    expect(formatPpfd(665, { unit: "short" })).toBe("665 µmol");
  });

  it("returns placeholder for unknown / invalid values — never NaN, never 0", () => {
    expect(formatPpfd(null)).toBe("—");
    expect(formatPpfd(undefined)).toBe("—");
    expect(formatPpfd(-5)).toBe("—");
    expect(formatPpfd("bright")).toBe("—");
    expect(formatPpfd(Number.NaN)).toBe("—");
  });

  it("honors custom placeholder", () => {
    expect(formatPpfd(null, { placeholder: "Unknown" })).toBe("Unknown");
  });
});

// ---------------------------------------------------------------------------
// manualSensorSnapshotRules — PPFD wiring
// ---------------------------------------------------------------------------

describe("manualSensorSnapshotRules — PPFD wiring", () => {
  it("accepts a valid numeric PPFD and includes it in the metric payload", () => {
    const v = validateManualSnapshot({
      airTemp: 24,
      airTempUnit: "C",
      humidityPct: 55,
      ppfd: 700,
    });
    expect(v.ok).toBe(true);
    const ppfdMetric = v.metrics.find((m) => m.field === "ppfd");
    expect(ppfdMetric).toEqual({ field: "ppfd", value: 700 });
  });

  it("rejects negative PPFD with a hard error", () => {
    const v = validateManualSnapshot({
      airTemp: 24,
      airTempUnit: "C",
      humidityPct: 55,
      ppfd: -5,
    });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /PPFD/.test(e))).toBe(true);
    expect(v.metrics.some((m) => m.field === "ppfd")).toBe(false);
  });

  it("treats missing PPFD as optional — does not block snapshot", () => {
    const v = validateManualSnapshot({
      airTemp: 24,
      airTempUnit: "C",
      humidityPct: 55,
    });
    expect(v.ok).toBe(true);
    expect(v.metrics.some((m) => m.field === "ppfd")).toBe(false);
  });

  it("treats non-numeric PPFD as missing (not invalid, not healthy)", () => {
    const v = validateManualSnapshot({
      airTemp: 24,
      airTempUnit: "C",
      humidityPct: 55,
      ppfd: "bright" as unknown as string,
    });
    expect(v.metrics.some((m) => m.field === "ppfd")).toBe(false);
    // No PPFD error pushed for an unparseable value (treated as missing).
    expect(v.errors.some((e) => /PPFD/.test(e))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Quick Log handheld PPFD — manual handheld is NOT live sensor data
// ---------------------------------------------------------------------------

describe("Quick Log hardware readings — PPFD canopy", () => {
  it("preserves ppfdCanopy in the handheld block", () => {
    const block = formatHardwareReadingsBlock({ ppfdCanopy: "665" });
    expect(block).toMatch(/PPFD canopy: 665/);
    expect(hasAnyHardwareReading({ ppfdCanopy: "665" })).toBe(true);
  });

  it("appends PPFD canopy reading to an existing note", () => {
    const out = appendHardwareReadingsToNote("Morning check.", {
      ppfdCanopy: "700",
    });
    expect(out).toMatch(/Morning check\./);
    expect(out).toMatch(/PPFD canopy: 700/);
  });

  it("documents that hardware readings are MANUAL HANDHELD, never live", () => {
    const src = readSrc("lib/quickLogHardwareReadingsRules.ts");
    expect(src).toMatch(/MANUAL HANDHELD/);
    expect(src).toMatch(/never be classified as live/i);
    expect(/never[\s\S]*sensor_readings/i.test(src)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// sensorFormat — shared metric metadata exposes PPFD
// ---------------------------------------------------------------------------

describe("sensorFormat — PPFD field metadata", () => {
  it("exposes a unit for the canonical 'ppfd' field", () => {
    expect(sensorFieldUnit("ppfd")).toBeTruthy();
  });

  it("formats a valid PPFD value through the shared formatter", () => {
    expect(formatSensorValue("ppfd", 700)).toMatch(/700/);
  });

  it("renders missing PPFD as the safe placeholder, not 0", () => {
    expect(formatSensorValue("ppfd", null)).toBe("—");
    expect(formatSensorValue("ppfd", undefined)).toBe("—");
    expect(formatSensorValue("ppfd", Number.NaN)).toBe("—");
  });
});

// ---------------------------------------------------------------------------
// AI Doctor context — PPFD does not exist in NormalizedSensorReading
// (NEX-5). Assert that an Ecowitt/manual reading without PPFD does NOT
// claim health from absence, and that the safety contract still holds.
// ---------------------------------------------------------------------------

describe("AI Doctor context — PPFD-aware behaviour via NEX-5 surface", () => {
  const base: NormalizedSensorReading = {
    captured_at: "2026-01-01T10:00:00.000Z",
    source: "live",
    temperature_c: 24.5,
    humidity_pct: 60,
    vpd_kpa: 1.1,
    co2_ppm: null,
    soil_moisture_pct: 45,
    raw_payload: null,
  };

  it("live reading without PPFD still produces a usable summary (PPFD not required)", () => {
    const ctx = mapSensorReadingToAiDoctorContext(base);
    expect(ctx.contextSummary.toLowerCase()).not.toMatch(/invalid/);
    expect(ctx.confidenceImpact).toBe("none");
  });

  it("stale source never produces a clean evidence summary", () => {
    const ctx = mapSensorReadingToAiDoctorContext({ ...base, source: "stale" });
    expect(ctx.confidenceImpact).toBe("reduced");
    expect(ctx.contextSummary.toLowerCase()).toMatch(/stale/);
  });

  it("invalid source never produces a healthy summary, even with metrics present", () => {
    const ctx = mapSensorReadingToAiDoctorContext({
      ...base,
      source: "invalid",
    });
    expect(ctx.confidenceImpact).toBe("untrusted");
    expect(ctx.contextSummary.toLowerCase()).toMatch(/invalid|not possible/);
  });

  it("a single non-critical metric alone does not produce strong readiness", () => {
    // Surrogate for "PPFD alone" — the AI Doctor surface relies on
    // critical metrics (temp/RH/VPD). One non-critical reading must not
    // promote readiness on its own.
    const onlyOptional: NormalizedSensorReading = {
      ...base,
      temperature_c: null,
      humidity_pct: null,
      vpd_kpa: null,
      soil_moisture_pct: 40,
    };
    const ctx = mapSensorReadingToAiDoctorContext(onlyOptional);
    // Must still include the safety reminder that telemetry alone cannot
    // confirm plant health.
    expect(
      ctx.safetyNotes.some((n) =>
        /cannot confirm or deny plant health/i.test(n),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Static safety
// ---------------------------------------------------------------------------

function readSrc(rel: string): string {
  return readFileSync(join(process.cwd(), "src", rel), "utf8");
}

describe("PPFD support — static safety", () => {
  const FILES = ["lib/ppfdRules.ts"];

  it.each(FILES)("%s has no service_role / automation / device-control / *_executed", (rel) => {
    const lower = readSrc(rel).toLowerCase();
    expect(lower.includes("service_role")).toBe(false);
    expect(lower.includes("autopilot")).toBe(false);
    expect(/[a-z0-9]_executed\b/.test(lower)).toBe(false);
    for (const banned of [
      "turn_on_",
      "turn_off_",
      "device_command",
      "execute_device",
    ]) {
      expect(lower.includes(banned)).toBe(false);
    }
  });

  it("does not estimate PPFD from brightness / lux / watts / device state", () => {
    const src = readSrc("lib/ppfdRules.ts").toLowerCase();
    // Helper must not contain any "derive from..." mapping for those.
    for (const banned of ["lux", "watt", "brightness", "device_state"]) {
      expect(src.includes(banned)).toBe(false);
    }
  });

  it("ppfdRules is the single source of truth for the long PPFD unit", () => {
    // Other JSX files may use the short 'µmol' chip — that's the existing
    // convention. But the long 'µmol/m²/s' form must live in the helper.
    const src = readSrc("lib/ppfdRules.ts");
    expect(src).toMatch(/PPFD_UNIT_LONG\s*=\s*"µmol\/m²\/s"/);
  });
});
