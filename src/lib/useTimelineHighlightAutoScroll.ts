/**
 * useTimelineHighlightAutoScroll — small React hook that auto-scrolls
 * and focuses the highlighted diary-trace entry once per highlight
 * token. Pure-ish: it only reads from `document.getElementById` and
 * calls `scrollIntoView` / `focus`. No I/O, no Supabase, no AI calls.
 *
 * Contract:
 *  - Called with the parsed highlight (or null) and the currently
 *    visible diary entries.
 *  - When a match exists and the token has not yet been scrolled to,
 *    scrolls + focuses, then records the token in a ref.
 *  - Re-renders with the same token are a no-op (no repeated scroll
 *    loops / focus stealing).
 *  - When the token changes / clears, the ref resets so a follow-up
 *    jump re-scrolls.
 */
import { useEffect, useRef } from "react";
import {
  diaryEntryMatchesHighlight,
  type ParsedActionQueueHighlight,
  type DiaryEntryDetailsLike,
} from "@/lib/timelineHighlightRules";

export interface AutoScrollEntryLike extends DiaryEntryDetailsLike {
  id: string;
}

export interface UseTimelineHighlightAutoScrollOptions {
  /** Override for tests / SSR: defaults to `document.getElementById`. */
  getNodeById?: (id: string) => HTMLElement | null;
}

export function useTimelineHighlightAutoScroll(
  highlight: ParsedActionQueueHighlight | null,
  entries: ReadonlyArray<AutoScrollEntryLike>,
  options: UseTimelineHighlightAutoScrollOptions = {},
): void {
  const scrolledTokenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlight) {
      scrolledTokenRef.current = null;
      return;
    }
    if (scrolledTokenRef.current === highlight.idempotencyKey) return;
    const match = entries.find((e) => diaryEntryMatchesHighlight(e, highlight));
    if (!match) return;
    const lookup =
      options.getNodeById ??
      ((id: string) =>
        (typeof document !== "undefined"
          ? document.getElementById(id)
          : null) as HTMLElement | null);
    const node = lookup(`timeline-entry-${match.id}`);
    if (!node) return;
    scrolledTokenRef.current = highlight.idempotencyKey;
    try {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      try {
        node.scrollIntoView();
      } catch {
        // ignore: jsdom may not implement scrollIntoView at all
      }
    }
    try {
      node.focus({ preventScroll: true });
    } catch {
      try {
        node.focus();
      } catch {
        // ignore
      }
    }
  }, [highlight, entries, options.getNodeById]);
}
