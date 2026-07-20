import { describe, it, expect } from "vitest";
import { buildQuickLogV2SavePayload } from "@/lib/quickLogV2SavePayload";

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
    idempotencyKey: "quicklog-v2-test-key-0001",
    ...overrides,
  };
}

describe("quickLogV2SavePayload", () => {
  it("threads the idempotency key into p_idempotency_key", () => {
    const r = buildQuickLogV2SavePayload(base());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.payload.p_idempotency_key).toBe("quicklog-v2-test-key-0001");
  });

  it("rejects a missing or too-short idempotency key (server requires 8..200)", () => {
    for (const idempotencyKey of ["", "short", "  a  "]) {
      const r = buildQuickLogV2SavePayload(base({ idempotencyKey }));
      expect(r).toEqual({ ok: false, reason: "invalid_idempotency_key" });
    }
  });

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

describe("quickLogV2SavePayload — canonical air-sensor bands", () => {
  // Temperature and VPD previously had NO magnitude guard here: a fat-fingered
  // "240" (24.0 mis-typed) or a physically impossible negative VPD wrote
  // straight into a permanent diary entry. Reconcile onto the single canonical
  // band (isTemperatureValid -10..60, isHumidityValid 0..100, isVpdValid 0..10;
  // null = not provided) and emit the shared per-metric reason codes.
  function reason(over: Record<string, unknown>): string {
    const r = buildQuickLogV2SavePayload(base(over));
    // `=== true` is what narrows to the error branch under non-strict tsconfig.
    if (r.ok === true) throw new Error("expected the build to fail");
    return r.reason;
  }

  it("rejects a fat-fingered temperature above 60°C", () => {
    expect(reason({ temperatureC: "240" })).toBe("temperature_out_of_range");
  });

  it("rejects temperature below -10°C", () => {
    expect(reason({ temperatureC: "-40" })).toBe("temperature_out_of_range");
  });

  it("rejects VPD above the canonical 10 kPa ceiling", () => {
    expect(reason({ vpdKpa: "12" })).toBe("vpd_out_of_range");
  });

  it("rejects a physically impossible negative VPD", () => {
    expect(reason({ vpdKpa: "-0.5" })).toBe("vpd_out_of_range");
  });

  it("still rejects humidity outside 0-100", () => {
    expect(reason({ humidityPct: "150" })).toBe("humidity_out_of_range");
  });

  it("accepts VPD at 8 kPa (in-band, above the retired 4 kPa cap)", () => {
    const r = buildQuickLogV2SavePayload(base({ vpdKpa: "8" }));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_vpd_kpa).toBe(8);
  });

  it("accepts the inclusive canonical boundaries (-10°C, 0%, 0 kPa)", () => {
    const r = buildQuickLogV2SavePayload(
      base({ temperatureC: "-10", humidityPct: "0", vpdKpa: "0" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_temperature_c).toBe(-10);
    expect(r.payload.p_vpd_kpa).toBe(0);
  });

  it("accepts the upper canonical boundaries (60°C, 100%, 10 kPa)", () => {
    const r = buildQuickLogV2SavePayload(
      base({ temperatureC: "60", humidityPct: "100", vpdKpa: "10" }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_temperature_c).toBe(60);
    expect(r.payload.p_humidity_pct).toBe(100);
    expect(r.payload.p_vpd_kpa).toBe(10);
  });

  it("rejects just past each boundary (epsilon edge)", () => {
    expect(reason({ temperatureC: "60.01" })).toBe("temperature_out_of_range");
    expect(reason({ temperatureC: "-10.01" })).toBe("temperature_out_of_range");
    expect(reason({ vpdKpa: "10.01" })).toBe("vpd_out_of_range");
  });

  it("treats blank sensor fields as not-provided (null, still valid)", () => {
    const r = buildQuickLogV2SavePayload(base({ note: "check-in" }));
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error("expected ok");
    expect(r.payload.p_temperature_c).toBeNull();
    expect(r.payload.p_vpd_kpa).toBeNull();
  });
});
