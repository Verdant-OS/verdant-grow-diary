/**
 * Pure helpers for the Coach page's optional alert-context prefill
 * (`/doctor?alertId=...`, sent by alert surfaces such as the Plant Detail
 * assigned-tent alerts panel).
 *
 * The prefill only composes a starting question from fields already stored
 * on the grower's own alert row (title + reason). The grower reviews and
 * edits it before explicitly pressing Ask — nothing here fires an AI call,
 * spends credits, or writes anything.
 *
 * No React, no Supabase, no I/O. Safe to unit-test in isolation.
 */

export const COACH_ALERT_ID_PARAM = "alertId";

/**
 * Same id grammar the Action Queue back-pointer tokens use
 * (`[alert:<id>]` in actionQueueProvenanceRules): 1-64 chars of
 * [A-Za-z0-9_-]. UUIDs pass. Anything else is rejected so an arbitrary
 * query-string value is never forwarded into a DB lookup.
 */
const ALERT_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeCoachAlertIdParam(
  raw: string | null | undefined,
): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return ALERT_ID_RE.test(trimmed) ? trimmed : null;
}

export interface CoachAlertPrefillInput {
  title: string | null | undefined;
  reason: string | null | undefined;
}

/**
 * Compose the prefill question, or null when the alert has no usable
 * title. The copy is deliberately a question the grower finishes asking —
 * it promises no diagnosis and states no certainty.
 */
export function buildCoachAlertPrefillQuestion(
  input: CoachAlertPrefillInput,
): string | null {
  const title =
    typeof input.title === "string" ? input.title.trim().replace(/\.+$/, "") : "";
  if (!title) return null;
  const reason =
    typeof input.reason === "string"
      ? input.reason.trim().replace(/\.+$/, "")
      : "";
  const reasonPart = reason ? ` ${reason}.` : "";
  return `Open alert: ${title}.${reasonPart} What should I check first?`;
}

function stripTokensOfKind(reason: string, kind: "alert" | "session"): string {
  return reason
    .replace(new RegExp(`\\s*\\[${kind}:[^\\]]*\\]`, "g"), " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Make the trusted `[alert:<id>]` back-pointer token authoritative on an
 * action_queue reason, using the exact grammar `actionQueueProvenanceRules`
 * extracts and the same inline format the environment-alert writer uses
 * (`alertToActionQueueRules`).
 *
 * SPOOF GUARD: the base reason is model-derived text, which could echo or
 * forge a valid-looking token — and the extractors return the FIRST match,
 * so a forged earlier token would win. Any pre-existing alert tokens are
 * therefore ALWAYS stripped (even when no trusted id is available), and
 * the validated id, when present, is appended as the only alert token.
 * Tokens are display-stripped everywhere via `stripBackPointerTokens`, so
 * they never reach grower-facing copy.
 */
export function appendAlertBackPointerToken(
  reason: string,
  alertId: string | null | undefined,
): string {
  const cleaned = stripTokensOfKind(reason, "alert");
  const id = normalizeCoachAlertIdParam(alertId ?? null);
  if (!id) return cleaned;
  const token = `[alert:${id}]`;
  return cleaned.length > 0 ? `${cleaned} ${token}` : token;
}

/**
 * Same authoritative-append discipline for the `[session:<id>]` token
 * (byte-identical format to the session-detail writer in
 * aiDoctorSessionToActionQueueRules, which its dedupe keys on). Existing
 * session tokens in the model-derived base are always stripped first —
 * including when no trusted id is available — so read surfaces can never
 * treat echoed model output as internal linkage metadata. With BOTH tokens
 * on a queued suggestion, every prepared read surface lights up: the
 * Alerts-index linked-action badge, AlertDetail's saved-session back-link
 * (which extracts the session id from alert-matched rows), and the session
 * detail's linked-alert section (which extracts the alert id from
 * session-matched rows). Extractors are order-independent.
 */
export function appendSessionBackPointerToken(
  reason: string,
  sessionId: string | null | undefined,
): string {
  const cleaned = stripTokensOfKind(reason, "session");
  const id = normalizeCoachAlertIdParam(sessionId ?? null);
  if (!id) return cleaned;
  const token = `[session:${id}]`;
  return cleaned.length > 0 ? `${cleaned} ${token}` : token;
}
