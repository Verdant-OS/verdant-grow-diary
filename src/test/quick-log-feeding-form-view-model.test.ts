import { describe, it, expect } from "vitest";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  FEEDING_FORM_PRODUCT_CAP,
  addFeedingProductRow,
  buildFeedingFormPayload,
  feedingFormReasonToHelper,
  isFeedingFormPristine,
  removeFeedingProductRow,
  FEEDING_SAVE_FAILURE_MESSAGE,
  FEEDING_SAVE_SUCCESS_MESSAGE,
  type QuickLogFeedingFormState,
} from "@/lib/quickLogFeedingFormViewModel";

describe("isFeedingFormPristine", () => {
  it("accepts only the untouched form", () => {
    expect(isFeedingFormPristine(EMPTY_QUICKLOG_FEEDING_FORM)).toBe(true);
  });

  it.each([
    "lineId",
    "volumeMl",
    "ph",
    "ecIn",
    "ppmIn",
    "ecOut",
    "ppmOut",
    "runoffMl",
    "runoffPh",
    "runoffEc",
    "runoffPpm",
    "waterTempC",
    "note",
  ] as const)("rejects a draft with %s entered", (field) => {
    expect(isFeedingFormPristine({ ...EMPTY_QUICKLOG_FEEDING_FORM, [field]: "1" })).toBe(false);
  });

  it("rejects product edits and added product rows", () => {
    expect(
      isFeedingFormPristine({
        ...EMPTY_QUICKLOG_FEEDING_FORM,
        products: [{ name: "", amount: "1", unit: "ml_per_l" }],
      }),
    ).toBe(false);
    expect(
      isFeedingFormPristine({
        ...EMPTY_QUICKLOG_FEEDING_FORM,
        products: [
          { name: "", amount: "", unit: "ml_per_l" },
          { name: "", amount: "", unit: "ml_per_l" },
        ],
      }),
    ).toBe(false);
  });
});

function withForm(patch: Partial<QuickLogFeedingFormState>): QuickLogFeedingFormState {
  return {
    ...EMPTY_QUICKLOG_FEEDING_FORM,
    products: [{ name: "Base A", amount: "2", unit: "ml_per_l" }],
    lineId: "veg-week-3",
    volumeMl: "750",
    ...patch,
  };
}

function buildPayload(
  input: Omit<Parameters<typeof buildFeedingFormPayload>[0], "idempotencyKey"> & {
    idempotencyKey?: string;
  },
) {
  return buildFeedingFormPayload({
    idempotencyKey: "feed-save-123",
    ...input,
  });
}

