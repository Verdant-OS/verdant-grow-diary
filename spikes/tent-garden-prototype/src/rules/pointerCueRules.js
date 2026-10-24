// Pure pointer-cue rules. The scene asks these what to draw. No DOM.

/** Empty details panel. The first paint in index.html uses the same sentence. */
export const EMPTY_DETAILS_HINT = "Tap a pot or a label to see its recorded details.";

/**
 * Cursor and highlight for a pot or a label.
 * Only a fine pointer (mouse, trackpad) gets them. A coarse pointer does not.
 * @param {{ finePointer?:boolean, overTarget?:boolean } | null} input
 * @returns {{ cursor:"pointer"|"default", highlight:boolean }}
 */
export function pointerCue(input) {
  const on = !!input?.finePointer && !!input?.overTarget;
  return { cursor: on ? "pointer" : "default", highlight: on };
}
