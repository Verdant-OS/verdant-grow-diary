/**
 * quickLogActivityDetailFields — pure spec, sanitize, and describe coverage.
 *
 * Guards the doctrine-safe expansion of Quick Log activity detail: closed
 * option sets, reserved-key rejection, blank/invalid drop, and round-tripping
 * stored codes back into human labels for read-only surfaces.
 */
import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_ACTIVITY_DETAIL_FIELDS,
  QUICK_LOG_DETAIL_RESERVED_KEYS,
  QUICK_LOG_DETAIL_TEXT_MAX,
  getQuickLogActivityDetailFields,
  sanitizeQuickLogActivityDetails,
  describeQuickLogActivityDetails,
  describeQuickLogDetailsFromExtras,
} from "@/lib/quickLogActivityDetailFields";

describe("quickLogActivityDetailFields — training technique spec", () => {
  it("exposes an ordered technique select with a closed, descriptive option set", () => {
    const fields = getQuickLogActivityDetailFields("training");
    expect(fields).toHaveLength(1);
    const technique = fields[0];
    expect(technique.key).toBe("technique");
    expect(technique.kind).toBe("select");
    const values = (technique.options ?? []).map((o) => o.value);
    expect(values).toContain("lst");
    expect(values).toContain("topping");
    expect(values).toContain("other");
    // No reserved identity key can ever be a field key.
    expect(QUICK_LOG_DETAIL_RESERVED_KEYS).not.toContain(technique.key);
  });

  it("keeps option labels neutral/descriptive (no diagnosis or recommendation language)", () => {
    const technique = getQuickLogActivityDetailFields("training")[0];
    const banned = /(should|recommend|diagnos|deficien|healthy|unhealthy|cure|treat)/i;
    for (const opt of technique.options ?? []) {
      expect(opt.label, `option ${opt.value} label must stay descriptive`).not.toMatch(banned);
    }
  });

  it("returns no fields for activities without a detail slice yet", () => {
    // The two doctrine-cardinal activities are intentionally still note-only
    // until their field options are confirmed.
    expect(getQuickLogActivityDetailFields("issue_observation")).toEqual([]);
    expect(getQuickLogActivityDetailFields("environment_check")).toEqual([]);
  });

  it("exposes doctrine-safe detail fields for defoliation, photo, and note", () => {
    expect(getQuickLogActivityDetailFields("defoliation").map((f) => f.key)).toEqual([
      "amount",
      "canopyArea",
    ]);
    expect(getQuickLogActivityDetailFields("photo").map((f) => f.key)).toEqual([
      "subject",
      "caption",
    ]);
    expect(getQuickLogActivityDetailFields("note").map((f) => f.key)).toEqual(["noteTag"]);
  });

  it("keeps every option label across all activities free of diagnosis/recommendation language", () => {
    const banned = /(should|recommend|diagnos|deficien|healthy|unhealthy|cure|treat|toxic|burn)/i;
    for (const specs of Object.values(QUICK_LOG_ACTIVITY_DETAIL_FIELDS)) {
      for (const spec of specs ?? []) {
        for (const opt of spec.options ?? []) {
          expect(opt.label, `option ${opt.value}`).not.toMatch(banned);
        }
      }
    }
  });
});

