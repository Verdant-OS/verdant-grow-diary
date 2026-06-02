import { validateAiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";
const v = {
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
};
console.log(JSON.stringify(validateAiDoctorReviewResult(v)));
