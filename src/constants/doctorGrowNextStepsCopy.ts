/** Pinned copy for the grow-level "Next steps" card on /doctor. */
export const DOCTOR_GROW_NEXT_STEPS_COPY = {
  heading: (growName: string) => `Next steps for ${growName}`,
  description:
    "Get cautious next steps from this grow's recent logs and sensor readings. No photo needed, and Verdant will not pick a plant for you. Uses one AI credit.",
  button: "Get next steps",
  running: "Getting next steps…",
  retry: "Try again",
  empty:
    "There isn't enough logged in this grow yet for useful next steps. Save a Quick Log first, then try again. No credit was used.",
  pending:
    "Your next steps are still being confirmed. Try again in a moment; Verdant will reuse the same request.",
  failed: "Verdant couldn't get next steps right now. Nothing was changed. Try again in a moment.",
  uncertain:
    "Verdant lost the connection before it could confirm your next steps, so it can't tell yet whether this request finished. Try again: Verdant reuses the same request, so a finished answer is shown instead of a new one being started.",
  likelyIssueLabel: "Likely issue",
  riskLabel: "Risk",
  evidenceHeading: "Evidence",
  missingHeading: "Missing information",
  possibleCausesHeading: "Possible causes",
  resultHeading: "Suggested next steps",
  doNotDoHeading: "What not to do",
  followUpHeading: "24-hour follow-up",
  followUp3DayHeading: "3-day recovery plan",
  sparseNote: "This grow has very few logs, so confidence is limited to low.",
  confidenceLabel: "Confidence",
  disclaimer:
    "Suggestions only. Verdant never controls equipment, and nothing is added to your Action Queue automatically.",
} as const;

export const DOCTOR_GROW_NEXT_STEPS_FALLBACK_GROW_NAME = "your grow";
