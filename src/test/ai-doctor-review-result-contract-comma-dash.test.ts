/**
 * Regression: comma- and dash-separated clauses must not let an
 * imperative device-control command sneak past a leading negation.
 */
import { describe, it, expect } from "vitest";
import { validateAiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";

const base = () => ({
  summary: "Plant shows mild leaf curl on lower fan leaves.",
  likely_issue: "Possible early heat stress.",
  confidence: "medium",
  evidence: ["Tent temp 29C"],
  missing_information: ["No recent VPD snapshot"],
  possible_causes: ["High tent temperature"],
  immediate_action: "Lower tent temperature toward target range.",
  what_not_to_do: "Avoid increasing nutrient strength right now.",
  twenty_four_hour_follow_up: "Recheck leaf posture after 24 hours.",
  three_day_recovery_plan: "Hold feed schedule, monitor canopy daily.",
  risk_level: "watch",
});

describe("AI Doctor Review contract — comma/dash clause splitter", () => {
  const REJECTS = [
    "Do not wait, turn on the humidifier.",
    "Do not wait — turn on the humidifier.",
    "Do not wait – turn on the humidifier.",
    "Do not wait - turn on the humidifier.",
  ];
  for (const phrase of REJECTS) {
    it(`rejects run-on imperative: "${phrase}"`, () => {
      const v = validateAiDoctorReviewResult({
        ...base(),
        immediate_action: phrase,
      });
      expect(v.ok).toBe(false);
    });
  }

  it("still passes purely advisory comma-separated clauses", () => {
    const v = validateAiDoctorReviewResult({
      ...base(),
      what_not_to_do:
        "Do not toggle fans automatically, and do not change equipment based on one reading.",
    });
    expect(v.ok).toBe(true);
  });
});
