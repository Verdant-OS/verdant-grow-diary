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
