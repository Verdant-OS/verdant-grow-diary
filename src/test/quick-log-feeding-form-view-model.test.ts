import { describe, it, expect } from "vitest";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  buildFeedingFormPayload,
  feedingFormReasonToHelper,
  FEEDING_SAVE_FAILURE_MESSAGE,
  FEEDING_SAVE_SUCCESS_MESSAGE,
  type QuickLogFeedingFormState,
} from "@/lib/quickLogFeedingFormViewModel";

function withForm(
  patch: Partial<QuickLogFeedingFormState>,
): QuickLogFeedingFormState {
  return {
    ...EMPTY_QUICKLOG_FEEDING_FORM,
    products: [{ name: "Base A", amount: "2", unit: "ml_per_l" }],
    lineId: "veg-week-3",
    ...patch,
  };
}

describe("buildFeedingFormPayload — happy path", () => {
  it("maps minimal valid feeding form to a writer payload", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      tentId: "tent-1",
      plantId: "plant-1",
      form: withForm({}),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.grow_id).toBe("grow-1");
    expect(r.payload.nutrient_line_id).toBe("veg-week-3");
    expect(r.payload.tent_id).toBe("tent-1");
    expect(r.payload.plant_id).toBe("plant-1");
    expect(r.payload.products).toEqual([
      { name: "Base A", amount: 2, unit: "ml_per_l" },
    ]);
  });

  it("maps optional pH/EC/runoff/water-temp/note fields correctly", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({
        ph: "6.1",
        ecIn: "1.6",
        ecOut: "1.9",
        runoffMl: "250",
        runoffPh: "6.4",
        runoffEc: "2.1",
        waterTempC: "21",
        note: " thirsty plant ",
      }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.ph).toBe(6.1);
    expect(r.payload.ec_in).toBe(1.6);
    expect(r.payload.ec_out).toBe(1.9);
    expect(r.payload.runoff_ml).toBe(250);
    expect(r.payload.runoff_ph).toBe(6.4);
    expect(r.payload.runoff_ec).toBe(2.1);
    expect(r.payload.water_temp_c).toBe(21);
    expect(r.payload.note).toBe("thirsty plant");
  });

  it("drops empty optional fields rather than zeroing them", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({}),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.ph).toBeUndefined();
    expect(r.payload.runoff_ml).toBeUndefined();
    expect(r.payload.note).toBeNull();
  });

  it("supports a product row with only a name (amount/unit optional)", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({ products: [{ name: "CalMag", amount: "", unit: "" }] }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.products).toEqual([{ name: "CalMag" }]);
  });
});

describe("buildFeedingFormPayload — validation", () => {
  it("blocks save when grow id is missing", () => {
    const r = buildFeedingFormPayload({ growId: "", form: withForm({}) });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("grow_id:missing");
  });

  it("blocks save when nutrient line id is missing", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({ lineId: "  " }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("line_id:missing");
  });

  it("blocks save when product list is empty", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({ products: [] }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("products:empty");
  });

  it("blocks save when products contain only blank names", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({
        products: [{ name: "", amount: "1", unit: "ml_per_l" }],
      }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("products:empty");
  });

  it("blocks save when an optional numeric field is non-finite", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({ ph: "not-a-number" }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("numeric:invalid");
  });

  it("blocks save when a product amount is non-finite", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({
        products: [{ name: "Base A", amount: "abc", unit: "ml_per_l" }],
      }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("products:invalid_amount");
  });

  it("rejects token-like product payload values", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({
        products: [
          { name: "service_role bypass", amount: "1", unit: "ml_per_l" },
        ],
      }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("products:contains_secret");
  });
});

describe("buildFeedingFormPayload — physical plausibility bounds", () => {
  // pH is the 0–14 scale; EC (conductivity) and runoff volume are physically
  // non-negative. These bounds match the feeding-history range warnings
  // (feedingHistoryRules) and the CSV preview validator — enforced HERE so a
  // fat-fingered value (e.g. 65 meaning 6.5) is rejected at the write seam,
  // not merely flagged after the feeding is already stored. Water temperature
  // is intentionally left unbounded: temperature-band validation is owned by
  // the separate sensor-plausibility convergence.
  function reason(patch: Partial<QuickLogFeedingFormState>): string {
    const r = buildFeedingFormPayload({ growId: "grow-1", form: withForm(patch) });
    if (r.ok !== false) throw new Error("expected the build to fail");
    return r.reason;
  }

  it("rejects a pH above 14 (e.g. 65 fat-fingered from 6.5)", () => {
    expect(reason({ ph: "65" })).toBe("ph:out_of_range");
  });

  it("rejects a negative pH", () => {
    expect(reason({ ph: "-1" })).toBe("ph:out_of_range");
  });

  it("applies the pH bound to runoff pH as well", () => {
    expect(reason({ runoffPh: "20" })).toBe("ph:out_of_range");
  });

  it("rejects negative EC on every EC field", () => {
    expect(reason({ ecIn: "-0.1" })).toBe("ec:out_of_range");
    expect(reason({ ecOut: "-2" })).toBe("ec:out_of_range");
    expect(reason({ runoffEc: "-1" })).toBe("ec:out_of_range");
  });

  it("rejects a negative runoff volume", () => {
    expect(reason({ runoffMl: "-5" })).toBe("volume:out_of_range");
  });

  it("accepts the inclusive pH boundaries and zero EC/volume", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({ ph: "0", runoffPh: "14", ecIn: "0", runoffMl: "0" }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.ph).toBe(0);
    expect(r.payload.runoff_ph).toBe(14);
    expect(r.payload.ec_in).toBe(0);
    expect(r.payload.runoff_ml).toBe(0);
  });

  it("leaves water temperature unbounded (owned by the sensor-band convergence)", () => {
    const r = buildFeedingFormPayload({
      growId: "grow-1",
      form: withForm({ waterTempC: "999" }),
    });
    expect(r.ok).toBe(true);
  });
});

describe("feedingFormReasonToHelper", () => {
  it("returns a helpful message for known reasons", () => {
    expect(feedingFormReasonToHelper("line_id:missing")).toMatch(
      /nutrient line/i,
    );
    expect(feedingFormReasonToHelper("products:empty")).toMatch(/product/i);
  });

  it("explains the physical plausibility rejections", () => {
    expect(feedingFormReasonToHelper("ph:out_of_range")).toMatch(/ph|14/i);
    expect(feedingFormReasonToHelper("ec:out_of_range")).toMatch(/ec|negative/i);
    expect(feedingFormReasonToHelper("volume:out_of_range")).toMatch(/volume|negative/i);
  });

  it("falls back to the failure message for unknown reasons", () => {
    expect(feedingFormReasonToHelper("rpc:error")).toBe(
      FEEDING_SAVE_FAILURE_MESSAGE,
    );
  });

  it("exposes the success copy", () => {
    expect(FEEDING_SAVE_SUCCESS_MESSAGE).toBe("Feeding logged.");
  });
});
