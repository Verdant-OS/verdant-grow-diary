/**
 * Hardening tests for AI Doctor Review Result contract validator.
 *
 * Ensures safe cautious language passes while unsafe imperatives and
 * standalone banned words are still rejected. Pure tests; no I/O, no model
 * calls, no DB writes.
 */
import { describe, it, expect } from "vitest";
import { validateAiDoctorReviewResult } from "@/lib/aiDoctorReviewResultContract";

const base = () => ({
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

const SAFE_DEFENSIVE = [
  "Do not turn up heat equipment based on one reading.",
  "Do not toggle fans or humidifiers automatically.",
  "Do not change equipment settings without checking environment trends.",
  "Never switch off the exhaust based on a single snapshot.",
  "Avoid toggling fans without reviewing the timeline first.",
];

const IMPERATIVE_DEVICE = [
  "Turn on the humidifier.",
  "Switch off the fan.",
  "Power the heater.",
  "Toggle the light.",
];

const SAFE_BANNED_NEIGHBORS = [
  ["summary", "Outcome remains uncertain after one snapshot."],
  ["likely_issue", "Possible delivery issue with nutrient mix."],
  ["immediate_action", "Add an olive-toned reference photo for comparison."],
  [
    "three_day_recovery_plan",
    "Track plant connectedness to canopy airflow over 3 days.",
  ],
] as const;

const STANDALONE_BANNED = [
  "confirmed",
  "certain",
  "cured",
  "guaranteed",
  "live",
  "synced",
  "connected",
  "imported",
];

describe("AI Doctor Review Result contract — hardening", () => {
  for (const phrase of SAFE_DEFENSIVE) {
    it(`passes safe defensive device language: "${phrase}"`, () => {
      const v = validateAiDoctorReviewResult({
        ...base(),
        what_not_to_do: phrase,
      });
      expect(v.ok).toBe(true);
    });
  }

  for (const phrase of IMPERATIVE_DEVICE) {
    it(`rejects direct imperative device-control: "${phrase}"`, () => {
      const v = validateAiDoctorReviewResult({
        ...base(),
        immediate_action: phrase,
      });
      expect(v.ok).toBe(false);
    });
  }

  for (const [field, phrase] of SAFE_BANNED_NEIGHBORS) {
    it(`passes safe word containing banned substring in ${field}: "${phrase}"`, () => {
      const v = validateAiDoctorReviewResult({ ...base(), [field]: phrase });
      expect(v.ok).toBe(true);
    });
  }

  for (const word of STANDALONE_BANNED) {
    it(`still rejects standalone banned word: "${word}"`, () => {
      const v = validateAiDoctorReviewResult({
        ...base(),
        summary: `Plant status ${word} after review.`,
      });
      expect(v.ok).toBe(false);
    });
  }

  it("allows advisory device language alongside a separate safe sentence", () => {
    const v = validateAiDoctorReviewResult({
      ...base(),
      what_not_to_do:
        "Do not toggle fans automatically. Review the timeline first.",
    });
    expect(v.ok).toBe(true);
  });

  it("rejects when an imperative device sentence is mixed with advisory copy", () => {
    const v = validateAiDoctorReviewResult({
      ...base(),
      immediate_action:
        "Review the timeline first. Turn on the humidifier now.",
    });
    expect(v.ok).toBe(false);
  });
});