describe("sanitizeQuickLogActivityDetails", () => {
  it("accepts a valid in-set select value", () => {
    expect(sanitizeQuickLogActivityDetails("training", { technique: "topping" })).toEqual({
      technique: "topping",
    });
  });

  it("drops an out-of-set select value (fail closed, no raw passthrough)", () => {
    expect(sanitizeQuickLogActivityDetails("training", { technique: "napalm" })).toBeNull();
  });

  it("drops blank, whitespace, and non-string values", () => {
    expect(sanitizeQuickLogActivityDetails("training", { technique: "" })).toBeNull();
    expect(sanitizeQuickLogActivityDetails("training", { technique: "   " })).toBeNull();
    expect(sanitizeQuickLogActivityDetails("training", { technique: 3 as unknown as string })).toBeNull();
  });

  it("ignores unknown keys and never emits reserved identity keys", () => {
    const out = sanitizeQuickLogActivityDetails("training", {
      technique: "lst",
      user_id: "attacker",
      grow_id: "x",
      bogus: "y",
    });
    expect(out).toEqual({ technique: "lst" });
    for (const k of QUICK_LOG_DETAIL_RESERVED_KEYS) {
      expect(out).not.toHaveProperty(k);
    }
  });

  it("returns null for activities without a detail slice and for empty input", () => {
    expect(sanitizeQuickLogActivityDetails("issue_observation", { foo: "bar" })).toBeNull();
    expect(sanitizeQuickLogActivityDetails("training", null)).toBeNull();
    expect(sanitizeQuickLogActivityDetails("training", {})).toBeNull();
  });

  it("sanitizes multi-field activities, keeping only valid values", () => {
    expect(
      sanitizeQuickLogActivityDetails("defoliation", {
        amount: "moderate",
        canopyArea: "lower",
        bogus: "x",
      }),
    ).toEqual({ amount: "moderate", canopyArea: "lower" });
    // out-of-set amount dropped, valid area kept
    expect(
      sanitizeQuickLogActivityDetails("defoliation", { amount: "nuclear", canopyArea: "upper" }),
    ).toEqual({ canopyArea: "upper" });
  });

  it("accepts free-text caption on photo and caps its length", () => {
    const long = "x".repeat(500);
    const out = sanitizeQuickLogActivityDetails("photo", { subject: "buds", caption: long });
    expect(out?.subject).toBe("buds");
    expect((out?.caption ?? "").length).toBe(QUICK_LOG_DETAIL_TEXT_MAX);
  });
});

describe("describeQuickLogActivityDetails", () => {
  it("maps a stored select code back to its human label", () => {
    const lines = describeQuickLogActivityDetails("training", { technique: "supercrop" });
    expect(lines).toEqual([{ key: "technique", label: "Technique", value: "Super cropping" }]);
  });

  it("skips out-of-set, blank, or missing values (degrades gracefully)", () => {
    expect(describeQuickLogActivityDetails("training", { technique: "napalm" })).toEqual([]);
    expect(describeQuickLogActivityDetails("training", { technique: "" })).toEqual([]);
    expect(describeQuickLogActivityDetails("training", {})).toEqual([]);
    expect(describeQuickLogActivityDetails("training", null)).toEqual([]);
    expect(describeQuickLogActivityDetails("training", "garbage")).toEqual([]);
  });

  it("returns no lines for an activity without a detail slice", () => {
    expect(describeQuickLogActivityDetails("note", { technique: "lst" })).toEqual([]);
  });
});

describe("describeQuickLogDetailsFromExtras (activity-id-free render path)", () => {
  it("recovers a display line from stored extras without knowing the activity", () => {
    // The diary mirror does not preserve a specific activity/event_type, so the
    // plant recent-activity surface must recover detail from the raw extras.
    const lines = describeQuickLogDetailsFromExtras({ technique: "topping", note: "n/a" });
    expect(lines).toEqual([{ key: "technique", label: "Technique", value: "Topping" }]);
  });

  it("ignores unknown keys and out-of-set codes", () => {
    expect(describeQuickLogDetailsFromExtras({ foo: "bar", technique: "napalm" })).toEqual([]);
    expect(describeQuickLogDetailsFromExtras(null)).toEqual([]);
    expect(describeQuickLogDetailsFromExtras("garbage")).toEqual([]);
  });
});

describe("detail spec invariants", () => {
  it("every field key across all activities avoids the reserved identity keys", () => {
    for (const [, specs] of Object.entries(QUICK_LOG_ACTIVITY_DETAIL_FIELDS)) {
      for (const spec of specs ?? []) {
        expect(QUICK_LOG_DETAIL_RESERVED_KEYS).not.toContain(spec.key);
      }
    }
  });

  it("detail field keys are globally unique across activities (extras describer relies on this)", () => {
    const seen = new Map<string, string>();
    for (const [activityId, specs] of Object.entries(QUICK_LOG_ACTIVITY_DETAIL_FIELDS)) {
      for (const spec of specs ?? []) {
        expect(
          seen.has(spec.key),
          `field key "${spec.key}" is reused by ${seen.get(spec.key)} and ${activityId}`,
        ).toBe(false);
        seen.set(spec.key, activityId);
      }
    }
  });

  it("caps free-text detail values under the write-seam size guard", () => {
    expect(QUICK_LOG_DETAIL_TEXT_MAX).toBeLessThan(20000);
  });
});
