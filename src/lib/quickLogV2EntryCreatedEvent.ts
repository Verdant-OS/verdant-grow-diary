/**
 * quickLogV2EntryCreatedEvent — tiny helper that dispatches the
 * `verdant:entry-created` window event after a successful Quick Log v2
 * save. Timeline.tsx already listens for this event and triggers its
 * local `load()`; dispatching here is what makes a v2 save visible to
 * the local-state Timeline page without a manual refresh.
 *
 * Side-effect surface is intentionally tiny:
 *   - One window.dispatchEvent call per invocation.
 *   - No Supabase, no react-query, no AI, no device control.
 *   - Safe to no-op when `window` is undefined (SSR / test sandbox).
 *
 * Callers MUST invoke this only after the save has resolved successfully
 * — never on validation failure, never on network failure, never twice
 * for one save.
 */

export const QUICK_LOG_V2_ENTRY_CREATED_EVENT = "verdant:entry-created" as const;

export interface QuickLogV2EntryCreatedDetail {
  /** ISO timestamp the dispatcher observed at success time. */
  createdAt: string;
  /** Saved grow_events row id when the save returned one; null otherwise. */
  growEventId: string | null;
  /** Sub-source so listeners can distinguish v2 branches if useful. */
  source: "quick_log_v2" | "quick_log_v2_feed";
}

export function dispatchQuickLogV2EntryCreated(
  detail: QuickLogV2EntryCreatedDetail,
): boolean {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") {
    return false;
  }
  window.dispatchEvent(
    new CustomEvent(QUICK_LOG_V2_ENTRY_CREATED_EVENT, { detail }),
  );
  return true;
}
