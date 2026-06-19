/**
 * photoEventNonDiagnosticLabelRules — pure helpers that decide whether a
 * timeline photo event should be clearly labeled as a visual record with
 * no AI analysis attached.
 *
 * Why: photo events appearing near AI Doctor sessions can be misread as
 * "analyzed" or "diagnosed". Verdant labels photos honestly so growers
 * never assume a diagnosis happened when one did not.
 *
 * Pure, deterministic, no React, no Supabase, no AI calls. Side-effect
 * free: invoking these helpers never triggers diagnosis or model calls.
 *
 * Forward-compatible detection: today no diary column links an entry to
 * an AI Doctor session/result, so this helper checks well-known optional
 * fields on `details` so a future link does not regress copy. When such a
 * link is present, the label is suppressed (req 4 — no contradictory copy).
 */

export const PHOTO_NON_DIAGNOSTIC_LABEL = "Visual record · no AI analysis";

export const PHOTO_NON_DIAGNOSTIC_TESTID = "photo-event-non-diagnostic-label";

/** Banned wording — must never appear in the non-diagnostic label copy. */
const BANNED_DIAGNOSTIC_WORDS = [
  "confirmed",
  "verified",
  "diagnosed",
  "analyzed",
  "certain",
  "guaranteed",
] as const;

/**
 * Returns true when the entry's details object signals a saved AI Doctor
 * link. Unknown / missing details → false. Defensive against non-object
 * input.
 */
export function hasLinkedAiDoctorResult(details: unknown): boolean {
  if (!details || typeof details !== "object") return false;
  const d = details as Record<string, unknown>;
  const candidates = [
    d.ai_doctor_session_id,
    d.aiDoctorSessionId,
    d.ai_doctor_result_id,
    d.aiDoctorResultId,
  ];
  return candidates.some(
    (v) => typeof v === "string" && v.trim().length > 0,
  );
}

export interface PhotoNonDiagnosticLabelInput {
  hasPhoto: boolean;
  details: unknown;
}

/**
 * Decide whether to render the non-diagnostic label for a timeline entry.
 *
 *   - hasPhoto false                 → false (no photo, no label needed)
 *   - linked to AI Doctor result     → false (req 4 — no duplicate/contradictory copy)
 *   - otherwise (photo present, no link) → true
 */
export function shouldShowPhotoNonDiagnosticLabel(
  input: PhotoNonDiagnosticLabelInput,
): boolean {
  if (!input.hasPhoto) return false;
  if (hasLinkedAiDoctorResult(input.details)) return false;
  return true;
}

/**
 * Returns the canonical label string. Centralized so future copy
 * variations cannot drift into banned wording. Asserted by tests.
 */
export function getPhotoNonDiagnosticLabel(): string {
  return PHOTO_NON_DIAGNOSTIC_LABEL;
}

/**
 * Test-friendly guard: returns true when a candidate label contains any
 * banned diagnostic word. Used by static label tests.
 */
export function containsBannedDiagnosticWording(label: string): boolean {
  const lower = label.toLowerCase();
  return BANNED_DIAGNOSTIC_WORDS.some((w) => lower.includes(w));
}
