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

/** `right-4` on the mobile shell FAB. */
export const MOBILE_QUICK_LOG_FAB_RIGHT_REM = 1;

/**
 * Extra inline-end padding (rem) on scrollable page content below `md` so a
 * control at the trailing edge (for example the Timeline "All plants" filter)
 * cannot sit under the fixed FAB. Main already contributes `px-3` (0.75rem);
 * this value is the FAB's right offset plus its width, minus that padding,
 * plus the shared content gap.
 */
export function mobileQuickLogSideClearanceRem(): number {
  return (
    MOBILE_QUICK_LOG_FAB_RIGHT_REM +
    MOBILE_QUICK_LOG_FAB_HEIGHT_REM +
    QUICK_LOG_FAB_CONTENT_GAP_REM -
    0.75
  );
}

/** `pr-[4.75rem] md:pr-0` — see `mobileQuickLogSideClearanceRem`. */
export const QUICK_LOG_FAB_SIDE_CLEARANCE_CLASS = "pr-[4.75rem] md:pr-0";

/**
 * Distance from the viewport bottom to the top of `MobileNav`
 * (`bottom-2` + `h-16` + a 0.5rem gap) plus the safe-area inset.
 * Shared by Sonner and the Radix toast viewport.
 */
export const TOAST_ABOVE_MOBILE_NAV_OFFSET = "calc(5rem + env(safe-area-inset-bottom))";

/** Radix viewport: sit above the bottom nav from `sm` until `md` hides the nav. */
export const TOAST_VIEWPORT_OFFSET_CLASS =
  "sm:bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-0";
