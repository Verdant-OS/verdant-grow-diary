import { describe, it, expect } from "vitest";
import {
  validateCureSpaceSetupDetails,
  getCureSpaceSetupStatusNotes,
} from "@/lib/cureSpaceSetupRules";

describe("validateCureSpaceSetupDetails", () => {
  it("accepts empty input as ok with empty value", () => {
    const r = validateCureSpaceSetupDetails({});
    expect(r.ok).toBe(true);
    expect(r.value).toEqual({});
  });

  it("rejects negative bag_count and non-integer bag_count", () => {
    expect(validateCureSpaceSetupDetails({ bag_count: -1 }).errors.bag_count).toBe(
      "negative_not_allowed",
    );
    expect(validateCureSpaceSetupDetails({ bag_count: 2.5 }).errors.bag_count).toBe(
      "invalid_integer",
    );
  });

  it("rejects floor_space_used_percent outside 0..100", () => {
    expect(
      validateCureSpaceSetupDetails({ floor_space_used_percent: -1 }).errors
        .floor_space_used_percent,
    ).toBe("negative_not_allowed");
    expect(
      validateCureSpaceSetupDetails({ floor_space_used_percent: 150 }).errors
        .floor_space_used_percent,
    ).toBe("invalid_range");
  });

  it("rejects negative effective open areas", () => {
    expect(
      validateCureSpaceSetupDetails({ intake_effective_area_cm2: -10 }).errors
        .intake_effective_area_cm2,
    ).toBe("negative_not_allowed");
    expect(
      validateCureSpaceSetupDetails({ exhaust_effective_area_cm2: -5 }).errors
        .exhaust_effective_area_cm2,
    ).toBe("negative_not_allowed");
    expect(
      validateCureSpaceSetupDetails({ total_effective_open_area_cm2: -1 }).errors
        .total_effective_open_area_cm2,
    ).toBe("negative_not_allowed");
  });

  it("rejects invalid buffer_pack_rh", () => {
    expect(
      validateCureSpaceSetupDetails({ buffer_pack_rh: 120 }).errors.buffer_pack_rh,
    ).toBe("invalid_range");
    expect(
      validateCureSpaceSetupDetails({ buffer_pack_rh: "abc" }).errors.buffer_pack_rh,
    ).toBe("invalid_number");
  });

  it("rejects invalid buffer_install_date", () => {
    expect(
      validateCureSpaceSetupDetails({ buffer_install_date: "not-a-date" }).errors
        .buffer_install_date,
    ).toBe("invalid_date");
    const ok = validateCureSpaceSetupDetails({ buffer_install_date: "2025-06-01" });
    expect(ok.value.buffer_install_date).toBe("2025-06-01");
  });

  it("accepts negative / zero / positive stack_delta_t_c within bounds", () => {
    expect(validateCureSpaceSetupDetails({ stack_delta_t_c: -2 }).value.stack_delta_t_c).toBe(-2);
    expect(validateCureSpaceSetupDetails({ stack_delta_t_c: 0 }).value.stack_delta_t_c).toBe(0);
    expect(validateCureSpaceSetupDetails({ stack_delta_t_c: 5 }).value.stack_delta_t_c).toBe(5);
    expect(
      validateCureSpaceSetupDetails({ stack_delta_t_c: 999 }).errors.stack_delta_t_c,
    ).toBe("invalid_range");
  });

  it("normalizes enums", () => {
    const r = validateCureSpaceSetupDetails({
      bag_arrangement: "TIGHT",
      ventilation_method: "strong_direct_fan",
      buffering_method: "boveda",
      bag_size_type: "1lb",
      mesh_filter_present: "yes",
    });
    expect(r.value.bag_arrangement).toBe("tight");
    expect(r.value.ventilation_method).toBe("strong_direct_fan");
    expect(r.value.buffering_method).toBe("boveda");
    expect(r.value.bag_size_type).toBe("1lb");
    expect(r.value.mesh_filter_present).toBe(true);
  });

  it("preserves sensor_snapshot_source verbatim from caller", () => {
    expect(
      validateCureSpaceSetupDetails({ sensor_snapshot_source: "manual" }).value
        .sensor_snapshot_source,
    ).toBe("manual");
    expect(
      validateCureSpaceSetupDetails({ sensor_snapshot_source: "nonsense" }).value
        .sensor_snapshot_source,
    ).toBeUndefined();
  });
});

describe("getCureSpaceSetupStatusNotes", () => {
  it("tight arrangement returns needs_review", () => {
    const notes = getCureSpaceSetupStatusNotes({ bag_arrangement: "tight" });
    expect(notes.some((n) => n.status === "needs_review")).toBe(true);
  });

  it("high floor-space use returns needs_review", () => {
    const notes = getCureSpaceSetupStatusNotes({ floor_space_used_percent: 85 });
    expect(notes.some((n) => n.status === "needs_review")).toBe(true);
  });

  it("strong direct ventilation returns caution", () => {
    const notes = getCureSpaceSetupStatusNotes({
      ventilation_method: "strong_direct_fan",
    });
    expect(notes.some((n) => n.status === "caution")).toBe(true);
  });

  it("sensor reading without source label returns needs_review", () => {
    const notes = getCureSpaceSetupStatusNotes({ bottom_sensor_temp_c: 20 });
    expect(notes.some((n) => n.status === "needs_review")).toBe(true);
  });

  it("empty value returns single recorded note", () => {
    const notes = getCureSpaceSetupStatusNotes({});
    expect(notes).toHaveLength(1);
    expect(notes[0].status).toBe("recorded");
  });
});
