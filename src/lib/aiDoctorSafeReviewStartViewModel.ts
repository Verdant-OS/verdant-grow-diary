/**
 * aiDoctorSafeReviewStartViewModel — pure mapping from an evaluated
 * AI Doctor context result → "safe review start" preparation view.
 *
 * Hard constraints:
 *  - Pure: no React, no Supabase, no I/O, no model/API calls.
 *  - Never creates AI Doctor sessions, alerts, or action queue items.
 *  - Never emits banned words: diagnosis, diagnosed, confirmed, certain,
 *    cured, guaranteed, live, synced, connected, imported.
 *  - This view-model only describes preparation. It does NOT send any
 *    AI request. Sending is intentionally out of scope for this build.
 */

import type {
  AiDoctorContextResult,
  AiDoctorContextReadiness,
} from "@/lib/aiDoctorContextRules";
import {
  labelEvidence,
  labelMissing,
} from "@/lib/aiDoctorContextViewModel";

export const AI_DOCTOR_SAFE_REVIEW_TITLE = "Cautious review preparation";

export const AI_DOCTOR_SAFE_REVIEW_NO_REQUEST_NOTICE =
  "No AI request has been sent yet.";

export const AI_DOCTOR_SAFE_REVIEW_PARTIAL_NOTICE =
  "This review may have limited confidence because some context is missing.";

export const AI_DOCTOR_SAFE_REVIEW_STRONG_NOTICE =
  "Context is strong enough for a cautious review.";

export const AI_DOCTOR_SAFE_REVIEW_DISABLED_BUTTON_LABEL =
  "AI review not enabled in this build";

export const AI_DOCTOR_SAFE_REVIEW_START_LABEL = "Start cautious review";

export const AI_DOCTOR_SAFE_REVIEW_BLOCKED_REASON =
  "More context needed before a cautious review can start.";

export type AiDoctorSafeReviewVariant = "blocked" | "partial" | "strong";

export interface AiDoctorSafeReviewSummaryItem {
  code: string;
  label: string;
}

export interface AiDoctorSafeReviewPreparation {
  title: string;
  readinessNotice: string;
  noRequestNotice: string;
  evidence: AiDoctorSafeReviewSummaryItem[];
  missing: AiDoctorSafeReviewSummaryItem[];
  timelineSummary: string;
  snapshotSummary: string;
  warningsSummary: string;
  disabledButtonLabel: string;
}

export interface AiDoctorSafeReviewStartView {
  /** True when a "Start cautious review" entry point can be shown. */
  allowStart: boolean;
  /** Label for the entry-point button. */
  startLabel: string;
  /** Calm reason copy when blocked; empty string otherwise. */
  blockedReason: string;
  variant: AiDoctorSafeReviewVariant;
  readiness: AiDoctorContextReadiness;
  /** Preparation payload — only meaningful when `allowStart` is true. */
  preparation: AiDoctorSafeReviewPreparation | null;
}

function formatTimelineSummary(result: AiDoctorContextResult): string {
  const total = result.counts.recentEvents;
  const wf = result.counts.recentWateringOrFeeding;
  if (total <= 0) {
    return "No timeline activity logged in the last 7 days.";
  }
  const wfPart =
    wf > 0
      ? `, including ${wf} watering or feeding entr${wf === 1 ? "y" : "ies"}`
      : "";
  return `${total} timeline entr${total === 1 ? "y" : "ies"} in the last 7 days${wfPart}.`;
}

function formatSnapshotSummary(result: AiDoctorContextResult): string {
  const n = result.counts.recentManualSnapshots;
  if (n <= 0) return "No manual sensor snapshot in the last 7 days.";
  const fresh = result.evidence.includes("fresh-manual-sensor-snapshot");
  const freshPart = fresh
    ? "Most recent snapshot is within 48 hours."
    : "Most recent snapshot is older than 48 hours.";
  return `${n} manual sensor snapshot${n === 1 ? "" : "s"} in the last 7 days. ${freshPart}`;
}

function formatWarningsSummary(result: AiDoctorContextResult): string {
  const w = result.counts.recentWarnings;
  if (w <= 0) return "No recent warnings on file.";
  return `${w} recent warning${w === 1 ? "" : "s"} on file for review.`;
}

function buildPreparation(
  result: AiDoctorContextResult,
  variant: Exclude<AiDoctorSafeReviewVariant, "blocked">,
): AiDoctorSafeReviewPreparation {
  return {
    title: AI_DOCTOR_SAFE_REVIEW_TITLE,
    readinessNotice:
      variant === "strong"
        ? AI_DOCTOR_SAFE_REVIEW_STRONG_NOTICE
        : AI_DOCTOR_SAFE_REVIEW_PARTIAL_NOTICE,
    noRequestNotice: AI_DOCTOR_SAFE_REVIEW_NO_REQUEST_NOTICE,
    evidence: result.evidence.map((code) => ({
      code,
      label: labelEvidence(code),
    })),
    missing: result.missing.map((code) => ({
      code,
      label: labelMissing(code),
    })),
    timelineSummary: formatTimelineSummary(result),
    snapshotSummary: formatSnapshotSummary(result),
    warningsSummary: formatWarningsSummary(result),
    disabledButtonLabel: AI_DOCTOR_SAFE_REVIEW_DISABLED_BUTTON_LABEL,
  };
}

export function buildAiDoctorSafeReviewStart(
  result: AiDoctorContextResult,
): AiDoctorSafeReviewStartView {
  const readiness = result.readiness;
  if (readiness === "insufficient") {
    return {
      allowStart: false,
      startLabel: AI_DOCTOR_SAFE_REVIEW_START_LABEL,
      blockedReason: AI_DOCTOR_SAFE_REVIEW_BLOCKED_REASON,
      variant: "blocked",
      readiness,
      preparation: null,
    };
  }
  const variant: "partial" | "strong" =
    readiness === "strong" ? "strong" : "partial";
  return {
    allowStart: true,
    startLabel: AI_DOCTOR_SAFE_REVIEW_START_LABEL,
    blockedReason: "",
    variant,
    readiness,
    preparation: buildPreparation(result, variant),
  };
}
