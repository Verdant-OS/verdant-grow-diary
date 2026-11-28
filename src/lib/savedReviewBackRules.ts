/**
 * Back button on a saved AI Doctor review — pure, deterministic, null-safe.
 *
 * A saved review is often opened from a copied link, a bookmark or a fresh
 * tab. Then there is no earlier Verdant page in this tab, and a plain
 * history back either does nothing or leaves Verdant. So:
 *  1. when the router recorded an earlier in-app entry (index above 0), go
 *     back, so a grower who came from a plant or the Timeline returns there;
 *  2. otherwise open the saved reviews list, which is always a real page.
 *
 * TanStack Router's browser history stamps every entry it pushes with a
 * numeric `__TSR_index`, starting at 0 for the entry the tab opened on.
 */

export const SAVED_REVIEWS_LIST_HREF = "/doctor/sessions" as const;

const ROUTER_HISTORY_INDEX_KEY = "__TSR_index";

export type SavedReviewBackTarget =
  | { kind: "history" }
  | { kind: "link"; to: typeof SAVED_REVIEWS_LIST_HREF };

export function resolveSavedReviewBackTarget(historyState: unknown): SavedReviewBackTarget {
  if (historyState !== null && typeof historyState === "object") {
    const index = (historyState as Record<string, unknown>)[ROUTER_HISTORY_INDEX_KEY];
    if (typeof index === "number" && Number.isInteger(index) && index > 0) {
      return { kind: "history" };
    }
  }
  return { kind: "link", to: SAVED_REVIEWS_LIST_HREF };
}

/** Reads the current history state without throwing outside a browser. */
export function readBrowserHistoryState(): unknown {
  if (typeof window === "undefined") return null;
  try {
    return window.history?.state ?? null;
  } catch {
    return null;
  }
}
