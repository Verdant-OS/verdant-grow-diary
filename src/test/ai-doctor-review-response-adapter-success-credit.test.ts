/**
 * Adapter regression: success envelope with `credit` payload is preserved
 * (S3.1), and success envelope WITHOUT `credit` still works unchanged.
 */
import { describe, it, expect } from "vitest";
import { adaptAiDoctorReviewResponse } from "@/lib/aiDoctorReviewResponseAdapter";

const validResult = () => ({
  summary: "Plant shows mild leaf curl on lower fan leaves.",
  likely_issue: "Possible early heat stress.",
  confidence: "medium" as const,
  evidence: ["Tent temp 29C", "Leaf curl on lower leaves"],
  missing_information: ["No recent VPD snapshot"],
  possible_causes: ["High tent temperature", "Low humidity"],
  immediate_action: "Lower tent temperature toward target range.",
  what_not_to_do: "Do not increase nutrient strength right now.",
  twenty_four_hour_follow_up: "Recheck leaf posture after 24 hours.",
  three_day_recovery_plan: "Hold feed schedule, monitor canopy daily.",
  risk_level: "watch" as const,
});

describe("adaptAiDoctorReviewResponse — success credit passthrough (S3.1)", () => {
  it("preserves `credit` on success envelope", () => {
    const out = adaptAiDoctorReviewResponse({
      ok: true,
      result: validResult(),
      credit: { remaining: 97, scope: "per_month", scope_limit: 100 },
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.credit).toEqual({
        remaining: 97,
        scope: "per_month",
        scope_limit: 100,
      });
    }
  });

  it("success envelope without `credit` still works (credit undefined)", () => {
    const out = adaptAiDoctorReviewResponse({
      ok: true,
      result: validResult(),
    });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result).toBeDefined();
      expect(out.credit).toBeUndefined();
    }
  });

  it("bare-result (legacy) still works and has no credit", () => {
    const out = adaptAiDoctorReviewResponse(validResult());
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.credit).toBeUndefined();
  });
});
