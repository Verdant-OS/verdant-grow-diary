/**
 * quickLogActivityDetailFields — pure spec, sanitize, validate, and describe
 * coverage.
 *
 * Guards the doctrine-safe expansion of Quick Log activity detail: canonical
 * vocabulary conformance (training techniques / defoliation intensity), closed
 * option sets, reserved-key rejection, the nested environment_check envelope,
 * blocking number validation, and round-tripping stored codes back into human
 * labels for read-only surfaces.
 */
import { describe, it, expect } from "vitest";
import {
  QUICK_LOG_ACTIVITY_DETAIL_FIELDS,
  QUICK_LOG_ACTIVITY_FIXED_DETAILS,
  QUICK_LOG_DETAIL_FIELD_KEYS,
  QUICK_LOG_DETAIL_RESERVED_KEYS,
  QUICK_LOG_DETAIL_TEXT_MAX,
  getQuickLogActivityDetailFields,
  sanitizeQuickLogActivityDetails,
  describeQuickLogActivityDetails,
  describeQuickLogDetailsFromExtras,
  validateQuickLogDetailNumberInput,
} from "@/lib/quickLogActivityDetailFields";
import { TRAINING_TECHNIQUES, TRAINING_INTENSITIES } from "@/lib/quickLogTypedEventPayloadRules";

describe("canonical vocabulary conformance", () => {
  it("every training technique code is accepted by the canonical typed adapter", () => {
    const technique = getQuickLogActivityDetailFields("training")[0];
    expect(technique.key).toBe("technique");
    for (const opt of technique.options ?? []) {
      expect(
        TRAINING_TECHNIQUES.has(opt.value),
        `training option "${opt.value}" must be in canonical TRAINING_TECHNIQUES`,
      ).toBe(true);
    }
    // Defoliation is its own activity — never offered as a training technique.
    expect((technique.options ?? []).some((o) => o.value === "defoliation")).toBe(false);
  });

  it("defoliation persists canonical intensity codes under the canonical `intensity` key", () => {
    const fields = getQuickLogActivityDetailFields("defoliation");
    expect(fields.map((f) => f.key)).toEqual(["intensity", "canopyArea"]);
    const intensity = fields[0];
    for (const opt of intensity.options ?? []) {
      expect(
        TRAINING_INTENSITIES.has(opt.value),
        `intensity option "${opt.value}" must be in canonical TRAINING_INTENSITIES`,
      ).toBe(true);
    }
  });

  it("defoliation always carries the fixed technique=defoliation the typed adapter requires", () => {
    expect(QUICK_LOG_ACTIVITY_FIXED_DETAILS.defoliation).toEqual({ technique: "defoliation" });
    expect(sanitizeQuickLogActivityDetails("defoliation", {})).toEqual({
      technique: "defoliation",
    });
  });

  it("environment_check manual readings live in the canonical nested envelope as numbers", () => {
    expect(
      sanitizeQuickLogActivityDetails("environment_check", {
        checkType: "airflow",
        temp_c: "24",
        humidity_pct: "55",
      }),
    ).toEqual({
      checkType: "airflow",
      environment_check: { temp_c: 24, humidity_pct: 55 },
    });
  });
});

