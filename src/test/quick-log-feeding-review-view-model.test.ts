import { describe, it, expect } from "vitest";
import {
  EMPTY_QUICKLOG_FEEDING_FORM,
  type QuickLogFeedingFormState,
} from "@/lib/quickLogFeedingFormViewModel";
import {
  buildFeedingReview,
  FEEDING_REVIEW_DEFAULTS_FLAG,
  FEEDING_REVIEW_NEEDS_INPUT,
  FEEDING_REVIEW_TITLE,
} from "@/lib/quickLogFeedingReviewViewModel";

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

describe("buildFeedingReview — needs-input state", () => {
  it("returns needsInput when lineId is blank", () => {
    const r = buildFeedingReview(
      withForm({ lineId: "" }),
      false,
    );
    expect(r.needsInput).toBe(true);
    expect(r.lineLabel).toBeNull();
  });

  it("returns needsInput when lineId is whitespace only", () => {
    const r = buildFeedingReview(
      withForm({ lineId: "   " }),
      false,
    );
    expect(r.needsInput).toBe(true);
  });

  it("returns needsInput when all product names are blank", () => {
    const r = buildFeedingReview(
      withForm({
        products: [{ name: "", amount: "1", unit: "ml_per_l" }],
      }),
      false,
    );
    expect(r.needsInput).toBe(true);
    expect(r.productLabels).toEqual([]);
  });

  it("returns needsInput when products array is empty", () => {
    const r = buildFeedingReview(
      withForm({ products: [] }),
      false,
    );
    expect(r.needsInput).toBe(true);
  });
});

describe("buildFeedingReview — complete preview", () => {
  it("includes nutrient line and product labels", () => {
    const r = buildFeedingReview(withForm({}), false);
    expect(r.needsInput).toBe(false);
    expect(r.lineLabel).toBe("veg-week-3");
    expect(r.productLabels).toHaveLength(1);
    expect(r.productLabels[0].name).toBe("Base A");
    expect(r.productLabels[0].display).toBe("Base A — 2");
  });

  it("includes unit in product display when unit is not the default", () => {
    const r = buildFeedingReview(
      withForm({
        products: [{ name: "CalMag", amount: "1.5", unit: "ml/gal" }],
      }),
      false,
    );
    expect(r.productLabels[0].display).toBe("CalMag — 1.5 ml/gal");
  });

  it("shows product name only when amount is blank", () => {
    const r = buildFeedingReview(
      withForm({
        products: [{ name: "CalMag", amount: "", unit: "ml_per_l" }],
      }),
      false,
    );
    expect(r.productLabels[0].display).toBe("CalMag");
  });

  it("supports multiple product rows", () => {
    const r = buildFeedingReview(
      withForm({
        products: [
          { name: "Base A", amount: "2", unit: "ml_per_l" },
          { name: "Bloom B", amount: "1.5", unit: "ml_per_l" },
        ],
      }),
      false,
    );
    expect(r.productLabels).toHaveLength(2);
    expect(r.productLabels[1].display).toBe("Bloom B — 1.5");
  });

  it("ignores blank product rows between filled rows", () => {
    const r = buildFeedingReview(
      withForm({
        products: [
          { name: "Base A", amount: "2", unit: "ml_per_l" },
          { name: "", amount: "", unit: "" },
          { name: "Bloom B", amount: "1.5", unit: "ml_per_l" },
        ],
      }),
      false,
    );
    expect(r.productLabels).toHaveLength(2);
  });
});

describe("buildFeedingReview — optional metrics", () => {
  it("omits blank optional fields", () => {
    const r = buildFeedingReview(withForm({}), false);
    expect(r.optionalMetrics).toEqual([]);
    expect(r.note).toBeNull();
  });

  it("includes pH when entered", () => {
    const r = buildFeedingReview(withForm({ ph: "6.1" }), false);
    expect(r.optionalMetrics).toContainEqual({ label: "pH", value: "6.1" });
  });

  it("includes EC in/out when entered", () => {
    const r = buildFeedingReview(
      withForm({ ecIn: "1.6", ecOut: "1.9" }),
      false,
    );
    expect(r.optionalMetrics).toContainEqual({ label: "EC in", value: "1.6" });
    expect(r.optionalMetrics).toContainEqual({ label: "EC out", value: "1.9" });
  });

  it("includes runoff values when entered", () => {
    const r = buildFeedingReview(
      withForm({
        runoffMl: "250",
        runoffPh: "6.4",
        runoffEc: "2.1",
      }),
      false,
    );
    expect(r.optionalMetrics).toContainEqual({
      label: "Runoff (ml)",
      value: "250",
    });
    expect(r.optionalMetrics).toContainEqual({
      label: "Runoff pH",
      value: "6.4",
    });
    expect(r.optionalMetrics).toContainEqual({
      label: "Runoff EC",
      value: "2.1",
    });
  });

  it("includes water temp when entered", () => {
    const r = buildFeedingReview(
      withForm({ waterTempC: "21" }),
      false,
    );
    expect(r.optionalMetrics).toContainEqual({
      label: "Water (°C)",
      value: "21",
    });
  });

  it("does not include whitespace-only optional fields", () => {
    const r = buildFeedingReview(
      withForm({ ph: "   ", ecIn: "1.6" }),
      false,
    );
    expect(r.optionalMetrics).toHaveLength(1);
    expect(r.optionalMetrics[0].label).toBe("EC in");
  });
});

describe("buildFeedingReview — note", () => {
  it("includes note only when entered", () => {
    const r = buildFeedingReview(
      withForm({ note: " thirsty plant " }),
      false,
    );
    expect(r.note).toBe("thirsty plant");
  });

  it("returns null note when blank", () => {
    const r = buildFeedingReview(withForm({ note: "" }), false);
    expect(r.note).toBeNull();
  });
});

describe("buildFeedingReview — defaults applied flag", () => {
  it("flags defaultsApplied true when passed", () => {
    const r = buildFeedingReview(withForm({}), true);
    expect(r.defaultsApplied).toBe(true);
  });

  it("flags defaultsApplied false when passed", () => {
    const r = buildFeedingReview(withForm({}), false);
    expect(r.defaultsApplied).toBe(false);
  });

  it("still returns needsInput when defaultsApplied is true but required fields missing", () => {
    const r = buildFeedingReview(
      withForm({ lineId: "" }),
      true,
    );
    expect(r.defaultsApplied).toBe(true);
    expect(r.needsInput).toBe(true);
  });
});

describe("buildFeedingReview — constant exports", () => {
  it("exposes the expected title copy", () => {
    expect(FEEDING_REVIEW_TITLE).toBe("Review feeding log");
  });

  it("exposes the expected defaults flag copy", () => {
    expect(FEEDING_REVIEW_DEFAULTS_FLAG).toBe(
      "Includes prefilled feeding defaults",
    );
  });

  it("exposes the expected needs-input copy", () => {
    expect(FEEDING_REVIEW_NEEDS_INPUT).toBe(
      "Add a nutrient line and product to preview the save.",
    );
  });
});
