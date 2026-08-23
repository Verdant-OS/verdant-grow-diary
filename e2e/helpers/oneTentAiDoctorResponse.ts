import type { AiDoctorReviewResult } from "../../src/lib/aiDoctorReviewResultContract";

/**
 * Deterministic paid-model boundary fixture for the authenticated One-Tent
 * proof. It is validated in Vitest by the same fail-closed contract the UI
 * uses before a review can render.
 */
export const DETERMINISTIC_AI_DOCTOR_RESPONSE = {
  summary: "The available Manual environmental snapshot warrants a cautious re-check.",
  likely_issue: "Possible short-lived environmental stress",
  confidence: "low",
  evidence: [
    "Plant stage recorded as flower",
    "Manual sensor snapshot included temperature and 48% RH",
    "No fresh device sensor reading was available",
  ],
  missing_information: [
    "Current device sensor reading",
    "Detailed visual symptom description",
    "Root-zone moisture observation",
  ],
  possible_causes: [
    "Short-lived temperature or humidity variation",
    "A plant response that cannot be distinguished without visual symptom context",
  ],
  immediate_action:
    "Take a fresh device sensor reading and record the visible symptom before considering any change.",
  what_not_to_do:
    "Do not change nutrients, irrigation, lighting, or equipment from this single Manual snapshot.",
  twenty_four_hour_follow_up:
    "Compare a fresh device sensor reading with another observation at the same point in the next photoperiod.",
  three_day_recovery_plan:
    "Collect comparable observations for three days; escalate only if the symptom persists and corroborating evidence appears.",
  risk_level: "low",
  action_queue_suggestion: {
    title: "Re-check the tent environment",
    rationale:
      "Collect a fresh device sensor reading and detailed plant observation before considering any adjustment.",
  },
} satisfies AiDoctorReviewResult;
