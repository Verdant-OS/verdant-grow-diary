/**
 * aiDoctorCheckInEventBadge — pure presenter helper that decides whether
 * a diary/timeline event was saved from an AI Doctor Check-In preview.
 *
 * Display-only. No I/O, no Supabase, no RPC, no model calls, no Action
 * Queue, no alerts, no writes. Safe against malformed `details` blobs.
 */

export const AI_DOCTOR_CHECK_IN_KIND = "ai_doctor_check_in" as const;
export const AI_DOCTOR_CHECK_IN_BADGE_LABEL = "AI Doctor check-in" as const;
export const AI_DOCTOR_CHECK_IN_BADGE_ARIA_LABEL =
  "Saved from AI Doctor check-in preview" as const;

/**
 * Loose shape — we deliberately do not import a domain type so this
 * helper stays usable from raw rows, normalized entries, and view-model
 * items alike. Anything outside `details.kind === AI_DOCTOR_CHECK_IN_KIND`
 * returns false.
 */
export interface AiDoctorCheckInEventLike {
  details?: unknown;
}

function readKind(details: unknown): string | null {
  if (details == null || typeof details !== "object") return null;
  const k = (details as Record<string, unknown>).kind;
  return typeof k === "string" ? k : null;
}

export function isAiDoctorCheckInEvent(
  event: AiDoctorCheckInEventLike | null | undefined,
): boolean {
  if (!event || typeof event !== "object") return false;
  return readKind((event as { details?: unknown }).details) ===
    AI_DOCTOR_CHECK_IN_KIND;
}
