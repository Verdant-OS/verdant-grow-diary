/**
 * quickLogPreviewRules — pure helper that evaluates a draft QuickLog form
 * state for obvious data quality issues before save, using the same
 * normalization rules that the Timeline uses after save.
 *
 * Pure & deterministic. No React. No Supabase. Warning messages are short
 * and never echo raw user-entered values.
 */

import { normalizeDiaryEntry } from "./diaryEntryRules";

export interface QuickLogDraftDetails {
  ph?: string;
  ec?: string;
  runoff?: string;
  watering?: string;
  nutrients?: string;
  training?: string;
}

export interface QuickLogDraft {
  note?: string;
  eventType?: string;
  stage?: string;
  remindAt?: string;
  details?: QuickLogDraftDetails;
}

export type QuickLogPreviewSeverity = "info" | "warning";

export interface QuickLogPreviewWarning {
  code: string;
  message: string;
  severity: QuickLogPreviewSeverity;
}

export interface QuickLogPreviewResult {
  warnings: QuickLogPreviewWarning[];
  hasIssues: boolean;
  /** Warnings produced by the shared normalizer when the draft is run
   * through diaryEntryRules — verifies Timeline-compatibility. */
  normalizedWarnings: string[];
}

function isBlank(v: string | undefined | null): boolean {
  return !v || !String(v).trim();
}

function num(v: string | undefined | null): number | null {
  if (isBlank(v)) return null;
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

export function evaluateQuickLogPreview(
  draft: QuickLogDraft | null | undefined,
): QuickLogPreviewResult {
  const warnings: QuickLogPreviewWarning[] = [];
  const d: QuickLogDraftDetails = draft?.details ?? {};
  const push = (
    code: string,
    message: string,
    severity: QuickLogPreviewSeverity = "warning",
  ) => warnings.push({ code, message, severity });

  if (isBlank(draft?.note)) {
    push("note:missing", "Add a quick note before saving.", "info");
  }

  if (!isBlank(d.ph)) {
    const n = num(d.ph);
    if (n == null) push("ph:invalid", "pH is not a number.");
    else if (n < 0 || n > 14) push("ph:out-of-range", "pH must be between 0 and 14.");
  }

  if (!isBlank(d.ec)) {
    const n = num(d.ec);
    if (n == null) {
      push("ec:invalid", "EC / PPM is not a number.");
    } else if (n < 0) {
      push("ec:out-of-range", "EC / PPM must be positive.");
    } else if (n > 10 && n <= 10000) {
      // Value looks like PPM/TDS rather than EC — informational only.
      push("ec:looks-like-tds", "Value looks like PPM/TDS, not EC.", "info");
    } else if (n > 10000) {
      push("ec:out-of-range", "EC / PPM value is too high.");
    }
  }

  if (!isBlank(d.watering)) {
    const n = num(d.watering);
    if (n == null) push("watering:invalid", "Watering amount is not a number.");
    else if (n < 0 || n > 1_000_000) {
      push("watering:out-of-range", "Watering amount is out of range.");
    }
  }

  if (!isBlank(d.runoff)) {
    const n = num(d.runoff);
    if (n == null) push("runoff:invalid", "Runoff value is not a number.");
  }

  if (draft?.eventType === "reminder") {
    if (isBlank(draft.remindAt)) {
      push("remind-at:missing", "Reminder time is missing.");
    } else if (!Number.isFinite(Date.parse(String(draft.remindAt)))) {
      push("remind-at:invalid", "Reminder time is invalid.");
    }
  }

  // Run draft through the shared Timeline normalizer to confirm
  // QuickLog output stays compatible with downstream rules.
  const tempRaw = {
    id: "preview",
    entry_at: new Date().toISOString(),
    entry_type: draft?.eventType ?? "note",
    stage: draft?.stage ?? null,
    note: draft?.note ?? "",
    details: {
      ph: isBlank(d.ph) ? undefined : d.ph,
      ec: isBlank(d.ec) ? undefined : d.ec,
      runoff_ec: isBlank(d.runoff) ? undefined : d.runoff,
      watering_amount_ml: isBlank(d.watering) ? undefined : d.watering,
      remind_at: isBlank(draft?.remindAt) ? undefined : draft?.remindAt,
    },
  };
  const normalized = normalizeDiaryEntry(tempRaw, {});
  const normalizedWarnings = normalized ? normalized.warnings.slice() : [];

  return {
    warnings,
    hasIssues: warnings.some((w) => w.severity === "warning"),
    normalizedWarnings,
  };
}
