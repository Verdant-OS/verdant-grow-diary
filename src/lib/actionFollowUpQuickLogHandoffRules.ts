/**
 * actionFollowUpQuickLogHandoffRules — pure helpers that build the
 * Quick Log prefill payload and safe internal return path used by the
 * Action Queue follow-up "Add a new photo in Quick Log" handoff.
 *
 * SAFETY:
 *  - Pure. No I/O, no React, no Supabase, no crypto side effects.
 *  - No uploader, no storage contract, no signed-URL construction.
 *  - Return-path allowlist is restricted to `/actions/:actionId` —
 *    external, protocol-relative, malformed, or unrelated paths are
 *    rejected.
 *  - Prefill only carries grow/tent/plant context and a source label.
 *    It never carries evidence, action outcomes, or write payloads.
 *  - Quick Log itself remains the sole owner of the new diary-photo
 *    write; this helper only opens the modal.
 */

export const ACTION_FOLLOWUP_QUICKLOG_SOURCE = "action-followup" as const;
export const ACTION_FOLLOWUP_QUICKLOG_EVENT = "verdant:open-quicklog" as const;

/** Only single-segment UUID-shaped action IDs are permitted in the
 *  return path. Kept intentionally permissive-enough for hex UUIDs
 *  while forbidding path traversal, query strings, or fragments. */
const SAFE_ACTION_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export interface ActionFollowUpQuickLogHandoffInput {
  actionId: string;
  growId: string;
  tentId: string | null;
  plantId: string | null;
}

export interface ActionFollowUpQuickLogPrefill {
  growId: string;
  tentId: string | null;
  plantId: string | null;
  eventType: "photo";
  suggestSnapshot: false;
  source: typeof ACTION_FOLLOWUP_QUICKLOG_SOURCE;
  /** Grower-facing note seed. The grower reviews/edits before saving. */
  note: string;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Build the deterministic Quick Log prefill for the follow-up
 * handoff. Returns `null` when the mandatory grow/action context is
 * missing — callers must treat null as "cannot open handoff" and hide
 * the CTA (or render a calm fallback).
 */
export function buildActionFollowUpQuickLogPrefill(
  input: ActionFollowUpQuickLogHandoffInput | null | undefined,
): ActionFollowUpQuickLogPrefill | null {
  if (!input) return null;
  if (!isNonEmptyString(input.actionId)) return null;
  if (!isNonEmptyString(input.growId)) return null;
  return {
    growId: input.growId,
    tentId: isNonEmptyString(input.tentId) ? input.tentId : null,
    plantId: isNonEmptyString(input.plantId) ? input.plantId : null,
    eventType: "photo",
    suggestSnapshot: false,
    source: ACTION_FOLLOWUP_QUICKLOG_SOURCE,
    note: "Photo for action follow-up. Save it here, then return to the action to select it.",
  };
}

/**
 * Returns true only for safe internal Action Detail return paths of
 * the exact form `/actions/<safe-action-id>`. Rejects protocol URLs,
 * schema-relative URLs (`//host`), traversal, control chars, query
 * strings, fragments, and unrelated app routes.
 */
export function isSafeActionFollowUpReturnPath(candidate: unknown): candidate is string {
  if (typeof candidate !== "string") return false;
  if (candidate.length === 0 || candidate.length > 200) return false;
  // eslint-disable-next-line no-control-regex -- intentional control-char reject
  if (/[\u0000-\u001F\u007F]/.test(candidate)) return false;
  if (candidate.startsWith("//")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(candidate)) return false;
  const match = candidate.match(/^\/actions\/([^/?#]+)$/);
  if (!match) return false;
  return SAFE_ACTION_ID.test(match[1]);
}

/**
 * Build the safe internal return path for the given action id.
 * Returns `null` if the action id would produce an unsafe path.
 */
export function buildActionFollowUpReturnPath(actionId: string | null | undefined): string | null {
  if (!isNonEmptyString(actionId)) return null;
  if (!SAFE_ACTION_ID.test(actionId)) return null;
  const path = `/actions/${actionId}`;
  return isSafeActionFollowUpReturnPath(path) ? path : null;
}

export const ACTION_FOLLOWUP_QUICKLOG_CTA_LABEL = "Add a new photo in Quick Log" as const;
export const ACTION_FOLLOWUP_QUICKLOG_CTA_HELP =
  "Save the photo in Quick Log, then return here to select it." as const;
