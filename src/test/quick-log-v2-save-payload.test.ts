import { describe, it, expect } from "vitest";
import { buildQuickLogV2SavePayload, QUICK_LOG_NOTE_LIMIT } from "@/lib/quickLogV2SavePayload";
import { quickLogReasonToOperatorMessage } from "@/lib/quickLogSaveErrorMessage";

const okTarget = {
  ok: true as const,
  targetType: "plant" as const,
  targetId: "p1",
  tentId: "t1",
  plantId: "p1",
};
const okTent = {
  ok: true as const,
  targetType: "tent" as const,
  targetId: "t1",
  tentId: "t1",
  plantId: null,
};

function base(overrides = {}) {
  return {
    resolved: okTarget,
    action: "note" as const,
    volumeMl: "",
    note: "",
    temperatureC: "",
    humidityPct: "",
    vpdKpa: "",
    ...overrides,
  };
}

describe("quickLogV2SavePayload", () => {
  it("builds note payload with all sensors null", () => {
    const r = buildQuickLogV2SavePayload(base({ note: "hello" }));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_action).toBe("note");
    expect(r.payload.p_volume_ml).toBeNull();
    expect(r.payload.p_temperature_c).toBeNull();
    expect(r.payload.p_humidity_pct).toBeNull();
    expect(r.payload.p_vpd_kpa).toBeNull();
    expect(r.payload.p_note).toBe("hello");
    expect(r.payload.p_target_type).toBe("plant");
    expect(r.payload.p_target_id).toBe("p1");
  });

  it("blocks save when target unresolved", () => {
    const r = buildQuickLogV2SavePayload(
      base({ resolved: { ok: false, reason: "no_selection" } as any }),
    );
    expect(r.ok).toBe(false);
  });

  it("blocks photo action", () => {
    const r = buildQuickLogV2SavePayload(base({ action: "photo" as any }));
    expect(r.ok).toBe(false);
    if (r.ok === true) throw new Error("expected fail");
    expect(r.reason).toBe("photo_saving_not_enabled");
  });

  it("water requires positive volume", () => {
    expect(buildQuickLogV2SavePayload(base({ action: "water", volumeMl: "" })).ok).toBe(false);
    expect(buildQuickLogV2SavePayload(base({ action: "water", volumeMl: "0" })).ok).toBe(false);
    expect(buildQuickLogV2SavePayload(base({ action: "water", volumeMl: "-5" })).ok).toBe(false);
    expect(buildQuickLogV2SavePayload(base({ action: "water", volumeMl: "abc" })).ok).toBe(false);
  });

  it("water with valid volume passes", () => {
    const r = buildQuickLogV2SavePayload(base({ action: "water", volumeMl: "500" }));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_volume_ml).toBe(500);
  });

  it("entered sensors flow through", () => {
    const r = buildQuickLogV2SavePayload(
      base({ temperatureC: "24.5", humidityPct: "55", vpdKpa: "1.2" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_temperature_c).toBe(24.5);
    expect(r.payload.p_humidity_pct).toBe(55);
    expect(r.payload.p_vpd_kpa).toBe(1.2);
  });

  it("rejects humidity out of 0-100", () => {
    expect(buildQuickLogV2SavePayload(base({ humidityPct: "120" })).ok).toBe(false);
    expect(buildQuickLogV2SavePayload(base({ humidityPct: "-1" })).ok).toBe(false);
  });

  it("tent target writes plantId null", () => {
    const r = buildQuickLogV2SavePayload(base({ resolved: okTent, note: "x" }));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_target_type).toBe("tent");
    expect(r.payload.p_target_id).toBe("t1");
  });

  it("rejects invalid sensor strings", () => {
    expect(buildQuickLogV2SavePayload(base({ temperatureC: "abc" })).ok).toBe(false);
  });

  it("multi-plant: selected plant wins (not default)", () => {
    // Simulates the resolver picking p2 even though p1 was also available.
    const r = buildQuickLogV2SavePayload(
      base({
        resolved: {
          ok: true,
          targetType: "plant",
          targetId: "p2",
          tentId: "t2",
          plantId: "p2",
        } as any,
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_target_id).toBe("p2");
  });

  it("passes structured details through the existing RPC payload seam", () => {
    const details = {
      maturity_evidence: {
        source: "manual",
        evidence_type: "quick_log_maturity_evidence",
        advisory_only: true,
        observed_at: "2026-06-17T21:00:00.000Z",
        cloudy_pct: 60,
      },
    };
    const r = buildQuickLogV2SavePayload(base({ details }));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_details).toEqual(details);
  });
});