describe("spec shape", () => {
  it("returns no fields for activities that remain note-only", () => {
    expect(getQuickLogActivityDetailFields("feeding")).toEqual([]);
    expect(getQuickLogActivityDetailFields("harvest")).toEqual([]);
  });

  it("photo exposes subject + caption; note exposes a filing tag", () => {
    expect(getQuickLogActivityDetailFields("photo").map((f) => f.key)).toEqual([
      "subject",
      "caption",
    ]);
    expect(getQuickLogActivityDetailFields("note").map((f) => f.key)).toEqual(["noteTag"]);
  });

  it("issue_observation captures observed signs (never causes) as a fully CLOSED set", () => {
    const [sign, location] = getQuickLogActivityDetailFields("issue_observation");
    expect(sign.key).toBe("observedSign");
    expect(location.key).toBe("observationLocation");
    // Fully closed: no free-text "other" escape that could smuggle a diagnosis.
    expect((sign.options ?? []).some((o) => o.value === "other")).toBe(false);
    // Every option is a visible sign, never a cause/diagnosis. (Note: "burnt
    // edges" describes appearance and is allowed; "nutrient burn" — a cause —
    // is not.)
    const banned = /(deficien|nitrogen|phosphor|potassium|calcium|septoria|fungus|overwater|nutrient burn|lockout|diagnos)/i;
    for (const o of sign.options ?? []) expect(o.label).not.toMatch(banned);
  });

  it("environment_check keeps manual temp/RH plausibility-bounded and clearly manual", () => {
    const fields = getQuickLogActivityDetailFields("environment_check");
    const temp = fields.find((f) => f.key === "temp_c")!;
    const rh = fields.find((f) => f.key === "humidity_pct")!;
    expect(temp.kind).toBe("number");
    expect(temp.min).toBe(-10);
    expect(temp.max).toBe(60);
    expect(temp.envelope).toBe("environment_check");
    expect(rh.min).toBe(0);
    expect(rh.max).toBe(100);
    expect(rh.envelope).toBe("environment_check");
    expect(temp.label.toLowerCase()).toContain("manual");
  });

  it("keeps every option label across all activities free of diagnosis/recommendation language", () => {
    // "burnt" describes appearance (allowed); the cause-word "nutrient burn" is
    // guarded in the issue_observation-specific test above.
    const banned = /(should|recommend|diagnos|deficien|healthy|unhealthy|cure|toxic)/i;
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
    expect(sanitizeQuickLogActivityDetails("training", { technique: "supercropping" })).toEqual({
      technique: "supercropping",
    });
  });

  it("drops an out-of-set select value (fail closed, no raw passthrough)", () => {
    // The pre-fix non-canonical code must no longer be accepted.
    expect(sanitizeQuickLogActivityDetails("training", { technique: "supercrop" })).toBeNull();
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
    expect(sanitizeQuickLogActivityDetails("feeding", { foo: "bar" })).toBeNull();
    expect(sanitizeQuickLogActivityDetails("training", null)).toBeNull();
    expect(sanitizeQuickLogActivityDetails("training", {})).toBeNull();
  });

  it("sanitizes multi-field activities, keeping only valid values (plus fixed details)", () => {
    expect(
      sanitizeQuickLogActivityDetails("defoliation", {
        intensity: "medium",
        canopyArea: "lower",
        bogus: "x",
      }),
    ).toEqual({ intensity: "medium", canopyArea: "lower", technique: "defoliation" });
    // out-of-set intensity dropped (canonical set has no "moderate"), valid area kept
    expect(
      sanitizeQuickLogActivityDetails("defoliation", { intensity: "moderate", canopyArea: "upper" }),
    ).toEqual({ canopyArea: "upper", technique: "defoliation" });
  });

  it("accepts free-text caption on photo and caps its length", () => {
    const long = "x".repeat(500);
    const out = sanitizeQuickLogActivityDetails("photo", { subject: "buds", caption: long });
    expect(out?.subject).toBe("buds");
    expect(String(out?.caption ?? "").length).toBe(QUICK_LOG_DETAIL_TEXT_MAX);
  });

  it("issue_observation drops an out-of-set observed sign (closed set, fail closed)", () => {
    expect(
      sanitizeQuickLogActivityDetails("issue_observation", {
        observedSign: "nitrogen_deficiency",
        observationLocation: "lower_leaves",
      }),
    ).toEqual({ observationLocation: "lower_leaves" });
  });

  it("environment_check drops an impossible manual reading at the floor (UI gate blocks first)", () => {
    expect(
      sanitizeQuickLogActivityDetails("environment_check", {
        checkType: "walkthrough",
        temp_c: "999",
        humidity_pct: "150",
      }),
    ).toEqual({ checkType: "walkthrough" });
    // non-numeric manual reading dropped
    expect(sanitizeQuickLogActivityDetails("environment_check", { temp_c: "warm" })).toBeNull();
  });
});

describe("validateQuickLogDetailNumberInput (blocking UI gate)", () => {
  const temp = getQuickLogActivityDetailFields("environment_check").find(
    (f) => f.key === "temp_c",
  )!;
  const rh = getQuickLogActivityDetailFields("environment_check").find(
    (f) => f.key === "humidity_pct",
  )!;

  it("passes blank / missing (optional field semantics)", () => {
    expect(validateQuickLogDetailNumberInput(temp, "")).toEqual({ ok: true, error: null });
    expect(validateQuickLogDetailNumberInput(temp, "   ")).toEqual({ ok: true, error: null });
    expect(validateQuickLogDetailNumberInput(temp, null)).toEqual({ ok: true, error: null });
  });

  it("BLOCKS a typed non-numeric value — never silently dropped behind a receipt", () => {
    for (const raw of ["warm", "24C", "fifty"]) {
      const v = validateQuickLogDetailNumberInput(temp, raw);
      expect(v.ok, raw).toBe(false);
      expect(v.error).toMatch(/enter a number/i);
    }
  });

  it("passes an in-band value and BLOCKS an out-of-band one with grower-facing copy", () => {
    expect(validateQuickLogDetailNumberInput(temp, "24").ok).toBe(true);
    const tooHot = validateQuickLogDetailNumberInput(temp, "999");
    expect(tooHot.ok).toBe(false);
    expect(tooHot.error).toMatch(/between -10 and 60/);
    const tooHumid = validateQuickLogDetailNumberInput(rh, "150");
    expect(tooHumid.ok).toBe(false);
    expect(tooHumid.error).toMatch(/between 0 and 100/);
  });

  it("is a no-op for non-number fields", () => {
    const checkType = getQuickLogActivityDetailFields("environment_check")[0];
    expect(validateQuickLogDetailNumberInput(checkType, "garbage")).toEqual({
      ok: true,
      error: null,
    });
  });
});

