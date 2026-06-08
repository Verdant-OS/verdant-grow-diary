/**
 * aiDoctorFollowUpRules — pure, deterministic builder for a cautious
 * 24-hour Follow-Up Check draft after an AI Doctor diagnosis.
 *
 * SCOPE / SAFETY:
 *  - Pure data only. No I/O, no React, no DB, no model calls.
 *  - Suggest-only. Output is a draft for grower memory / preview.
 *  - NEVER emits device commands, automation, MQTT/webhook/relay strings.
 *  - NEVER emits Action Queue items.
 *  - NEVER includes user_id / tokens / service_role / bridge_token.
 *  - Source-honest:
 *      • local/test Environment Check is NOT live telemetry.
 *      • derived VPD is context only.
 *  - Conservative copy when posture is weak/insufficient.
 *  - Idempotency key is built deterministically so callers can detect
 *    duplicate follow-ups for the same diagnosis/evidence snapshot.
 */

import type { DiagnosisEvidenceAlignmentVM } from "./aiDoctorDiagnosisEvidenceAlignmentRules";
import { AGGRESSIVE_CHANGES_GUARDRAIL } from "./aiDoctorDiagnosisEvidenceAlignmentRules";

export const AI_DOCTOR_FOLLOWUP_EVENT_TYPE = "ai_doctor_follow_up" as const;
export const AI_DOCTOR_FOLLOWUP_DEFAULT_HOURS = 24;

export interface AiDoctorFollowUpInputs {
  /** Optional stable diagnosis identifier (preferred idempotency key). */
  diagnosisId?: string | null;
  /** Diagnosis captured/created timestamp (ISO-8601). */
  diagnosisCapturedAt?: string | null;
  /** Plain-text diagnosis summary (already redacted by caller). */
  diagnosisSummary?: string | null;
  /** Plant context. */
  plantId?: string | null;
  plantName?: string | null;
  /** Tent context. */
  tentId?: string | null;
  tentName?: string | null;
  /** Grow context (required for any safe diary-like write path). */
  growId?: string | null;
  /** Evidence-alignment VM produced for this same diagnosis. */
  alignment?: DiagnosisEvidenceAlignmentVM | null;
  /** Required-metric checklist items (subset shown in Evidence Used panel). */
  moreDataNeededLabels?: readonly string[] | null;
  /** Selected Environment Check captured_at (used in idempotency key fallback). */
  envCheckCapturedAt?: string | null;
  /** "Now" injection for deterministic tests. */
  now?: Date | null;
}

export type FollowUpEligibility =
  | { ok: true }
  | { ok: false; reason: FollowUpIneligibleReason };

export type FollowUpIneligibleReason =
  | "missing_diagnosis"
  | "missing_grow_or_plant_or_tent_context";

export const FOLLOWUP_INELIGIBLE_COPY: Record<FollowUpIneligibleReason, string> = {
  missing_diagnosis:
    "No AI Doctor diagnosis available — capture one before scheduling a follow-up.",
  missing_grow_or_plant_or_tent_context:
    "Open this diagnosis from a plant, tent, or grow page to enable a follow-up.",
};

