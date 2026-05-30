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

/**
 * Format a review summary view model as plain text suitable for clipboard.
 * Deterministic. No IDs, tokens, or raw payloads — only grower-facing fields.
 */
export function formatDoctorReviewSummaryText(vm: ReviewSummaryViewModel): string {
  const lines: string[] = [];
  lines.push("AI Doctor — Review Summary");
  lines.push(`Risk: ${vm.risk.level}`);
  lines.push(
    vm.confidencePct != null ? `Confidence: ${vm.confidencePct}%` : "Confidence: n/a",
  );
  lines.push("");

  lines.push("Likely issue:");
  lines.push(vm.likelyIssue ?? EMPTY_FALLBACKS.likelyIssue);
  lines.push("");

  lines.push("Summary:");
  lines.push(vm.summary ?? EMPTY_FALLBACKS.summary);
  lines.push("");

  lines.push("Evidence:");
  if (vm.evidence.length === 0) lines.push(EMPTY_FALLBACKS.evidence);
  else for (const e of vm.evidence) lines.push(`- ${e}`);
  lines.push("");

  lines.push("Missing information:");
  if (vm.missingInformation.length === 0) lines.push(EMPTY_FALLBACKS.missingInformation);
  else for (const e of vm.missingInformation) lines.push(`- ${e}`);
  lines.push("");

  lines.push("Suggested actions:");
  if (vm.suggestedActions.length === 0) lines.push(EMPTY_FALLBACKS.suggestedActions);
  else
    for (const a of vm.suggestedActions) {
      lines.push(`- ${a.title}${a.detail ? ` — ${a.detail}` : ""}`);
    }
  lines.push("");

  lines.push("What not to do:");
  if (vm.whatNotToDo.length === 0) lines.push(EMPTY_FALLBACKS.whatNotToDo);
  else for (const e of vm.whatNotToDo) lines.push(`- ${e}`);
  lines.push("");

  lines.push("Follow-up guidance:");
  if (!vm.followUp24h && !vm.recoveryPlan3d) {
    lines.push(EMPTY_FALLBACKS.followUp);
  } else {
    if (vm.followUp24h) {
      lines.push("Next 24 hours:");
      if (vm.followUp24h.summary) lines.push(vm.followUp24h.summary);
      for (const c of vm.followUp24h.checklist) lines.push(`- ${c}`);
    }
    if (vm.recoveryPlan3d) {
      lines.push("3-day recovery:");
      if (vm.recoveryPlan3d.summary) lines.push(vm.recoveryPlan3d.summary);
      for (const c of vm.recoveryPlan3d.checklist) lines.push(`- ${c}`);
    }
  }

  return lines.join("\n").trimEnd();
}

/**
 * Confidence (in percent) at or below which we surface a "review before acting" caution.
 * Calibrated to bias growers toward double-checking before approving any action.
 */
export const LOW_CONFIDENCE_PCT_THRESHOLD = 60;

export const CAUTION_NOTE_TEXT =
  "Review before acting. Double-check plant, tent, sensor, and diary context before approving any action from this saved session.";

export interface CautionNote {
  show: boolean;
  reasons: string[];
  text: string;
}

/**
 * Pure helper: decide whether to surface the "review before acting" caution note
 * for a saved session view model, and explain why.
 */
export function buildCautionNote(vm: ReviewSummaryViewModel): CautionNote {
  const reasons: string[] = [];
  if (vm.isHighRisk) {
    reasons.push(`Elevated risk level: ${vm.risk.level}.`);
  }
  if (vm.confidencePct == null) {
    reasons.push("Confidence is not recorded for this session.");
  } else if (vm.confidencePct <= LOW_CONFIDENCE_PCT_THRESHOLD) {
    reasons.push(`Confidence is low (${vm.confidencePct}%).`);
  }
  if (vm.missingInformation.length > 0) {
    reasons.push("Missing context was flagged for this diagnosis.");
  }
  return {
    show: reasons.length > 0,
    reasons,
    text: CAUTION_NOTE_TEXT,
  };
}


/**
 * Compact caution indicator for an `ai_doctor_sessions` row on the index list.
 * Reuses `buildCautionNote` so the index and detail page agree on what counts
 * as "review before acting".
 *
 * Input shape is intentionally minimal — only the fields the index already
 * fetches — to avoid coupling to the full row type.
 */
export interface SessionRowLike {
  diagnosis: Diagnosis | null | undefined;
  raw_confidence?: number | null;
  displayed_confidence?: number | null;
  suggested_actions?: DiagnosisSuggestedAction[] | null;
  plant_id?: string | null;
  tent_id?: string | null;
  grow_id?: string | null;
}

export interface SessionRowCautionIndicator {
  show: boolean;
  /** Short label safe for a compact badge. */
  label: string;
  /** Longer reason text for tooltip / aria-label. */
  title: string;
}

export const ROW_CAUTION_LABEL = "Review before acting";

export function buildSessionRowCautionIndicator(
  row: SessionRowLike,
): SessionRowCautionIndicator {
  const vm = buildReviewSummaryViewModel({
    diagnosis: row.diagnosis ?? null,
    rawConfidence: row.raw_confidence ?? null,
    displayedConfidence: row.displayed_confidence ?? null,
    suggestedActions: row.suggested_actions ?? null,
  });
  const note = buildCautionNote(vm);
  return {
    show: note.show,
    label: ROW_CAUTION_LABEL,
    title: note.reasons.join(" ") || note.text,
  };
}

export const LIMITED_CONTEXT_LABEL = "Limited context";
export const LIMITED_CONTEXT_TITLE =
  "Evidence and grow/plant/tent context were sparse for this session.";

/**
 * A session is "limited context" when it lacks both linked grow context AND
 * captured diagnostic evidence. Used for a calm fallback indicator on the
 * index list.
 */
export function isSessionLimitedContext(row: SessionRowLike): boolean {
  const evidence = Array.isArray(row.diagnosis?.evidence)
    ? row.diagnosis!.evidence.filter((s) => typeof s === "string" && s.trim().length > 0)
    : [];
  const hasAnyContext =
    !!row.plant_id || !!row.tent_id || !!row.grow_id || evidence.length > 0;
  return !hasAnyContext;
}
