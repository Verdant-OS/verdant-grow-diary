/**
 * diaryEntryRemovalFollowUpRules — pure helpers + copy constants for the
 * "Add to correct plant" follow-up shown after a successful single-entry
 * diary/photo log removal.
 *
 * Pure, deterministic, null-safe. No React, no Supabase, no AI.
 *
 * Why this exists:
 *   - The original entry was hard-deleted, so the follow-up must NOT
 *     pretend the evidence was moved.
 *   - It must NOT preselect the source plant. The operator must choose
 *     the correct plant in Quick Log.
 *   - Tent/grow context may be preselected so the operator stays in
 *     scope. Plant choice stays explicit.
 */

export const FOLLOW_UP_BUTTON_LABEL = "Add to correct plant";
export const FOLLOW_UP_HELPER_COPY =
  "Open Quick Log and choose the correct plant for this entry.";
export const FOLLOW_UP_ACCESSIBLE_LABEL =
  "Add corrected Quick Log to the correct plant";
export const FOLLOW_UP_NOTE_PREFILL =
  "Re-entering log after removing it from the wrong plant.";

/** Event name reused from the existing Quick Log handoff. */
export const CORRECTED_QUICKLOG_EVENT = "verdant:open-quicklog" as const;

export interface CorrectedQuickLogHandoffContext {
  tentId?: string | null;
  tentName?: string | null;
  growId?: string | null;
  /** Optional draft note text. Trimmed; empty becomes undefined. */
  note?: string | null;
}

/**
 * Payload shape dispatched to the existing Quick Log listener. Plant id
 * and plant name are deliberately absent: the operator MUST pick the
 * correct plant before saving.
 */
export interface CorrectedQuickLogHandoffPayload {
  tentId?: string;
  tentName?: string;
  growId?: string;
  eventType: "observation";
  suggestSnapshot: true;
  note?: string;
}

function safeString(v: string | null | undefined): string | undefined {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Build a Quick Log handoff payload that requires the operator to choose
 * the plant. Source plant id/name are intentionally never included.
 */
export function buildCorrectedQuickLogHandoff(
  context: CorrectedQuickLogHandoffContext | null | undefined,
): CorrectedQuickLogHandoffPayload {
  const ctx = context ?? {};
  const payload: CorrectedQuickLogHandoffPayload = {
    eventType: "observation",
    suggestSnapshot: true,
  };
  const tentId = safeString(ctx.tentId);
  const tentName = safeString(ctx.tentName);
  const growId = safeString(ctx.growId);
  const note = safeString(ctx.note);
  if (tentId) payload.tentId = tentId;
  if (tentName) payload.tentName = tentName;
  if (growId) payload.growId = growId;
  if (note) payload.note = note;
  return payload;
}

export interface DispatchTarget {
  dispatchEvent: (event: Event) => boolean;
}

/**
 * Dispatch the corrected Quick Log handoff on the provided target
 * (defaults to window when available). Returns the payload that was
 * sent so callers/tests can assert it deterministically. Safe to call
 * in SSR/test contexts that lack `window`.
 */
export function dispatchCorrectedQuickLogHandoff(
  context: CorrectedQuickLogHandoffContext | null | undefined,
  target?: DispatchTarget | null,
): CorrectedQuickLogHandoffPayload {
  const payload = buildCorrectedQuickLogHandoff(context);
  const resolved =
    target ?? (typeof window !== "undefined" ? (window as DispatchTarget) : null);
  if (resolved && typeof CustomEvent !== "undefined") {
    resolved.dispatchEvent(
      new CustomEvent(CORRECTED_QUICKLOG_EVENT, { detail: payload }),
    );
  }
  return payload;
}
