import { describe, it, expect } from "vitest";
import {
  tooltipForEvidence,
  tooltipForMissing,
  getAiDoctorReadinessItemHelp,
  AI_DOCTOR_READINESS_ITEM_CODES,
} from "@/lib/aiDoctorContextViewModel";

describe("AI Doctor readiness tooltips", () => {
  it("returns non-empty tooltip copy for each required readiness item", () => {
    for (const code of ["stage", "strain", "medium", "recent-warnings", "plant-photo"]) {
      expect(tooltipForEvidence(code).length).toBeGreaterThan(0);
    }
  });

  it("describes 'plant-photo' missing distinctly from evidence wording", () => {
    expect(tooltipForMissing("plant-photo")).toMatch(/No recent plant photo/i);
    expect(tooltipForEvidence("plant-photo")).toMatch(/photo context exists/i);
  });

  it("describes 'recent-warnings' missing as no warnings on file", () => {
    expect(tooltipForMissing("recent-warnings")).toMatch(/No recent warnings/i);
  });

  it("falls back to evidence tooltip when no missing override exists", () => {
    expect(tooltipForMissing("stage")).toBe(tooltipForEvidence("stage"));
  });

  it("falls back to empty string for unknown codes", () => {
    expect(tooltipForEvidence("not-a-code")).toBe("");
    expect(tooltipForMissing("not-a-code")).toBe("");
  });

  it("getAiDoctorReadinessItemHelp returns every required item with tooltip", () => {
    const help = getAiDoctorReadinessItemHelp();
    const codes = help.map((h) => h.code);
    for (const c of AI_DOCTOR_READINESS_ITEM_CODES) {
      expect(codes).toContain(c);
    }
    for (const item of help) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.tooltip.length).toBeGreaterThan(0);
    }
  });
});
