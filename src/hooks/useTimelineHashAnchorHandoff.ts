import { useEffect, useRef } from "react";
import { isReducedMotionPreferred } from "@/lib/useTimelineHighlightAutoScroll";

const TIMELINE_ENTRY_ANCHOR_PREFIX = "timeline-entry-";

export interface TimelineHashAnchorHandoffOptions {
  /** Override for tests / SSR. Defaults to `document.getElementById`. */
  getNodeById?: (id: string) => HTMLElement | null;
  /** Override for tests / SSR. Defaults to the grower's media preference. */
  prefersReducedMotion?: boolean;
}

/** Accept only Timeline entry fragments; unrelated page hashes are ignored. */
export function parseTimelineEntryAnchorHash(hash: string | null | undefined): string | null {
  if (typeof hash !== "string") return null;
  const encoded = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!encoded) return null;

  let anchorId: string;
  try {
    anchorId = decodeURIComponent(encoded);
  } catch {
    return null;
  }

  const entryId = anchorId.slice(TIMELINE_ENTRY_ANCHOR_PREFIX.length);
  if (
    !anchorId.startsWith(TIMELINE_ENTRY_ANCHOR_PREFIX) ||
    !entryId ||
    entryId !== entryId.trim()
  ) {
    return null;
  }
  return anchorId;
}

/**
 * Completes a browser hash handoff after Timeline's async rows have mounted.
 * The destination is handled at most once per fragment and no timers or
 * observers survive the effect.
 */
export function useTimelineHashAnchorHandoff(
  hash: string | null | undefined,
  ready: boolean,
  options: TimelineHashAnchorHandoffOptions = {},
): void {
  const handledAnchorRef = useRef<string | null>(null);

  useEffect(() => {
    const anchorId = parseTimelineEntryAnchorHash(hash);
    if (!anchorId) {
      handledAnchorRef.current = null;
      return;
    }
    if (!ready || handledAnchorRef.current === anchorId) return;

    const lookup =
      options.getNodeById ??
      ((id: string) => (typeof document !== "undefined" ? document.getElementById(id) : null));
    const node = lookup(anchorId);
    if (!node) return;

    handledAnchorRef.current = anchorId;
    if (!node.hasAttribute("tabindex")) node.tabIndex = -1;

    const reducedMotion = options.prefersReducedMotion ?? isReducedMotionPreferred();
    if (typeof node.scrollIntoView === "function") {
      try {
        node.scrollIntoView({
          behavior: reducedMotion ? "auto" : "smooth",
          block: "start",
        });
      } catch {
        try {
          node.scrollIntoView();
        } catch {
          // Presentation-only fallback; focus still identifies the destination.
        }
      }
    }

    try {
      node.focus({ preventScroll: true });
    } catch {
      try {
        node.focus();
      } catch {
        // A failed focus must not turn a read-only navigation aid into an error.
      }
    }
  }, [hash, ready, options.getNodeById, options.prefersReducedMotion]);
}
