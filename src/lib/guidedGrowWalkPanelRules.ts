/**
 * GuidedGrowWalkPanel presentation rules — no React, no I/O.
 *
 * Visit-mode buttons sit in a 2-column grid on mobile (~375px). shadcn Button
 * defaults (`whitespace-nowrap`, fixed `h-9`) must be overridden so long labels
 * like "Deep Evidence Walk" wrap inside the border (GitHub #2204).
 */

export const GROW_WALK_VISIT_MODE_BUTTON_CLASSNAME =
  "h-auto min-h-9 min-w-0 whitespace-normal break-words py-1.5 text-center leading-tight" as const;