describe("quickLogV2SavePayload — canonical sensor plausibility band", () => {
  // The builder previously hand-rolled a humidity 0-100 check and applied
  // NO bound to temperature or VPD, so a fat-fingered "240" (meant 24.0) or
  // a physically impossible negative VPD wrote corrupt values into a
  // permanent diary entry. This reconciles validation onto the single
  // canonical band from sensorReadingNormalizationRules
  // (isTemperatureValid: -10..60, isHumidityValid: 0..100, isVpdValid:
  // 0..10; null always allowed = "not provided"). Reason codes route to
  // per-metric operator copy, never a raw code.

  function reason(over: Record<string, unknown>): string {
    const r = buildQuickLogV2SavePayload(base(over));
    // Explicit `=== true` comparison is what narrows r to the error branch
    // under this repo's non-strict tsconfig (matches the idiom used by the
    // "blocks photo action" test above); `if (r.ok)` alone does not.
    if (r.ok === true) throw new Error("expected the build to fail");
    return r.reason;
  }

  it("rejects a physically impossible negative VPD", () => {
    expect(reason({ vpdKpa: "-0.5" })).toBe("vpd_out_of_range");
  });

  it("rejects VPD above the canonical maximum (10 kPa)", () => {
    expect(reason({ vpdKpa: "12" })).toBe("vpd_out_of_range");
  });

  it("rejects a fat-fingered temperature above 60C (e.g. 24.0 typed as 240)", () => {
    expect(reason({ temperatureC: "240" })).toBe("temperature_out_of_range");
  });

  it("rejects temperature below the canonical minimum (-10C)", () => {
    expect(reason({ temperatureC: "-40" })).toBe("temperature_out_of_range");
  });

  it("still rejects humidity outside 0-100 with the same reason code", () => {
    expect(reason({ humidityPct: "150" })).toBe("humidity_out_of_range");
    expect(reason({ humidityPct: "-1" })).toBe("humidity_out_of_range");
  });

  it("accepts inclusive canonical boundary values", () => {
    const r = buildQuickLogV2SavePayload(
      base({ temperatureC: "-10", humidityPct: "0", vpdKpa: "10" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_temperature_c).toBe(-10);
    expect(r.payload.p_humidity_pct).toBe(0);
    expect(r.payload.p_vpd_kpa).toBe(10);
  });

  it("treats empty sensor fields as not-provided (null, still valid)", () => {
    const r = buildQuickLogV2SavePayload(base({ note: "check-in" }));
    expect(r.ok).toBe(true);
  });

  it("surfaces specific operator copy for the new reason codes (not the generic fallback)", () => {
    const generic = quickLogReasonToOperatorMessage("some_unknown_code");
    expect(quickLogReasonToOperatorMessage("temperature_out_of_range")).not.toBe(generic);
    expect(quickLogReasonToOperatorMessage("vpd_out_of_range")).not.toBe(generic);
    expect(quickLogReasonToOperatorMessage("temperature_out_of_range")).toMatch(/temperature/i);
    expect(quickLogReasonToOperatorMessage("vpd_out_of_range")).toMatch(/vpd/i);
  });

  it("still validates sensor magnitude on a watering (volume check must not short-circuit the band)", () => {
    // Volume is validated first and returns early on failure; a valid volume
    // must NOT let an out-of-band sensor value slip through. Pins the check
    // ordering so a future refactor cannot scope the band to note-only saves.
    expect(reason({ action: "water", volumeMl: "500", temperatureC: "240" })).toBe(
      "temperature_out_of_range",
    );
    expect(reason({ action: "water", volumeMl: "500", vpdKpa: "-0.5" })).toBe("vpd_out_of_range");
  });

  it("rejects just past the inclusive boundary (epsilon-level edge signal)", () => {
    expect(reason({ temperatureC: "60.01" })).toBe("temperature_out_of_range");
    expect(reason({ temperatureC: "-10.01" })).toBe("temperature_out_of_range");
    expect(reason({ vpdKpa: "10.01" })).toBe("vpd_out_of_range");
  });

  it("accepts the upper canonical boundaries (60C, 100% RH)", () => {
    const r = buildQuickLogV2SavePayload(base({ temperatureC: "60", humidityPct: "100" }));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_temperature_c).toBe(60);
    expect(r.payload.p_humidity_pct).toBe(100);
  });
});

describe("quickLogV2SavePayload — note length reconciled with the shared limit", () => {
  // The Quick Log v2 sheet caps the note field via maxLength={QUICK_LOG_NOTE_LIMIT},
  // but the pure save-payload builder (the authoritative write seam) never
  // enforced it, so any path that bypasses the textarea — a programmatic
  // setField, a paste edge case, or a future caller — could write an
  // over-limit note. This reconciles the write onto the SAME exported
  // constant the sheet uses so the UI cap and the persisted cap cannot drift.

  function reason(over: Record<string, unknown>): string {
    const r = buildQuickLogV2SavePayload(base(over));
    if (r.ok === true) throw new Error("expected the build to fail");
    return r.reason;
  }

  it("rejects a note longer than the shared limit", () => {
    expect(reason({ note: "x".repeat(QUICK_LOG_NOTE_LIMIT + 1) })).toBe("note_too_long");
  });

  it("accepts a note exactly at the limit", () => {
    const r = buildQuickLogV2SavePayload(base({ note: "x".repeat(QUICK_LOG_NOTE_LIMIT) }));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_note).toBe("x".repeat(QUICK_LOG_NOTE_LIMIT));
  });

  it("measures trimmed length (surrounding whitespace does not push a note over)", () => {
    const padded = `  ${"x".repeat(QUICK_LOG_NOTE_LIMIT)}  `;
    const r = buildQuickLogV2SavePayload(base({ note: padded }));
    expect(r.ok).toBe(true);
  });

  it("enforces the note cap on a watering too (check runs for both actions)", () => {
    // The note-length guard runs unconditionally after the volume branch, so
    // a watering carries and must reject an over-limit note. Pins the ordering
    // so a future refactor cannot scope the cap to note-only saves.
    expect(
      reason({ action: "water", volumeMl: "500", note: "x".repeat(QUICK_LOG_NOTE_LIMIT + 1) }),
    ).toBe("note_too_long");
    const atLimit = buildQuickLogV2SavePayload(
      base({ action: "water", volumeMl: "500", note: "x".repeat(QUICK_LOG_NOTE_LIMIT) }),
    );
    expect(atLimit.ok).toBe(true);
    if (!atLimit.ok) throw new Error("expected ok");
    expect(atLimit.payload.p_note).toBe("x".repeat(QUICK_LOG_NOTE_LIMIT));
    expect(atLimit.payload.p_volume_ml).toBe(500);
  });

  it("surfaces specific operator copy for note_too_long (not the generic fallback)", () => {
    const generic = quickLogReasonToOperatorMessage("some_unknown_code");
    expect(quickLogReasonToOperatorMessage("note_too_long")).not.toBe(generic);
    expect(quickLogReasonToOperatorMessage("note_too_long")).toMatch(/note/i);
  });
});
