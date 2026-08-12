/**
 * quickLogActivityDetailFields — pure module tests.
 *
 * Covers spec/sanitize/describe for Training and Photo, the reserved/
 * clobbered key blocklist, and the dependsOn gate (Intensity only applies
 * to technique="defoliation") on both the write side (sanitize) and the
 * read side (describe).
 */
import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_ACTIVITY_DETAIL_FIELDS,
  QUICK_LOG_DETAIL_RESERVED_KEYS,
  QUICK_LOG_DETAIL_CLOBBERED_KEYS,
  QUICK_LOG_DETAIL_TEXT_MAX,
  getQuickLogActivityDetailFields,
  sanitizeQuickLogActivityDetails,
  describeQuickLogDetailsFromExtras,
} from "@/lib/quick-log/quickLogActivityDetailFields";
import { TRAINING_TECHNIQUES, TRAINING_INTENSITIES } from "@/lib/quickLogTypedEventPayloadRules";

describe("quickLogActivityDetailFields — spec table", () => {
  it("training technique options exactly match the canonical TRAINING_TECHNIQUES vocab", () => {
    const spec = getQuickLogActivityDetailFields("training")[0];
    const values = spec.options?.map((o) => o.value) ?? [];
    expect(new Set(values)).toEqual(TRAINING_TECHNIQUES);
  });

  it("training intensity options exactly match the canonical TRAINING_INTENSITIES vocab", () => {
    const spec = getQuickLogActivityDetailFields("training")[1];
    const values = spec.options?.map((o) => o.value) ?? [];
    expect(new Set(values)).toEqual(TRAINING_INTENSITIES);
  });

  it("intensity depends on technique=defoliation", () => {
    const spec = getQuickLogActivityDetailFields("training")[1];
    expect(spec.dependsOn).toEqual({ key: "technique", equals: "defoliation" });
  });

  it("only training and photo have detail fields in this slice", () => {
    expect(Object.keys(QUICK_LOG_ACTIVITY_DETAIL_FIELDS).sort()).toEqual(["photo", "training"]);
  });

  it("photo has subject (select) and caption (text) fields", () => {
    const specs = getQuickLogActivityDetailFields("photo");
    expect(specs.map((s) => s.key)).toEqual(["subject", "caption"]);
    expect(specs[0].kind).toBe("select");
    expect(specs[1].kind).toBe("text");
  });

  it("activities outside this slice (e.g. water) have no detail fields", () => {
    expect(getQuickLogActivityDetailFields("water")).toEqual([]);
  });
});

describe("sanitizeQuickLogActivityDetails — training", () => {
  it("accepts a valid non-defoliation technique and drops intensity even if supplied", () => {
    const out = sanitizeQuickLogActivityDetails("training", {
      technique: "lst",
      intensity: "heavy",
    });
    expect(out).toEqual({ technique: "lst", event_type: "training" });
  });

  it("accepts technique=defoliation with a valid intensity", () => {
    const out = sanitizeQuickLogActivityDetails("training", {
      technique: "defoliation",
      intensity: "medium",
    });
    expect(out).toEqual({
      technique: "defoliation",
      intensity: "medium",
      event_type: "training",
    });
  });

  it("drops an out-of-set technique value", () => {
    const out = sanitizeQuickLogActivityDetails("training", { technique: "not_a_real_technique" });
    expect(out).toBeNull();
  });

  it("drops an out-of-set intensity even under technique=defoliation", () => {
    const out = sanitizeQuickLogActivityDetails("training", {
      technique: "defoliation",
      intensity: "extreme",
    });
    expect(out).toEqual({ technique: "defoliation", event_type: "training" });
  });

  it("returns null when nothing survives (no technique, no valid fields)", () => {
    expect(sanitizeQuickLogActivityDetails("training", {})).toBeNull();
    expect(sanitizeQuickLogActivityDetails("training", null)).toBeNull();
    expect(sanitizeQuickLogActivityDetails("training", { technique: "  " })).toBeNull();
  });

  it("never emits a reserved or RPC-clobbered key even if present in raw input", () => {
    const raw: Record<string, unknown> = { technique: "topping" };
    for (const key of [...QUICK_LOG_DETAIL_RESERVED_KEYS, ...QUICK_LOG_DETAIL_CLOBBERED_KEYS]) {
      raw[key] = "malicious";
    }
    const out = sanitizeQuickLogActivityDetails("training", raw);
    expect(out).toEqual({ technique: "topping", event_type: "training" });
  });
});

describe("sanitizeQuickLogActivityDetails — photo", () => {
  it("accepts subject + caption", () => {
    const out = sanitizeQuickLogActivityDetails("photo", {
      subject: "buds",
      caption: "week 6 flower, cola close-up",
    });
    expect(out).toEqual({
      subject: "buds",
      caption: "week 6 flower, cola close-up",
      event_type: "photo",
    });
  });

  it("truncates an over-long caption to QUICK_LOG_DETAIL_TEXT_MAX", () => {
    const longCaption = "x".repeat(QUICK_LOG_DETAIL_TEXT_MAX + 50);
    const out = sanitizeQuickLogActivityDetails("photo", { caption: longCaption });
    expect((out?.caption as string).length).toBe(QUICK_LOG_DETAIL_TEXT_MAX);
    expect(out?.event_type).toBe("photo");
  });

  it("drops an out-of-set subject", () => {
    const out = sanitizeQuickLogActivityDetails("photo", { subject: "aliens" });
    expect(out).toBeNull();
  });
});

describe("describeQuickLogDetailsFromExtras", () => {
  it("describes a defoliation training entry with both technique and intensity", () => {
    const lines = describeQuickLogDetailsFromExtras({
      technique: "defoliation",
      intensity: "light",
      event_type: "training",
    });
    expect(lines).toEqual([
      { key: "technique", label: "Technique", value: "Defoliation" },
      { key: "intensity", label: "Amount removed", value: "Light" },
    ]);
  });

  it("never shows intensity for a non-defoliation technique, even if stored on the row", () => {
    // Simulates a malformed/legacy row where intensity was somehow stored
    // alongside a non-defoliation technique.
    const lines = describeQuickLogDetailsFromExtras({
      technique: "lst",
      intensity: "heavy",
    });
    expect(lines).toEqual([{ key: "technique", label: "Technique", value: "Low-stress training (LST)" }]);
  });

  it("describes a photo entry", () => {
    const lines = describeQuickLogDetailsFromExtras({
      subject: "trichomes",
      caption: "checking amber %",
    });
    expect(lines).toEqual([
      { key: "subject", label: "Subject", value: "Trichomes / macro" },
      { key: "caption", label: "Caption", value: "checking amber %" },
    ]);
  });

  it("returns an empty array for null/non-object/unrelated details", () => {
    expect(describeQuickLogDetailsFromExtras(null)).toEqual([]);
    expect(describeQuickLogDetailsFromExtras(undefined)).toEqual([]);
    expect(describeQuickLogDetailsFromExtras("not an object")).toEqual([]);
    expect(describeQuickLogDetailsFromExtras({ kind: "note", original_event_type: "note" })).toEqual([]);
  });
});