describe("describeQuickLogActivityDetails", () => {
  it("maps a stored select code back to its human label", () => {
    const lines = describeQuickLogActivityDetails("training", { technique: "supercropping" });
    expect(lines).toEqual([{ key: "technique", label: "Technique", value: "Super cropping" }]);
  });

  it("skips out-of-set, blank, or missing values (degrades gracefully)", () => {
    expect(describeQuickLogActivityDetails("training", { technique: "supercrop" })).toEqual([]);
    expect(describeQuickLogActivityDetails("training", { technique: "" })).toEqual([]);
    expect(describeQuickLogActivityDetails("training", {})).toEqual([]);
    expect(describeQuickLogActivityDetails("training", null)).toEqual([]);
    expect(describeQuickLogActivityDetails("training", "garbage")).toEqual([]);
  });

  it("returns no lines for an activity without a detail slice", () => {
    expect(describeQuickLogActivityDetails("feeding", { technique: "lst" })).toEqual([]);
  });
});

describe("describeQuickLogDetailsFromExtras (activity-id-free render path)", () => {
  it("recovers a display line from stored extras without knowing the activity", () => {
    const lines = describeQuickLogDetailsFromExtras({ technique: "topping", note: "n/a" });
    expect(lines).toEqual([{ key: "technique", label: "Technique", value: "Topping" }]);
  });

  it("reads the canonical environment_check envelope (numbers) with units", () => {
    expect(
      describeQuickLogDetailsFromExtras({
        checkType: "airflow",
        environment_check: { temp_c: 24, humidity_pct: 55 },
      }),
    ).toEqual([
      { key: "checkType", label: "What you checked / adjusted", value: "Airflow / fans" },
      { key: "temp_c", label: "Temperature (manual)", value: "24 °C" },
      { key: "humidity_pct", label: "Humidity (manual)", value: "55 %" },
    ]);
  });

  it("does not surface defoliation's fixed technique as a redundant Training line", () => {
    // "defoliation" is not in the training select's option set, so the badge
    // set for a defoliation entry stays intensity/canopy only.
    const lines = describeQuickLogDetailsFromExtras({
      technique: "defoliation",
      intensity: "medium",
    });
    expect(lines).toEqual([{ key: "intensity", label: "Amount removed", value: "Medium" }]);
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
        if (spec.envelope) expect(QUICK_LOG_DETAIL_RESERVED_KEYS).not.toContain(spec.envelope);
      }
    }
  });

  it("detail field keys are globally unique across activities (extras describer relies on this)", () => {
    const seen = new Map<string, string>();
    for (const [activityId, specs] of Object.entries(QUICK_LOG_ACTIVITY_DETAIL_FIELDS)) {
      for (const spec of specs ?? []) {
        const key = spec.envelope ? `${spec.envelope}.${spec.key}` : spec.key;
        expect(
          seen.has(key),
          `field key "${key}" is reused by ${seen.get(key)} and ${activityId}`,
        ).toBe(false);
        seen.set(key, activityId);
      }
    }
  });

  it("QUICK_LOG_DETAIL_FIELD_KEYS covers every top-level structured key (raw-chip exclusion)", () => {
    // Flat spec keys, envelope parents, fixed keys, and the hook's subtype fence.
    for (const k of [
      "technique",
      "intensity",
      "canopyArea",
      "subject",
      "caption",
      "noteTag",
      "observedSign",
      "observationLocation",
      "checkType",
      "environment_check",
      "subtype",
    ]) {
      expect(QUICK_LOG_DETAIL_FIELD_KEYS.has(k), `missing exclusion key: ${k}`).toBe(true);
    }
    // Envelope INNER keys are not top-level — they must not be excluded flat.
    expect(QUICK_LOG_DETAIL_FIELD_KEYS.has("temp_c")).toBe(false);
  });

  it("caps free-text detail values under the write-seam size guard", () => {
    expect(QUICK_LOG_DETAIL_TEXT_MAX).toBeLessThan(20000);
  });
});
