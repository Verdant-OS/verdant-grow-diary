/**
 * aiDoctorReviewResponseAdapter — validates server payloads, fails closed.
 */
import { describe, it, expect } from "vitest";
import { adaptAiDoctorReviewResponse } from "@/lib/aiDoctorReviewResponseAdapter";

const validResult = () => ({
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

describe("adaptAiDoctorReviewResponse", () => {
  it("accepts an envelope with ok=true and a valid result", () => {
    const out = adaptAiDoctorReviewResponse({
      ok: true,
      result: validResult(),
    });
    expect(out.ok).toBe(true);
  });

  it("accepts a bare valid result (no envelope)", () => {
    const out = adaptAiDoctorReviewResponse(validResult());
    expect(out.ok).toBe(true);
  });

  it("returns calm failure for null / undefined / strings", () => {
    expect(adaptAiDoctorReviewResponse(null).ok).toBe(false);
    expect(adaptAiDoctorReviewResponse(undefined).ok).toBe(false);
    expect(adaptAiDoctorReviewResponse("oops" as unknown).ok).toBe(false);
  });

  it("passes through server-provided ok=false reason", () => {
    const out = adaptAiDoctorReviewResponse({ ok: false, reason: "config" });
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.reason).toBe("config");
  });

  it("rejects raw imperative device-control content as invalid", () => {
    const out = adaptAiDoctorReviewResponse({
      ...validResult(),
      immediate_action: "Turn on the humidifier.",
    });
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.reason).toBe("invalid");
  });
});
