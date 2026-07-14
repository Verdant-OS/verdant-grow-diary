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

// -------------------------------------------------------------------
// Unified post-save + error copy shared by QuickLogV2Sheet and the
// legacy QuickLog dialog so both paths render identical CTAs and
// failure guidance. Presenters must import these constants — never
// hardcode duplicate strings.
// -------------------------------------------------------------------

export const QUICK_LOG_POST_SAVE_TITLE = "Saved" as const;

/**
 * Practical, non-technical retry guidance. Renders in the dedicated
 * error area. Draft values remain in place after a failure — this
 * string states that plainly so the grower knows they can retry.
 */
export const QUICK_LOG_SAVE_FAILED_MESSAGE =
  "Save failed. Your draft is still here. Check your connection and try again." as const;

export interface QuickLogPostSaveDescriptionInput {
  /** Human-readable name of the target plant / tent (already trimmed). */
  targetName: string | null;
  /** Optional tent name to append when the target is a plant. */
  tentName?: string | null;
  /** Optional grow name to append after tent name. */
  growName?: string | null;
  /** Free-text action verb (e.g. "note", "feeding", "watering"). */
  action: string | null;
  /** Was a photo saved alongside the log? */
  photoAttached: boolean;
}

/**
 * Build the description line shown under the "Saved" title in the
 * post-save card. Deterministic. Never claims yield / quality /
 * diagnosis — just confirms what persisted and where.
 */
export function buildQuickLogPostSaveDescription(
  input: QuickLogPostSaveDescriptionInput,
): string {
  const verb = (input.action ?? "").trim() || "entry";
  const withPhoto = input.photoAttached ? " with photo" : "";
  const target = (input.targetName ?? "").trim();
  const scopeParts: string[] = [];
  if (target) scopeParts.push(target);
  const tent = (input.tentName ?? "").trim();
  if (tent) scopeParts.push(tent);
  const grow = (input.growName ?? "").trim();
  if (grow) scopeParts.push(grow);
  const scope = scopeParts.length ? ` to ${scopeParts.join(" · ")}` : "";
  return `Logged ${verb}${withPhoto}${scope} · just now`;
}

export interface QuickLogCloseGuardInput {
  /** True while any Quick Log save (form / photo diary) is in-flight. */
  saving: boolean;
  /** Additional sync in-flight indicator (ref-based). */
  inFlight: boolean;
}

/**
 * True when Cancel/Close/Escape/backdrop should be blocked because a
 * save is currently in flight. The presenter is responsible for the
 * ARIA disabled state + explanation.
 */
export function shouldBlockQuickLogClose(input: QuickLogCloseGuardInput): boolean {
  return Boolean(input.saving || input.inFlight);
}

export const QUICK_LOG_CLOSE_BLOCKED_HINT =
  "Save in progress — wait for it to finish before closing." as const;
