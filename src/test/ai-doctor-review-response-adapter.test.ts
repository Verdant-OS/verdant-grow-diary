/**
 * aiDoctorReviewResponseAdapter — validates server payloads, fails closed.
 */
import { describe, it, expect } from "vitest";
import { adaptCreditedAiResponse } from "@/lib/aiCreditedResponseAdapter";
import { validateAiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";

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

describe("adaptCreditedAiResponse", () => {
  it("accepts an envelope with ok=true and a valid result", () => {
    const out = adaptCreditedAiResponse({
      ok: true,
      result: validResult(),
    });
    expect(out.ok).toBe(true);
  });

  it("accepts a bare valid result (no envelope)", () => {
    const out = adaptCreditedAiResponse(validResult());
    expect(out.ok).toBe(true);
  });

  it("returns calm failure for null / undefined / strings", () => {
    expect(adaptCreditedAiResponse(null).ok).toBe(false);
    expect(adaptCreditedAiResponse(undefined).ok).toBe(false);
    expect(adaptCreditedAiResponse("oops" as unknown).ok).toBe(false);
  });

  it("passes through server-provided ok=false reason", () => {
    const out = adaptCreditedAiResponse({ ok: false, reason: "config" });
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.reason).toBe("config");
  });

  it("rejects raw imperative device-control content as invalid", () => {
    const out = adaptCreditedAiResponse(
      {
        ...validResult(),
        immediate_action: "Turn on the humidifier.",
      },
      validateAiDoctorReviewResult,
    );
    expect(out.ok).toBe(false);
    if (out.ok === false) expect(out.reason).toBe("invalid");
  });
});
