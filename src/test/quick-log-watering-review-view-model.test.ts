import { describe, expect, it } from "vitest";
import {
  EMPTY_QUICKLOG_WATERING_FORM,
  type QuickLogWateringFormState,
} from "@/lib/quickLogWateringFormViewModel";
import {
  WATERING_REVIEW_NEEDS_INPUT,
  WATERING_REVIEW_SAFETY_NOTE,
  WATERING_REVIEW_TITLE,
  buildWateringReview,
} from "@/lib/quickLogWateringReviewViewModel";

function withForm(patch: Partial<QuickLogWateringFormState> = {}): QuickLogWateringFormState {
  return {
    ...EMPTY_QUICKLOG_WATERING_FORM,
    volumeMl: "750",
    ...patch,
  };
}

describe("buildWateringReview — validation parity", () => {
  it.each(["", "   ", "0", "-1", "not-a-number", "1e2", "0x10", "1000001"])(
    "keeps preview in needs-input state for mapper-invalid volume %j",
    (volumeMl) => {
      expect(buildWateringReview(withForm({ volumeMl })).needsInput).toBe(true);
    },
  );

  it.each([".5", "1", "+750", "750.25", "1000000"])(
    "accepts mapper-valid applied volume %j",
    (volumeMl) => {
      expect(buildWateringReview(withForm({ volumeMl })).needsInput).toBe(false);
    },
  );
});

describe("buildWateringReview — evidence preview", () => {
  it("shows only applied volume for the minimal record", () => {
    const review = buildWateringReview(withForm());

    expect(review).toEqual({
      needsInput: false,
      measurements: [{ label: "Applied volume (ml)", value: "750" }],
      manualObservations: [],
      safetyNote: WATERING_REVIEW_SAFETY_NOTE,
    });
  });

  it("shows all grower-entered measurements in stable order", () => {
    const review = buildWateringReview(
      withForm({
        ph: "6.2",
        ec: "2",
        ppm: "1000",
        runoffMl: "175",
        runoffPh: "6.4",
        runoffEc: "1.7",
        runoffPpm: "850",
        waterTempC: "21.5",
      }),
    );

    expect(review.measurements).toEqual([
      { label: "Applied volume (ml)", value: "750" },
      { label: "Input pH", value: "6.2" },
      { label: "Input EC (mS/cm)", value: "2" },
      { label: "Input PPM (500)", value: "1000" },
      { label: "Runoff (ml)", value: "175" },
      { label: "Runoff pH", value: "6.4" },
      { label: "Runoff EC (mS/cm)", value: "1.7" },
      { label: "Runoff PPM (500)", value: "850" },
      { label: "Water temperature (°C)", value: "21.5" },
    ]);
  });

  it("shows manual observations as labels, not inferred sensor facts", () => {
    const review = buildWateringReview(
      withForm({
        potWeightFeel: "light",
        mediumSurface: "dry",
        drainage: "none",
      }),
    );

    expect(review.manualObservations).toEqual([
      { label: "Pre-water pot weight", value: "Light" },
      { label: "Medium surface", value: "Dry" },
      { label: "Drainage", value: "None observed" },
    ]);
  });

  it("omits whitespace-only optional measurements", () => {
    const review = buildWateringReview(withForm({ ph: "   ", ec: "1.4" }));

    expect(review.measurements).toEqual([
      { label: "Applied volume (ml)", value: "750" },
      { label: "Input EC (mS/cm)", value: "1.4" },
    ]);
  });

  it("is deterministic, freezes result arrays, and leaves form state unchanged", () => {
    const form = withForm({ mediumSurface: "moist", runoffMl: "100" });
    const before = structuredClone(form);
    const first = buildWateringReview(form);
    const second = buildWateringReview(form);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first.measurements)).toBe(true);
    expect(Object.isFrozen(first.manualObservations)).toBe(true);
    expect(form).toEqual(before);
  });
});

describe("watering review copy", () => {
  it("keeps the review grower-controlled and evidence-only", () => {
    expect(WATERING_REVIEW_TITLE).toBe("Review watering record");
    expect(WATERING_REVIEW_NEEDS_INPUT).toMatch(/applied volume/i);
    expect(WATERING_REVIEW_SAFETY_NOTE).toBe(
      "Recorded evidence only. Verdant does not infer a schedule, dryback, or watering decision from this entry.",
    );
  });
});
