/**
 * Bottom clearance rules for the signed-in application shell (`AppShell`) so
 * the fixed Quick Log floating action button (FAB) does not obscure readable
 * content on mobile viewports (e.g. 375px on Plant, Alerts, and Settings) or
 * desktop viewports (including high-zoom breakpoints).
 */

/** `bottom-[calc(5rem+env(safe-area-inset-bottom))]` on the mobile shell FAB. */
export const MOBILE_QUICK_LOG_FAB_BOTTOM_REM = 5;

/** `h-14` (3.5rem) on the mobile shell FAB. */
export const MOBILE_QUICK_LOG_FAB_HEIGHT_REM = 3.5;

/** `md:bottom-6` (1.5rem) on the desktop Quick Log FAB. */
export const DESKTOP_QUICK_LOG_FAB_BOTTOM_REM = 1.5;

/** `h-11` (`size="lg"`, 2.75rem) on the desktop Quick Log FAB. */
export const DESKTOP_QUICK_LOG_FAB_HEIGHT_REM = 2.75;

/** Minimum vertical gap (in rem) between the top of either FAB and the last line of content. */
export const QUICK_LOG_FAB_CONTENT_GAP_REM = 1;

/**
 * Total bottom padding (in rem) required on mobile viewports (`< md`) so the
 * last line of content scrolls clear of the mobile Quick Log FAB above `MobileNav`.
 */
export function mobileQuickLogContentClearanceRem(): number {
  return (
    MOBILE_QUICK_LOG_FAB_BOTTOM_REM +
    MOBILE_QUICK_LOG_FAB_HEIGHT_REM +
    QUICK_LOG_FAB_CONTENT_GAP_REM
  );
}

/**
 * Total bottom padding (in rem) required on desktop viewports (`md+`) so the
 * last line of content scrolls clear of `QuickLogV2Fab`.
 */
export function desktopQuickLogContentClearanceRem(): number {
  return (
    DESKTOP_QUICK_LOG_FAB_BOTTOM_REM +
    DESKTOP_QUICK_LOG_FAB_HEIGHT_REM +
    QUICK_LOG_FAB_CONTENT_GAP_REM
  );
}

/**
 * Responsive Tailwind padding-bottom classes for `AppShell`'s `#main-content`
 * region, incorporating device `safe-area-inset-bottom`.
 */
export const QUICK_LOG_FAB_CONTENT_CLEARANCE_CLASS =
  "pb-[calc(9.5rem+env(safe-area-inset-bottom))] md:pb-[calc(5.25rem+env(safe-area-inset-bottom))]";

/**
 * Responsive Tailwind padding-bottom classes for the `TentQuickLogTargetScope`
 * content wrapper inside `AppShell` so the last readable content on signed-in
 * routes (Plant, Alerts, Settings) clears the mobile Quick Log FAB before the
 * shell's legal footer.
 */
export const QUICK_LOG_FAB_PAGE_BODY_CLEARANCE_CLASS = "pb-24 md:pb-6";
