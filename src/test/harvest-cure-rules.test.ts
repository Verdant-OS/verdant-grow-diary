import { describe, it, expect } from "vitest";
import {
  validateHarvestDetails,
  validateCureCheckDetails,
  cureCheckCautionState,
  cureCheckCautionCopy,
} from "@/lib/harvestCureRules";

describe("validateHarvestDetails", () => {
  it("accepts empty input as ok with empty value", () => {
    const r = validateHarvestDetails({});
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({});
  });

  it("rejects negative weights", () => {
    const r = validateHarvestDetails({ wet_weight_grams: -1, dry_weight_grams: -0.1 });
    expect(r.ok).toBe(false);
    expect(r.errors.wet_weight_grams).toBe("negative_not_allowed");
    expect(r.errors.dry_weight_grams).toBe("negative_not_allowed");
  });

  it("rejects non-finite weights", () => {
    const r = validateHarvestDetails({ wet_weight_grams: "abc" });
    expect(r.errors.wet_weight_grams).toBe("invalid_number");
  });

  it("accepts realistic weights and normalizes enums", () => {
    const r = validateHarvestDetails({
      wet_weight_grams: "420",
      dry_weight_grams: 95.5,
      trim_style: "Wet_Trim",
      keeper_candidate: "yes",
      pheno_label: " A1 ",
    });
    expect(r.ok).toBe(true);
    expect(r.value.wet_weight_grams).toBe(420);
    expect(r.value.dry_weight_grams).toBe(95.5);
    expect(r.value.trim_style).toBe("wet_trim");
    expect(r.value.keeper_candidate).toBe("yes");
    expect(r.value.pheno_label).toBe("A1");
  });

  it("never infers keeper status when omitted", () => {
    const r = validateHarvestDetails({ quality_note: "looks great", wet_weight_grams: 100 });
    expect(r.value.keeper_candidate).toBeUndefined();
  });
});

describe("validateCureCheckDetails", () => {
  it("rejects RH out of 0..100", () => {
    expect(validateCureCheckDetails({ jar_or_bag_rh: -1 }).errors.jar_or_bag_rh).toBe(
      "invalid_range",
    );
    expect(validateCureCheckDetails({ jar_or_bag_rh: 101 }).errors.jar_or_bag_rh).toBe(
      "invalid_range",
    );
  });

  it("accepts realistic RH/temp/day", () => {
    const r = validateCureCheckDetails({
      jar_or_bag_rh: 62,
      cure_temp_f: 68,
      cure_day: 7,
      mold_check: "clear",
      burped: "yes",
    });
    expect(r.ok).toBe(true);
    expect(r.value.jar_or_bag_rh).toBe(62);
    expect(r.value.cure_temp_f).toBe(68);
    expect(r.value.cure_day).toBe(7);
    expect(r.value.mold_check).toBe("clear");
    expect(r.value.burped).toBe("yes");
  });

  it("rejects unrealistic temperatures", () => {
    expect(validateCureCheckDetails({ cure_temp_f: 5 }).errors.cure_temp_f).toBe(
      "invalid_range",
    );
    expect(validateCureCheckDetails({ cure_temp_f: 200 }).errors.cure_temp_f).toBe(
      "invalid_range",
    );
  });

  it("rejects fractional/negative cure_day", () => {
    expect(validateCureCheckDetails({ cure_day: -1 }).errors.cure_day).toBe("invalid_range");
    expect(validateCureCheckDetails({ cure_day: 1.5 }).errors.cure_day).toBe("invalid_range");
  });

  it("returns caution only when mold_check === concern", () => {
    expect(cureCheckCautionState("clear")).toBe("none");
    expect(cureCheckCautionState("unknown")).toBe("none");
    expect(cureCheckCautionState(null)).toBe("none");
    expect(cureCheckCautionState("concern")).toBe("caution");
    expect(cureCheckCautionCopy("caution")).toMatch(/grower decision required/i);
    expect(cureCheckCautionCopy("none")).toBeNull();
  });
});