export interface AiDoctorFollowUpDraft {
  /** Stable, redaction-safe idempotency key (no raw uuids in copy). */
  idempotencyKey: string;
  /** Short title used as dialog/diary headline. */
  title: string;
  /** Suggested due time (24h from `now`), ISO-8601. */
  dueAt: string;
  /** Free-text body (presenter renders verbatim). Already redacted. */
  body: string;
  /** Posture surface for the preview. */
  posture: DiagnosisEvidenceAlignmentVM["posture"] | "unknown";
  postureLabel: string;
  /** Bulleted checklist items rendered in the dialog. */
  checklist: readonly string[];
  /** Cautionary line(s) — guardrail for weak/insufficient evidence. */
  guardrails: readonly string[];
  /** Source-honesty lines (local Env Check, derived VPD). */
  sourceNotes: readonly string[];
  /** Plant/tent/grow context echo for the preview (already redacted names). */
  contextLines: readonly string[];
  /** Closest existing safe diary/grow_events event_type. */
  eventType: typeof AI_DOCTOR_FOLLOWUP_EVENT_TYPE;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function nonEmpty(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

function safeIsoNow(now: Date | null | undefined): Date {
  if (now instanceof Date && !Number.isNaN(now.getTime())) return now;
  return new Date();
}

function addHoursIso(now: Date, hours: number): string {
  const d = new Date(now.getTime() + hours * 60 * 60 * 1000);
  return d.toISOString();
}

/** Hash-safe-ish stable key — never embeds raw uuids in visible copy. */
function buildIdempotencyKey(i: AiDoctorFollowUpInputs): string {
  const parts: string[] = [];
  const did = nonEmpty(i.diagnosisId);
  const dca = nonEmpty(i.diagnosisCapturedAt);
  const eca = nonEmpty(i.envCheckCapturedAt);
  const pid = nonEmpty(i.plantId);
  const tid = nonEmpty(i.tentId);
  if (did) parts.push(`d:${did}`);
  else if (dca) parts.push(`dc:${dca}`);
  if (eca) parts.push(`ec:${eca}`);
  if (pid) parts.push(`p:${pid}`);
  else if (tid) parts.push(`t:${tid}`);
  if (parts.length === 0) parts.push("anon");
  return `ai_doctor_follow_up::${parts.join("|")}`;
}

/* -------------------------------------------------------------------------- */
/* Eligibility                                                                */
/* -------------------------------------------------------------------------- */

export function evaluateFollowUpEligibility(
  i: AiDoctorFollowUpInputs | null | undefined,
): FollowUpEligibility {
  if (!i) return { ok: false, reason: "missing_diagnosis" };
  if (!nonEmpty(i.diagnosisSummary) && !nonEmpty(i.diagnosisId) && !nonEmpty(i.diagnosisCapturedAt)) {
    return { ok: false, reason: "missing_diagnosis" };
  }
  if (!nonEmpty(i.growId) && !nonEmpty(i.plantId) && !nonEmpty(i.tentId)) {
    return { ok: false, reason: "missing_grow_or_plant_or_tent_context" };
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Draft builder                                                              */
/* -------------------------------------------------------------------------- */

const BASE_CHECKLIST: readonly string[] = [
  "Recheck plant posture, leaf color, and new growth.",
  "Compare against the previous EcoWitt Environment Check.",
  "Note any change in watering response or soil feel.",
];

export function buildAiDoctorFollowUpDraft(
  i: AiDoctorFollowUpInputs,
): AiDoctorFollowUpDraft {
  const now = safeIsoNow(i.now);
  const dueAt = addHoursIso(now, AI_DOCTOR_FOLLOWUP_DEFAULT_HOURS);

  const alignment = i.alignment ?? null;
  const posture = alignment?.posture ?? "unknown";
  const postureLabel = alignment?.postureLabel ?? "Unknown context";

  const plantName = nonEmpty(i.plantName);
  const tentName = nonEmpty(i.tentName);

  const contextLines: string[] = [];
  if (plantName) contextLines.push(`Plant: ${plantName}`);
  if (tentName) contextLines.push(`Tent: ${tentName}`);
  contextLines.push(`Follow-up due: ${dueAt}`);
  contextLines.push(`Evidence basis: ${postureLabel}`);

  const checklist: string[] = [...BASE_CHECKLIST];
  const missing = Array.isArray(i.moreDataNeededLabels)
    ? i.moreDataNeededLabels.filter((s) => nonEmpty(s)).map((s) => s.trim())
    : [];
  if (missing.length > 0) {
    checklist.push(
      `Capture missing Environment Check metrics: ${missing.join(", ")}.`,
    );
  } else {
    checklist.push(
      "Capture updated temp_f, humidity_pct, vpd_kpa, co2_ppm, soil_moisture_pct if available.",
    );
  }

  const guardrails: string[] = [];
  if (
    alignment?.guardrailWarning ||
    posture === "weak_context" ||
    posture === "insufficient_context"
  ) {
    guardrails.push(alignment?.guardrailWarning ?? AGGRESSIVE_CHANGES_GUARDRAIL);
  }
  if (posture === "insufficient_context") {
    guardrails.push(
      "More data is needed before giving high-confidence guidance — observe only.",
    );
  }

  const sourceNotes: string[] = [];
  if (alignment) {
    for (const b of alignment.basisCopy) sourceNotes.push(b);
  }
  // Always reinforce source honesty when env-check context is present.
  if (alignment?.basisCopy.some((b) => /local EcoWitt/i.test(b))) {
    if (!sourceNotes.some((s) => /not live telemetry/i.test(s))) {
      sourceNotes.push(
        "Local/test EcoWitt Environment Check evidence — not live telemetry.",
      );
    }
  }
  if (alignment?.basisCopy.some((b) => /VPD was used as derived context/i.test(b))) {
    // Already covered by basisCopy; keep dedup behavior.
  }

  const summary = nonEmpty(i.diagnosisSummary) ?? "No diagnosis summary captured.";

  const bodyParts: string[] = [];
  bodyParts.push("24-hour follow-up for AI Doctor check:");
  bodyParts.push("");
  bodyParts.push(`Diagnosis summary: ${summary}`);
  bodyParts.push(`Evidence basis: ${postureLabel}.`);
  bodyParts.push("");
  bodyParts.push("Checklist:");
  for (const c of checklist) bodyParts.push(`- ${c}`);
  if (sourceNotes.length > 0) {
    bodyParts.push("");
    bodyParts.push("Source notes:");
    for (const s of sourceNotes) bodyParts.push(`- ${s}`);
  }
  if (guardrails.length > 0) {
    bodyParts.push("");
    bodyParts.push("Guardrails:");
    for (const g of guardrails) bodyParts.push(`- ${g}`);
  }
  bodyParts.push("");
  bodyParts.push(`Planned recheck: ${dueAt}`);

  return {
    idempotencyKey: buildIdempotencyKey(i),
    title: plantName
      ? `24-hour follow-up — ${plantName}`
      : tentName
        ? `24-hour follow-up — ${tentName}`
        : "24-hour follow-up",
    dueAt,
    body: bodyParts.join("\n"),
    posture,
    postureLabel,
    checklist,
    guardrails,
    sourceNotes,
    contextLines,
    eventType: AI_DOCTOR_FOLLOWUP_EVENT_TYPE,
  };
}

/* -------------------------------------------------------------------------- */
/* Duplicate detection                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Pure check: does any existing follow-up key match the draft's key?
 * Caller provides keys it has already created (in-memory or hydrated).
 */
export function isDuplicateFollowUp(
  draftKey: string | null | undefined,
  existingKeys: readonly string[] | null | undefined,
): boolean {
  const k = nonEmpty(draftKey);
  if (!k) return false;
  if (!Array.isArray(existingKeys) || existingKeys.length === 0) return false;
  return existingKeys.includes(k);
}
