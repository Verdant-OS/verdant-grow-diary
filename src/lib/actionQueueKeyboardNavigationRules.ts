/**
 * actionQueueKeyboardNavigationRules — pure helpers for keyboard
 * navigation across visible Action Queue rows. Used by the page to
 * decide where to move focus on ArrowDown / ArrowUp / Home / End.
 *
 * Hard constraints:
 *  - Pure. No I/O, no React, no Supabase, no AI calls.
 *  - NEVER maps a key to Approve, Reject, Retry, Complete, Cancel, or
 *    any status mutation. This module deals only with focus movement
 *    + an explicit `open-drawer` intent for Enter.
 *  - Works against the currently-visible/paginated list only. Callers
 *    pass that list; this module does not reach into global state.
 */

export type ActionQueueNavigationKey =
  | "ArrowDown"
  | "ArrowUp"
  | "Home"
  | "End"
  | "Enter";

export type ActionQueueNavigationIntent =
  | { kind: "focus"; index: number }
  | { kind: "open-drawer"; index: number };

/**
 * Returns true when a key is one the rules module knows how to handle.
 * Callers should use this to decide whether to `preventDefault()`.
 */
export function isActionQueueNavigationKey(
  key: string,
): key is ActionQueueNavigationKey {
  return (
    key === "ArrowDown" ||
    key === "ArrowUp" ||
    key === "Home" ||
    key === "End" ||
    key === "Enter"
  );
}

export interface ResolveActionQueueNavIntentInput {
  /** Currently focused row index within the visible list. */
  currentIndex: number;
  /** Number of currently visible rows. */
  listLength: number;
  /** The key pressed. */
  key: string;
}

/**
 * Pure index calculator. Returns null when the key is not handled or
 * the list is empty. Clamps at boundaries (does NOT wrap) so operators
 * can tell when they reach the first/last visible row.
 */
export function resolveActionQueueNavIntent(
  input: ResolveActionQueueNavIntentInput,
): ActionQueueNavigationIntent | null {
  if (!input) return null;
  const { currentIndex, listLength, key } = input;
  if (!Number.isFinite(listLength) || listLength <= 0) return null;
  const max = listLength - 1;
  const safeCurrent = Math.min(Math.max(0, currentIndex | 0), max);
  switch (key) {
    case "ArrowDown":
      return { kind: "focus", index: Math.min(max, safeCurrent + 1) };
    case "ArrowUp":
      return { kind: "focus", index: Math.max(0, safeCurrent - 1) };
    case "Home":
      return { kind: "focus", index: 0 };
    case "End":
      return { kind: "focus", index: max };
    case "Enter":
      return { kind: "open-drawer", index: safeCurrent };
    default:
      return null;
  }
}
