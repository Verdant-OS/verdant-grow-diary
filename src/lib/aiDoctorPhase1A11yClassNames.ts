/**
 * AI Doctor Phase 1 — shared accessibility class names.
 *
 * Pure, dependency-free constants and helpers so every Phase 1 shortcut
 * link / checklist CTA shares one focus-visible ring and touch-target
 * recipe. No I/O, no Supabase, no AI, no device control.
 */

/** Focus-visible ring used by every Phase 1 navigation link/CTA. */
export const AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

/** Thumb-friendly minimum height for navigation links/CTAs. */
export const AI_DOCTOR_PHASE1_TOUCH_TARGET_CLASSES = "min-h-10";

/** Visually-hidden-until-focused skip link recipe (sr-only + focus override). */
export const AI_DOCTOR_PHASE1_SKIP_LINK_CLASSES =
  "sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:border focus:border-border focus:bg-card focus:px-3 focus:py-2 focus:text-xs focus:text-foreground " +
  AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES;

/**
 * Compose a single className string with the shared Phase 1 focus-visible
 * ring + thumb-friendly touch target, plus any caller-supplied extras.
 */
export function aiDoctorPhase1InteractiveClassName(extra?: string): string {
  const parts = [
    AI_DOCTOR_PHASE1_FOCUS_VISIBLE_LINK_CLASSES,
    AI_DOCTOR_PHASE1_TOUCH_TARGET_CLASSES,
  ];
  if (extra && extra.trim().length > 0) parts.push(extra.trim());
  return parts.join(" ");
}
