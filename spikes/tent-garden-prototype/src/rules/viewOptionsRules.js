// Pure phone-toolbar rules. CSS applies the breakpoint. The page asks the key rule.

/** Controls that stay on the toolbar below 640 px. */
export const ALWAYS_VISIBLE_CONTROLS = Object.freeze([
  "view",
  "edit",
  "rotate-left",
  "rotate-right",
  "reset",
]);

/** Controls that move into the View options disclosure below 640 px. */
export const VIEW_OPTIONS_CONTROLS = Object.freeze(["tent", "pots", "animation", "list"]);

/** True when the viewport is below 640 px, so View options holds the secondary controls. */
export function usesViewOptionsDisclosure(viewportWidth) {
  const width = Number(viewportWidth);
  if (viewportWidth == null || !Number.isFinite(width)) return false;
  return width < 640;
}

/**
 * Escape closes an open View options disclosure. Any other key leaves the open state as it is.
 * @param {boolean} open
 * @param {string | null | undefined} key
 */
export function viewOptionsAfterKey(open, key) {
  if (open && key === "Escape") return false;
  return !!open;
}
