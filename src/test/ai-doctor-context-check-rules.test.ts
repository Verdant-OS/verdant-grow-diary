import { describe, expect, it } from "vitest";

import {
  AI_DOCTOR_CONTEXT_CATEGORIES,
  buildAiDoctorContextPricingPath,
  buildAiDoctorContextShareData,
  evaluateAiDoctorContext,
} from "@/lib/aiDoctorContextCheckRules";

describe("AI Doctor context check rules", () => {
  it("scores all twelve contract categories including the previously missing evidence axes", () => {
    expect(AI_DOCTOR_CONTEXT_CATEGORIES).toHaveLength(12);
    expect(AI_DOCTOR_CONTEXT_CATEGORIES.map((category) => category.key)).toEqual([
      "plant_stage",
      "strain",
      "medium",
      "pot_size",
      "recent_watering",
      "recent_feeding",
      "sensor_snapshots",
      "recent_photos",
      "diary_entries",
      "alerts",
      "grow_targets",
      "plant_history",
    ]);
    expect(AI_DOCTOR_CONTEXT_CATEGORIES.find(({ key }) => key === "pot_size")?.core).toBe(true);
    expect(AI_DOCTOR_CONTEXT_CATEGORIES.find(({ key }) => key === "grow_targets")?.core).toBe(true);
    expect(AI_DOCTOR_CONTEXT_CATEGORIES.find(({ key }) => key === "plant_history")).toBeDefined();
  });

  it("fails closed for null, arrays, arbitrary keys, and non-boolean values", () => {
    for (const input of [
      null,
      [],
      { unknown: true },
      { plant_stage: "yes", medium: 1, pot_size: null },
    ]) {
      expect(evaluateAiDoctorContext(input)).toMatchObject({
        readiness: "insufficient",
        completedCount: 0,
        coveragePercent: 0,
      });
    }
  });

  it("requires every core field plus current and historical evidence for strong coverage", () => {
    const result = evaluateAiDoctorContext({
      plant_stage: true,
      strain: true,
      medium: true,
      pot_size: true,
      recent_watering: true,
      recent_feeding: true,
      recent_photos: true,
      diary_entries: true,
      grow_targets: true,
    });

    expect(result).toMatchObject({
      readiness: "strong",
      completedCount: 9,
      totalCount: 12,
      coveragePercent: 75,
      missingCoreKeys: [],
    });
    expect(result.summary).toMatch(/cannot prove a diagnosis/i);
  });

  it("keeps the eight-category boundary partial even when all structural gates are met", () => {
    const result = evaluateAiDoctorContext({
      plant_stage: true,
      medium: true,
      pot_size: true,
      recent_watering: true,
      recent_feeding: true,
      grow_targets: true,
      recent_photos: true,
      plant_history: true,
    });
    expect(result.readiness).toBe("partial");
    expect(result.completedCount).toBe(8);
  });

  it("keeps broad supporting evidence insufficient when core root-zone context is absent", () => {
    const result = evaluateAiDoctorContext({
      strain: true,
      sensor_snapshots: true,
      recent_photos: true,
      diary_entries: true,
      alerts: true,
      plant_history: true,
    });
    expect(result.readiness).toBe("insufficient");
    expect(result.missingCoreKeys).toContain("pot_size");
    expect(result.missingCoreKeys).toContain("grow_targets");
  });

  it("returns stable prioritized gaps and deterministic output", () => {
    const input = { plant_stage: true, recent_photos: true };
    const first = evaluateAiDoctorContext(input);
    expect(evaluateAiDoctorContext(input)).toEqual(first);
    expect(first.nextKeys).toEqual(["medium", "pot_size", "recent_watering"]);
  });

  it("builds fixed PII-free share and pricing attribution URLs", () => {
    const share = buildAiDoctorContextShareData();
    const url = new URL(share.url);
    expect(url.origin + url.pathname).toBe(
      "https://verdantgrowdiary.com/ai-doctor-readiness-check",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      utm_source: "context_check_share",
      utm_medium: "referral",
      utm_campaign: "ai_doctor_context_check",
    });
    expect(share.url).not.toMatch(/email|user_?id|token|selection|answer/i);
    expect(buildAiDoctorContextPricingPath()).toBe(
      "/pricing?utm_source=context_check&utm_medium=owned&utm_campaign=context_check",
    );
  });
});