describe("buildFeedingFormPayload — happy path", () => {
  it("maps minimal valid feeding form to a writer payload", () => {
    const r = buildPayload({
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
    expect(r.payload.products).toEqual([{ name: "Base A", amount: 2, unit: "ml_per_l" }]);
    expect(r.payload.volume_ml).toBe(750);
    expect(r.payload.idempotency_key).toBe("feed-save-123");
  });

  it("maps optional pH/EC/runoff/water-temp/note fields correctly", () => {
    const r = buildPayload({
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

  it("maps a PPM-500-only value to canonical EC", () => {
    const r = buildPayload({
      growId: "grow-1",
      form: withForm({ ppmIn: "1000", runoffPpm: "850" }),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload.ec_in).toBe(2);
    expect(r.payload.runoff_ec).toBe(1.7);
    expect(r.payload).not.toHaveProperty("ppm_in");
    expect(r.payload).not.toHaveProperty("runoff_ppm");
  });

  it("fails closed when EC and PPM do not match the 500 scale", () => {
    const r = buildPayload({
      growId: "grow-1",
      form: withForm({ ecIn: "2", ppmIn: "700" }),
    });
    expect(r).toEqual({ ok: false, reason: "ec_ppm:mismatch" });
    expect(feedingFormReasonToHelper("ec_ppm:mismatch")).toMatch(/match the 500 scale/);
  });

  it("drops empty optional fields rather than zeroing them", () => {
    const r = buildPayload({
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
    const r = buildPayload({
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
    const r = buildPayload({ growId: "", form: withForm({}) });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("grow_id:missing");
  });

  it("blocks save when nutrient line id is missing", () => {
    const r = buildPayload({
      growId: "grow-1",
      form: withForm({ lineId: "  " }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("line_id:missing");
  });

  it("blocks save when product list is empty", () => {
    const r = buildPayload({
      growId: "grow-1",
      form: withForm({ products: [] }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("products:empty");
  });

  it("blocks save when products contain only blank names", () => {
    const r = buildPayload({
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
    const r = buildPayload({
      growId: "grow-1",
      form: withForm({ ph: "not-a-number" }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("numeric:invalid");
  });

  it("blocks save when a product amount is non-finite", () => {
    const r = buildPayload({
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
    const r = buildPayload({
      growId: "grow-1",
      form: withForm({
        products: [{ name: "service_role bypass", amount: "1", unit: "ml_per_l" }],
      }),
    });
    expect(r.ok).toBe(false);
    if (r.ok !== false) throw new Error("expected failure");
    expect(r.reason).toBe("products:contains_secret");
  });

  it("blocks save when the applied volume is blank or invalid", () => {
    for (const volumeMl of ["", "0", "-1", "not-a-number", "1000001"]) {
      const r = buildPayload({
        growId: "grow-1",
        form: withForm({ volumeMl }),
      });
      expect(r.ok).toBe(false);
      if (r.ok !== false) throw new Error("expected failure");
      expect(r.reason).toBe(volumeMl === "" ? "volume_ml:missing" : "volume_ml:invalid");
    }
  });

  it("blocks save when the idempotency key is invalid", () => {
    const r = buildPayload({
      idempotencyKey: "short",
      growId: "grow-1",
      form: withForm({}),
    });
    expect(r).toEqual({ ok: false, reason: "idempotency_key:invalid" });
  });

  it("blocks recipes above the shared product cap", () => {
    const products = Array.from({ length: FEEDING_FORM_PRODUCT_CAP + 1 }, (_, i) => ({
      name: `Part ${i + 1}`,
      amount: "1",
      unit: "ml_per_l",
    }));
    const r = buildPayload({
      growId: "grow-1",
      form: withForm({ products }),
    });
    expect(r).toEqual({ ok: false, reason: "products:too_many" });
  });
});

describe("feeding product row helpers", () => {
  it("adds and removes CRONK-style multi-part rows without mutating input", () => {
    const original = [{ name: "Base", amount: "2", unit: "ml_per_l" }];
    const added = addFeedingProductRow(original);
    expect(added).toHaveLength(2);
    expect(added[1]).toEqual({ name: "", amount: "", unit: "ml_per_l" });
    expect(original).toHaveLength(1);

    const removed = removeFeedingProductRow(added, 0);
    expect(removed).toEqual([{ name: "", amount: "", unit: "ml_per_l" }]);
    expect(added).toHaveLength(2);
  });

  it("stops at the shared cap and always preserves one editable row", () => {
    const full = Array.from({ length: FEEDING_FORM_PRODUCT_CAP }, (_, i) => ({
      name: `Part ${i + 1}`,
      amount: "1",
      unit: "ml_per_l",
    }));
    expect(addFeedingProductRow(full)).toHaveLength(FEEDING_FORM_PRODUCT_CAP);
    expect(removeFeedingProductRow([full[0]], 0)).toHaveLength(1);
    expect(removeFeedingProductRow(full, -1)).toHaveLength(FEEDING_FORM_PRODUCT_CAP);
  });
});

describe("feedingFormReasonToHelper", () => {
  it("returns a helpful message for known reasons", () => {
    expect(feedingFormReasonToHelper("line_id:missing")).toMatch(/nutrient line/i);
    expect(feedingFormReasonToHelper("products:empty")).toMatch(/product/i);
  });

  it("falls back to the failure message for unknown reasons", () => {
    expect(feedingFormReasonToHelper("rpc:error")).toBe(FEEDING_SAVE_FAILURE_MESSAGE);
  });

  it("exposes the success copy", () => {
    expect(FEEDING_SAVE_SUCCESS_MESSAGE).toBe("Feeding logged.");
  });
});
