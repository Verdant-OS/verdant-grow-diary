import { describe, it, expect } from "vitest";
import {
  validateDryPhaseCheckDetails,
  getDryPhaseStatusNotes,
} from "@/lib/dryPhaseCheckRules";

describe("validateDryPhaseCheckDetails", () => {
  it("accepts empty input as ok", () => {
    const r = validateDryPhaseCheckDetails({});
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({});
  });

  it("rejects negative dry_day", () => {
    expect(validateDryPhaseCheckDetails({ dry_day: -1 }).errors.dry_day).toBe(
      "negative_not_allowed",
    );
  });

  it("rejects non-integer dry_day", () => {
    expect(validateDryPhaseCheckDetails({ dry_day: 2.5 }).errors.dry_day).toBe(
      "invalid_integer",
    );
  });

  it("rejects RH outside 0..100", () => {
    expect(validateDryPhaseCheckDetails({ ambient_rh: -1 }).errors.ambient_rh).toBe(
      "invalid_range",
    );
    expect(validateDryPhaseCheckDetails({ ambient_rh: 150 }).errors.ambient_rh).toBe(
      "invalid_range",
    );
  });

  it("rejects unrealistic temperature", () => {
    expect(
      validateDryPhaseCheckDetails({ ambient_temp_c: -50 }).errors.ambient_temp_c,
    ).toBe("invalid_range");
    expect(
      validateDryPhaseCheckDetails({ ambient_temp_c: 200 }).errors.ambient_temp_c,
    ).toBe("invalid_range");
  });

  it("rejects negative VPD", () => {
    expect(validateDryPhaseCheckDetails({ vpd_kpa: -0.1 }).errors.vpd_kpa).toBe(
      "negative_not_allowed",
    );
  });

  it("normalizes enums", () => {
    const r = validateDryPhaseCheckDetails({
      stem_snap_status: "CLEAN_SNAP",
      exterior_bud_feel: "tacky",
      mold_check: "concern",
      airflow_observation: "strong_direct",
    });
    expect(r.value.stem_snap_status).toBe("clean_snap");
    expect(r.value.exterior_bud_feel).toBe("tacky");
    expect(r.value.mold_check).toBe("concern");
    expect(r.value.airflow_observation).toBe("strong_direct");
  });

  it("rejects invalid next_check_due", () => {
    expect(
      validateDryPhaseCheckDetails({ next_check_due: "not-a-date" }).errors
        .next_check_due,
    ).toBe("invalid_date");
  });
});

describe("getDryPhaseStatusNotes", () => {
  it("mold concern returns caution only", () => {
    const notes = getDryPhaseStatusNotes({ mold_check: "concern" });
    expect(notes.some((n) => n.status === "caution")).toBe(true);
  });

  it("strong_direct airflow returns caution", () => {
    const notes = getDryPhaseStatusNotes({ airflow_observation: "strong_direct" });
    expect(notes.some((n) => n.status === "caution")).toBe(true);
  });

  it("stagnant airflow returns needs_review", () => {
    const notes = getDryPhaseStatusNotes({ airflow_observation: "stagnant" });
    expect(notes.some((n) => n.status === "needs_review")).toBe(true);
    expect(notes.some((n) => n.status === "caution")).toBe(false);
  });

  it("out-of-range RH/temp/VPD returns needs_review", () => {
    expect(
      getDryPhaseStatusNotes({ ambient_rh: 90 }).some((n) => n.status === "needs_review"),
    ).toBe(true);
    expect(
      getDryPhaseStatusNotes({ ambient_temp_c: 5 }).some(
        (n) => n.status === "needs_review",
      ),
    ).toBe(true);
    expect(
      getDryPhaseStatusNotes({ vpd_kpa: 2.5 }).some((n) => n.status === "needs_review"),
    ).toBe(true);
  });

  it("empty value returns single recorded note", () => {
    const notes = getDryPhaseStatusNotes({});
    expect(notes).toHaveLength(1);
    expect(notes[0].status).toBe("recorded");
  });
});
