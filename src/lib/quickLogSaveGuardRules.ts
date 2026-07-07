/**
 * quickLogSaveGuardRules — pure helpers for Quick Log save
 * idempotency + post-save clarity.
 *
 * Pure. No React. No I/O. No Supabase. No AI. No Action Queue.
 *
 * Responsibilities:
 *  - Represent post-save "success" state so the UI can offer clear
 *    next actions (view timeline / log another / close) instead of
 *    leaving the form in a stale interactable state.
 *  - Provide a client-side idempotency-key rotation strategy so that
 *    "Log another" starts a fresh save cycle and a stale saved
 *    summary is never reused across a new action.
 *  - Provide a deterministic in-flight guard shape so rapid double
 *    clicks cannot submit twice before React has flipped `saving`.
 *
 * These helpers deliberately do NOT talk to the network. Server-side
 * dedupe (if any) lives in the RPC / edge layer and is out of scope
 * for this slice.
 */

export interface QuickLogPostSaveSuccess {
  /** Growth event id returned from the server, when available. */
  growEventId: string | null;
  /** Target the log was attached to. Used for the "View" CTA. */
  targetType: "plant" | "tent";
  targetId: string;
  tentId: string | null;
  /** Action that was just saved (e.g. "note", "water", "feed"). */
  action: string;
  /** Human-friendly confirmation copy. */
  message: string;
  /** ISO timestamp the save succeeded. Used for debug + telemetry. */
  savedAt: string;
}

export const QUICK_LOG_POST_SAVE_VIEW_LABEL = "View timeline" as const;
export const QUICK_LOG_POST_SAVE_ANOTHER_LABEL = "Log another" as const;
export const QUICK_LOG_POST_SAVE_CLOSE_LABEL = "Close" as const;

/**
 * Rotate the client-side idempotency counter. Called when the grower
 * hits "Log another" so the next save is treated as a distinct
 * submission (never reuses the previous saved summary).
 *
 * Deterministic given the previous value — no `Date.now()`, no random.
 */
export function rotateQuickLogIdempotencyKey(prev: number): number {
  if (!Number.isFinite(prev) || prev < 0) return 1;
  // Monotonic; wraps well before Number.MAX_SAFE_INTEGER in any
  // realistic session (a grower would need billions of saves).
  return prev + 1;
}

export interface QuickLogSaveGuardInput {
  /** True while a save is in-flight per React state. */
  saving: boolean;
  /** True when a synchronous in-flight ref has been claimed. */
  inFlight: boolean;
  /** True when a post-save success card is currently shown. */
  postSaveShown: boolean;
}

/**
 * Decide whether a Save invocation should be allowed to proceed.
 * The UI must ALSO disable the Save button, but this guard protects
 * against the race where a rapid double-click fires before React has
 * repainted with `saving=true`.
 */
export function shouldAllowQuickLogSave(input: QuickLogSaveGuardInput): boolean {
  if (input.saving) return false;
  if (input.inFlight) return false;
  if (input.postSaveShown) return false;
  return true;
}

/**
 * Build the confirmation message shown in the post-save card. Never
 * claims yield/quality/certainty; just confirms the log persisted.
 */
export function buildQuickLogPostSaveMessage(action: string, photoAttached: boolean): string {
  const base = photoAttached ? "Log and photo saved" : "Log saved";
  if (!action) return base;
  return `${base} — ${action}`;
}
