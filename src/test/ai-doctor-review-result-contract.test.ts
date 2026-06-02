/**
 * aiDoctorReviewResultContract — unit tests.
 */
import { describe, it, expect } from "vitest";
import {
  validateAiDoctorReviewResult,
  AI_DOCTOR_REVIEW_ARRAY_CAP,
} from "@/lib/aiDoctorReviewResultContract";

const valid = () => ({
  summary: "Plant shows mild leaf curl on lower fan leaves.",
  likely_issue: "Possible early heat stress.",
  confidence: "medium",
  evidence: ["Tent temp 29C", "Leaf curl on lower leaves"],
  missing_information: ["No recent VPD snapshot"],
  possible_causes: ["High tent temperature", "Low humidity"],
  immediate_action: "Lower tent temperature toward target range.",
  what_not_to_do: "Do not increase nutrient strength right now.",
  twenty_four_hour_follow_up: "Recheck leaf posture after 24 hours.",
  three_day_recovery_plan: "Hold feed schedule, monitor canopy daily.",
  risk_level: "watch",
});

describe("validateAiDoctorReviewResult", () => {
  it("accepts a valid cautious result", () => {
    const v = validateAiDoctorReviewResult(valid());
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.result.confidence).toBe("medium");
  });

  it("rejects unknown confidence", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      confidence: "very-high",
    });
    expect(v.ok).toBe(false);
  });

  it("rejects unknown risk_level", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      risk_level: "critical",
    });
    expect(v.ok).toBe(false);
  });

  it("rejects empty required fields", () => {
    const v = validateAiDoctorReviewResult({ ...valid(), summary: "" });
    expect(v.ok).toBe(false);
  });

  it("rejects whitespace-only required fields", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      immediate_action: "   \t  \n ",
    });
    expect(v.ok).toBe(false);
  });

  it("rejects arrays that exceed the cap", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      evidence: Array.from(
        { length: AI_DOCTOR_REVIEW_ARRAY_CAP + 1 },
        (_, i) => `e${i}`,
      ),
    });
    expect(v.ok).toBe(false);
  });

  it("strips raw_payload, secrets, tokens, service_role keys silently", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      raw_payload: { hidden: true },
      secret: "shhh",
      api_key: "sk-xxxx",
      service_role: "leak",
      tokens: ["a", "b"],
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      const dump = JSON.stringify(v.result);
      expect(dump).not.toMatch(/raw_payload/);
      expect(dump).not.toMatch(/api_key/);
      expect(dump).not.toMatch(/service_role/);
      expect(dump).not.toMatch(/shhh/);
      expect(dump).not.toMatch(/sk-xxxx/);
    }
  });

  it("rejects device-control language", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      immediate_action: "Turn on the exhaust fan immediately.",
    });
    expect(v.ok).toBe(false);
  });

  it("rejects banned wording in content (e.g., 'cured')", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      summary: "Plant is cured of all issues.",
    });
    expect(v.ok).toBe(false);
  });

  it("rejects banned wording in evidence array items", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      evidence: ["sensor synced fine"],
    });
    expect(v.ok).toBe(false);
  });

  it("trims required string fields before keeping them", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      summary: "  Trimmed summary.  ",
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.result.summary).toBe("Trimmed summary.");
  });

  it("accepts a valid action_queue_suggestion", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      action_queue_suggestion: {
        title: "Consider lowering tent target temperature",
        rationale: "Temperature has trended above range for 2 days.",
      },
    });
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.result.action_queue_suggestion?.title).toMatch(/temp/i);
  });

  it("rejects action_queue_suggestion with device-control language", () => {
    const v = validateAiDoctorReviewResult({
      ...valid(),
      action_queue_suggestion: {
        title: "Turn off heater",
        rationale: "Heater is too hot.",
      },
    });
    expect(v.ok).toBe(false);
  });
});
