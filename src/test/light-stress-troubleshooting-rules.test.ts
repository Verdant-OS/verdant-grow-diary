import { describe, expect, it } from "vitest";
import { evaluateLightStressEvidence } from "@/lib/lightStressTroubleshootingRules";

function leader(input: Parameters<typeof evaluateLightStressEvidence>[0]) {
  return evaluateLightStressEvidence(input).comparisons[0];
}

describe("evaluateLightStressEvidence", () => {
  it("fails closed when evidence is missing", () => {
    const result = evaluateLightStressEvidence(null);
    expect(result.confidence).toBe("low");
    expect(result.headline).toMatch(/not enough evidence/i);
    expect(
      result.comparisons.every((comparison) => comparison.support === "not_enough_evidence"),
    ).toBe(true);
    expect(result.nextDataToLog.length).toBeGreaterThanOrEqual(5);
  });

  it("distinguishes a top bleaching pattern without calling it a diagnosis", () => {
    const result = evaluateLightStressEvidence({
      visiblePattern: "bleached_top",
      locationPattern: "top_under_fixture",
      recentLightChange: true,
      ppfdOrDliAboveUsual: true,
    });
    expect(result.comparisons[0]?.id).toBe("bleaching_pattern");
    expect(result.comparisons[0]?.support).toBe("more_supported");
    // Bleaching and excess-intensity evidence overlap, so the rule keeps
    // confidence low instead of pretending the selected pattern proves cause.
    expect(result.confidence).toBe("low");
    expect(result.caution).toMatch(/not a diagnosis/i);
  });

  it("puts heat stress first when whole-canopy symptoms align with temperature", () => {
    const result = evaluateLightStressEvidence({
      visiblePattern: "whole_canopy_curl_droop",
      locationPattern: "whole_canopy",
      highCanopyTemperature: true,
    });
    expect(result.comparisons[0]?.id).toBe("heat_stress");
    expect(result.nextDataToLog[0]).toMatch(/temperature.*RH.*VPD/i);
  });

  it("keeps feed-related tip burn as an explicit alternative", () => {
    const result = evaluateLightStressEvidence({
      visiblePattern: "tip_first_across_levels",
      locationPattern: "tips_across_levels",
      recentFeedOrEcChange: true,
    });
    expect(result.comparisons[0]?.id).toBe("feed_related_tip_burn");
    expect(result.nextDataToLog[0]).toMatch(/feed strength.*EC/i);
  });

  it("can keep competing light and heat explanations visible", () => {
    const result = evaluateLightStressEvidence({
      visiblePattern: "curled_crispy_top",
      locationPattern: "whole_canopy",
      highCanopyTemperature: true,
      recentLightChange: true,
    });
    const ids = result.comparisons
      .filter((comparison) => comparison.support !== "not_enough_evidence")
      .map((comparison) => comparison.id);
    expect(ids).toEqual(expect.arrayContaining(["light_intensity_stress", "heat_stress"]));
  });

  it("never recommends blind automation or several simultaneous changes", () => {
    const result = evaluateLightStressEvidence({
      visiblePattern: "curled_crispy_top",
      recentLightChange: true,
    });
    const copy = JSON.stringify(result);
    expect(copy).toMatch(/one small, reversible change at a time/i);
    expect(copy).not.toMatch(/automat|control your light|turn off your light|raise the light \d/i);
  });

  it("is deterministic across repeated calls", () => {
    const input = {
      visiblePattern: "bleached_top" as const,
      locationPattern: "top_under_fixture" as const,
      ppfdOrDliAboveUsual: true,
    };
    expect(evaluateLightStressEvidence(input)).toEqual(evaluateLightStressEvidence(input));
    expect(leader(input)?.id).toBe("bleaching_pattern");
  });
});
