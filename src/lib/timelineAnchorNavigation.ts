/**
 * timelineAnchorNavigation — small UI helper for "View in Timeline".
 *
 * Hard constraints:
 *  - No fetch. No writes. No router state mutation beyond what the
 *    caller already does. No polling.
 *  - Pure routing logic is delegated to `quickLogTimelineNavigationTarget`.
 *  - This helper only decides: same-page scroll vs. cross-page navigate.
 *  - For same-page, it scrolls the timeline entry/section into view.
 *    If the element does not yet exist (refetch still resolving), it
 *    performs ONE retry after a short, bounded delay; otherwise it
 *    falls back to setting `location.hash` so the browser handles it.
 */

export interface TimelineAnchorTarget {
  /** Route path, e.g. `/plants/<id>`. */
  path: string;
  /** Fragment without leading `#`. Prefer `timeline-entry-<id>`, else `timeline`. */
  hash: string;
  /** Convenience `path + "#" + hash`. */
  href: string;
}

export interface NavigateToTimelineDeps {
  /** Router push when we need to leave the current page. */
  navigate?: ((to: string) => void) | null;
  /** Current pathname (defaults to `window.location.pathname`). */
  currentPath?: string | null;
  /** Optional retry delay in ms; defaults to 120ms. Set 0 to disable. */
  retryDelayMs?: number;
  /**
   * Setter for `window.location.assign` style hard-nav fallback used
   * when no router context is available. Defaults to the real DOM.
   */
  assign?: ((href: string) => void) | null;
}

/**
 * Determine whether the user is already on the target page.
 * Compares pathnames only (ignores hash/search).
 */
export function isSameTimelinePage(
  target: Pick<TimelineAnchorTarget, "path">,
  currentPath: string | null | undefined,
): boolean {
  if (!target?.path) return false;
  if (currentPath == null) return false;
  return currentPath === target.path;
}

/**
 * Scroll the timeline anchor into view if it exists. Returns true on
 * success, false if the element is not present (caller may retry or
 * fall back to setting the hash).
 */
export function scrollTimelineAnchorIntoView(hash: string): boolean {
  if (typeof document === "undefined") return false;
  if (!hash) return false;
  const el = document.getElementById(hash);
  if (!el) return false;
  try {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch {
    // Older browsers / jsdom may not support smooth options.
    el.scrollIntoView();
  }
  return true;
}

/**
 * Unified "View in Timeline" navigator.
 *
 * Behavior:
 *  - Cross-page → call router `navigate(href)` (or `location.assign` if no router).
 *  - Same-page → scroll the entry/section into view. If the element
 *    is not yet mounted (refetch resolving), retry ONCE after a short
 *    delay; if still missing, set `location.hash` so the browser
 *    handles it on next render.
 */
export function navigateToTimelineAnchor(
  target: TimelineAnchorTarget,
  deps: NavigateToTimelineDeps = {},
): void {
  const currentPath =
    deps.currentPath ??
    (typeof window !== "undefined" ? window.location?.pathname ?? null : null);

  if (!isSameTimelinePage(target, currentPath)) {
    if (deps.navigate) {
      deps.navigate(target.href);
      return;
    }
    const hardAssign =
      deps.assign ??
      (typeof window !== "undefined"
        ? (href: string) => window.location.assign(href)
        : null);
    if (hardAssign) hardAssign(target.href);
    return;
  }

  // Same-page: try immediate scroll.
  if (scrollTimelineAnchorIntoView(target.hash)) return;

  const retryDelayMs = deps.retryDelayMs ?? 120;
  if (retryDelayMs > 0 && typeof setTimeout !== "undefined") {
    setTimeout(() => {
      if (scrollTimelineAnchorIntoView(target.hash)) return;
      if (typeof window !== "undefined" && window.location) {
        window.location.hash = target.hash;
      }
    }, retryDelayMs);
    return;
  }

  if (typeof window !== "undefined" && window.location) {
    window.location.hash = target.hash;
  }
}
