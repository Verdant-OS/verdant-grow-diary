/**
 * Pure view-model helpers for the historical AI Doctor session detail page.
 *
 * Read-only. No AI calls. No DB writes. No automation.
 * Shapes existing session/diagnosis fields into a calm, scannable review summary.
 */
import type { Diagnosis, DiagnosisFollowUp, DiagnosisSuggestedAction } from "./aiDoctorDiagnosisRules";

export type ReviewRiskTone = "neutral" | "info" | "warn" | "danger";

export interface ReviewSummaryViewModel {
  risk: {
    level: string;
    label: string;
    tone: ReviewRiskTone;
  };
  confidencePct: number | null;
  likelyIssue: string | null;
  summary: string | null;
  evidence: string[];
  missingInformation: string[];
  whatNotToDo: string[];
  suggestedActions: DiagnosisSuggestedAction[];
  followUp24h: DiagnosisFollowUp | null;
  recoveryPlan3d: DiagnosisFollowUp | null;
  isHighRisk: boolean;
}

const RISK_TONES: Record<string, ReviewRiskTone> = {
  low: "info",
  medium: "neutral",
  high: "warn",
  critical: "danger",
};

export function riskTone(level: string | null | undefined): ReviewRiskTone {
  if (!level) return "neutral";
  return RISK_TONES[String(level).toLowerCase()] ?? "neutral";
}

export function isHighRiskLevel(level: string | null | undefined): boolean {
  const l = (level ?? "").toLowerCase();
  return l === "high" || l === "critical";
}

export function pctFromUnit(val: number | null | undefined): number | null {
  if (typeof val !== "number" || !Number.isFinite(val)) return null;
  const clamped = Math.max(0, Math.min(1, val));
  return Math.round(clamped * 100);
}

function safeArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v.filter((x) => x != null) : [];
}

function nonEmpty(s: string | null | undefined): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function normalizeFollowUp(f: DiagnosisFollowUp | null | undefined): DiagnosisFollowUp | null {
  if (!f || typeof f !== "object") return null;
  const summary = nonEmpty(f.summary) ?? "";
  const checklist = safeArray(f.checklist).map((s) => String(s));
  if (!summary && checklist.length === 0) return null;
  return { summary, checklist };
}

export function buildReviewSummaryViewModel(input: {
  diagnosis: Diagnosis | null | undefined;
  rawConfidence?: number | null;
  displayedConfidence?: number | null;
  suggestedActions?: DiagnosisSuggestedAction[] | null;
}): ReviewSummaryViewModel {
  const d = input.diagnosis ?? null;
  const level = d?.riskLevel ?? "unknown";
  const confidencePct =
    pctFromUnit(input.displayedConfidence) ??
    pctFromUnit(input.rawConfidence) ??
    pctFromUnit(d?.confidence ?? null);

  const actions =
    safeArray(input.suggestedActions).length > 0
      ? safeArray(input.suggestedActions)
      : safeArray(d?.suggestedActions);

  return {
    risk: {
      level: String(level),
      label: `Risk: ${String(level)}`,
      tone: riskTone(level),
    },
    confidencePct,
    likelyIssue: nonEmpty(d?.likelyIssue ?? null),
    summary: nonEmpty(d?.summary ?? null),
    evidence: safeArray(d?.evidence).map((s) => String(s)),
    missingInformation: safeArray(d?.missingInformation).map((s) => String(s)),
    whatNotToDo: safeArray(d?.whatNotToDo).map((s) => String(s)),
    suggestedActions: actions,
    followUp24h: normalizeFollowUp(d?.followUp24h),
    recoveryPlan3d: normalizeFollowUp(d?.recoveryPlan3d),
    isHighRisk: isHighRiskLevel(level),
  };
}

export const EMPTY_FALLBACKS = {
  likelyIssue: "No likely issue recorded.",
  summary: "No summary recorded.",
  evidence: "No evidence captured for this session.",
  missingInformation: "No missing information flagged.",
  whatNotToDo: "No cautions recorded.",
  suggestedActions: "No suggested actions saved.",
  followUp: "No follow-up guidance recorded.",
} as const;
