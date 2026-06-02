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
});
