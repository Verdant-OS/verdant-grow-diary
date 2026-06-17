/**
 * Quick Log maturity evidence rules.
 *
 * Pure validation + payload shaping only.
 * No React, no Supabase, no AI, no alerts, no Action Queue, no automation,
 * no device control, and no image analysis.
 */

export const QUICK_LOG_MATURITY_NOTE_LIMIT = 280;

export interface QuickLogMaturityEvidenceFormState {
  clearPct: string;
  cloudyPct: string;
  amberPct: string;
  colorNote: string;
  recessionNote: string;
  swellNote: string;
  aromaNote: string;
  fadeNote: string;
  growerNote: string;
}

export const EMPTY_QUICK_LOG_MATURITY_EVIDENCE_FORM: QuickLogMaturityEvidenceFormState = {
  clearPct: "",
  cloudyPct: "",
  amberPct: "",
  colorNote: "",
  recessionNote: "",
  swellNote: "",
  aromaNote: "",
  fadeNote: "",
  growerNote: "",
};

export type QuickLogMaturityEvidenceReason =
  | "maturity_evidence_requires_plant_target"
  | "invalid_observed_at"
  | "invalid_clear_pct"
  | "invalid_cloudy_pct"
  | "invalid_amber_pct"
  | "maturity_note_too_long";

export interface QuickLogMaturityEvidenceDetails {
  source: "manual";
  evidence_type: "quick_log_maturity_evidence";
  advisory_only: true;
  observed_at: string;
  clear_pct?: number;
  cloudy_pct?: number;
  amber_pct?: number;
  color_note?: string;
  recession_note?: string;
  swell_note?: string;
  aroma_note?: string;
  fade_note?: string;
  grower_note?: string;
}

export type QuickLogMaturityEvidenceEnvelope = {
  maturity_evidence: QuickLogMaturityEvidenceDetails;
};

export type BuildQuickLogMaturityEvidenceResult =
  | { ok: true; details: QuickLogMaturityEvidenceEnvelope | null }
  | { ok: false; reason: QuickLogMaturityEvidenceReason };

export interface BuildQuickLogMaturityEvidenceInput {
  form: QuickLogMaturityEvidenceFormState;
  targetType: "plant" | "tent" | null | undefined;
  observedAt: string | null | undefined;
}

const PERCENT_FIELDS = [
  ["clearPct", "clear_pct", "invalid_clear_pct"],
  ["cloudyPct", "cloudy_pct", "invalid_cloudy_pct"],
  ["amberPct", "amber_pct", "invalid_amber_pct"],
] as const;

const NOTE_FIELDS = [
  ["colorNote", "color_note"],
  ["recessionNote", "recession_note"],
  ["swellNote", "swell_note"],
  ["aromaNote", "aroma_note"],
  ["fadeNote", "fade_note"],
  ["growerNote", "grower_note"],
] as const;

function trim(raw: string | null | undefined): string {
  return (raw ?? "").trim();
}

function parseOptionalPercent(raw: string): number | null | "invalid" {
  const value = trim(raw);
  if (value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return "invalid";
  if (n < 0 || n > 100) return "invalid";
  return n;
}

function normalizeObservedAt(raw: string | null | undefined): string | null {
  const value = trim(raw ?? "");
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return new Date(time).toISOString();
}

export function hasQuickLogMaturityEvidence(
  form: QuickLogMaturityEvidenceFormState,
): boolean {
  return (
    PERCENT_FIELDS.some(([field]) => trim(form[field]) !== "") ||
    NOTE_FIELDS.some(([field]) => trim(form[field]) !== "")
  );
}

export function buildQuickLogMaturityEvidenceDetails(
  input: BuildQuickLogMaturityEvidenceInput,
): BuildQuickLogMaturityEvidenceResult {
  if (!hasQuickLogMaturityEvidence(input.form)) {
    return { ok: true, details: null };
  }

  if (input.targetType !== "plant") {
    return { ok: false, reason: "maturity_evidence_requires_plant_target" };
  }

  const observedAt = normalizeObservedAt(input.observedAt);
  if (!observedAt) {
    return { ok: false, reason: "invalid_observed_at" };
  }

  const details: QuickLogMaturityEvidenceDetails = {
    source: "manual",
    evidence_type: "quick_log_maturity_evidence",
    advisory_only: true,
    observed_at: observedAt,
  };

  for (const [formField, detailsField, reason] of PERCENT_FIELDS) {
    const parsed = parseOptionalPercent(input.form[formField]);
    if (parsed === "invalid") return { ok: false, reason };
    if (parsed !== null) details[detailsField] = parsed;
  }

  for (const [formField, detailsField] of NOTE_FIELDS) {
    const value = trim(input.form[formField]);
    if (value.length > QUICK_LOG_MATURITY_NOTE_LIMIT) {
      return { ok: false, reason: "maturity_note_too_long" };
    }
    if (value !== "") details[detailsField] = value;
  }

  return { ok: true, details: { maturity_evidence: details } };
}

export function quickLogMaturityEvidenceReasonToMessage(
  reason: QuickLogMaturityEvidenceReason,
): string {
  switch (reason) {
    case "maturity_evidence_requires_plant_target":
      return "Maturity evidence must be attached to a plant.";
    case "invalid_clear_pct":
      return "Clear percentage must be between 0 and 100.";
    case "invalid_cloudy_pct":
      return "Cloudy percentage must be between 0 and 100.";
    case "invalid_amber_pct":
      return "Amber percentage must be between 0 and 100.";
    case "maturity_note_too_long":
      return `Maturity notes must be ${QUICK_LOG_MATURITY_NOTE_LIMIT} characters or fewer.`;
    case "invalid_observed_at":
    default:
      return "Maturity observation time is invalid.";
  }
}
